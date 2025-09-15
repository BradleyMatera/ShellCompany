const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AgentCapabilityHarness {
  constructor(agentName, capabilities, providerConfig) {
    this.agentName = agentName;
    this.capabilities = capabilities;
    this.providerConfig = providerConfig;
    this.currentProvider = this.selectOptimalProvider();
    this.metrics = {
      tasksCompleted: 0,
      tokensUsed: 0,
      errorsEncountered: 0,
      averageResponseTime: 0,
      lastActivity: null
    };
    this.rateLimits = {
      requestsPerMinute: 0,
      tokensPerHour: 0,
      maxConcurrentRequests: 3
    };
    this.activeRequests = new Map();
    this.artifactStore = new Map();
  }

  selectOptimalProvider() {
    const availableProviders = Object.entries(this.providerConfig)
      .filter(([_, config]) => config.available && config.tokensRemaining > 1000)
      .sort((a, b) => {
        const scoreA = this.calculateProviderScore(a[1]);
        const scoreB = this.calculateProviderScore(b[1]);
        return scoreB - scoreA;
      });

    return availableProviders.length > 0 ? availableProviders[0][0] : 'claude';
  }

  calculateProviderScore(config) {
    const utilizationScore = (1 - config.utilization) * 100;
    const capabilityScore = this.capabilities.reduce((score, capability) => {
      return score + (config.capabilities[capability] || 0);
    }, 0);
    const reliabilityScore = (1 - config.errorRate) * 50;

    return utilizationScore + capabilityScore + reliabilityScore;
  }

  async checkProviderLimits() {
    const provider = this.providerConfig[this.currentProvider];
    if (!provider) return false;

    const now = Date.now();
    const minuteAgo = now - 60000;
    const hourAgo = now - 3600000;

    const recentRequests = Array.from(this.activeRequests.values())
      .filter(req => req.timestamp > minuteAgo);

    const hourlyTokens = this.metrics.tokensUsed; // Simplified - would need proper tracking

    if (recentRequests.length >= provider.limits.requestsPerMinute) {
      console.log(`${this.agentName}: Rate limit hit for ${this.currentProvider}`);
      return false;
    }

    if (hourlyTokens >= provider.limits.tokensPerHour) {
      console.log(`${this.agentName}: Token limit hit for ${this.currentProvider}`);
      return false;
    }

    return true;
  }

  async switchProvider() {
    const oldProvider = this.currentProvider;
    this.currentProvider = this.selectOptimalProvider();

    if (this.currentProvider !== oldProvider) {
      console.log(`${this.agentName}: Switched from ${oldProvider} to ${this.currentProvider}`);
      return true;
    }
    return false;
  }

  async executeTask(task) {
    const taskId = uuidv4();
    const startTime = Date.now();
    const workflowId = task.context?.workflowId || 'unknown';

    // Structured logging for Console UI
    console.log(`[AGENT:${this.agentName}] [WORKFLOW:${workflowId}] Starting task: ${task.description?.substring(0, 100)}...`);
    console.log(`[AGENT:${this.agentName}] [WORKFLOW:${workflowId}] Using provider: ${this.currentProvider}`);

    try {
      if (!(await this.checkProviderLimits())) {
        if (!(await this.switchProvider())) {
          throw new Error('No available providers with capacity');
        }
      }

      this.activeRequests.set(taskId, {
        id: taskId,
        task,
        timestamp: startTime,
        provider: this.currentProvider
      });

      const result = await this.callLLMProvider(task);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Log task completion
      console.log(`[AGENT:${this.agentName}] [WORKFLOW:${workflowId}] Task completed successfully in ${responseTime}ms`);
      console.log(`[AGENT:${this.agentName}] [WORKFLOW:${workflowId}] Tokens used: ${result.tokensUsed}, Provider: ${this.currentProvider}`);

      this.updateMetrics(responseTime, result.tokensUsed, true);
      this.activeRequests.delete(taskId);

      if (result.artifacts) {
        console.log(`[AGENT:${this.agentName}] [WORKFLOW:${workflowId}] Generated ${result.artifacts.length} artifacts`);
        for (const artifact of result.artifacts) {
          await this.storeArtifact(artifact, workflowId);
        }
      }

      return {
        success: true,
        taskId,
        result: result.content,
        artifacts: result.artifacts || [],
        metrics: {
          responseTime,
          tokensUsed: result.tokensUsed,
          provider: this.currentProvider
        }
      };

    } catch (error) {
      this.updateMetrics(Date.now() - startTime, 0, false);
      this.activeRequests.delete(taskId);

      if (error.message.includes('rate limit') || error.message.includes('quota')) {
        await this.switchProvider();
      }

      return {
        success: false,
        taskId,
        error: error.message,
        metrics: {
          responseTime: Date.now() - startTime,
          tokensUsed: 0,
          provider: this.currentProvider
        }
      };
    }
  }

  async callLLMProvider(task) {
    const provider = this.providerConfig[this.currentProvider];
    if (!provider) throw new Error(`Provider ${this.currentProvider} not configured`);

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`
    };

    if (this.currentProvider === 'anthropic') {
      headers['anthropic-version'] = '2023-06-01';
    }

    const requestBody = this.buildProviderRequest(task, this.currentProvider);

    const response = await axios.post(provider.endpoint, requestBody, { headers });

    return this.parseProviderResponse(response.data, this.currentProvider);
  }

  buildProviderRequest(task, provider) {
    const basePrompt = `You are ${this.agentName}, specialized in: ${this.capabilities.join(', ')}.
Task: ${task.description}
Context: ${JSON.stringify(task.context || {})}

Please provide a detailed response with any artifacts that should be created.`;

    switch (provider) {
      case 'anthropic':
        return {
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4000,
          messages: [{ role: 'user', content: basePrompt }]
        };

      case 'openai':
        return {
          model: 'gpt-4-turbo-preview',
          max_tokens: 4000,
          messages: [{ role: 'user', content: basePrompt }]
        };

      case 'google':
        return {
          contents: [{ parts: [{ text: basePrompt }] }],
          generationConfig: { maxOutputTokens: 4000 }
        };

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  parseProviderResponse(data, provider) {
    let content = '';
    let tokensUsed = 0;
    let artifacts = [];

    switch (provider) {
      case 'anthropic':
        content = data.content?.[0]?.text || '';
        tokensUsed = data.usage?.output_tokens || 0;
        break;

      case 'openai':
        content = data.choices?.[0]?.message?.content || '';
        tokensUsed = data.usage?.total_tokens || 0;
        break;

      case 'google':
        content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        tokensUsed = data.usageMetadata?.totalTokenCount || 0;
        break;
    }

    artifacts = this.extractArtifacts(content);

    return { content, tokensUsed, artifacts };
  }

  extractArtifacts(content) {
    const artifacts = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[1] || 'text';
      const code = match[2];

      artifacts.push({
        type: 'code',
        language,
        content: code,
        id: uuidv4(),
        timestamp: Date.now()
      });
    }

    const fileRegex = /FILE:\s*([^\n]+)\n([\s\S]*?)(?=\n\n|\n$|$)/g;
    while ((match = fileRegex.exec(content)) !== null) {
      artifacts.push({
        type: 'file',
        filename: match[1],
        content: match[2],
        id: uuidv4(),
        timestamp: Date.now()
      });
    }

    return artifacts;
  }

  async storeArtifact(artifact, workflowId = 'unknown') {
    const artifactPath = path.join(__dirname, '../artifacts', this.agentName.toLowerCase());
    await fs.mkdir(artifactPath, { recursive: true });

    const filename = artifact.filename || `${artifact.id}.${artifact.language || 'txt'}`;
    const filepath = path.join(artifactPath, filename);

    await fs.writeFile(filepath, artifact.content);

    this.artifactStore.set(artifact.id, {
      ...artifact,
      filepath,
      stored: true
    });

    // Structured logging for Console UI
    console.log(`[AGENT:${this.agentName}] [WORKFLOW:${workflowId}] Stored artifact: ${filename} (${artifact.content.length} bytes)`);
  }

  updateMetrics(responseTime, tokensUsed, success) {
    this.metrics.tasksCompleted += success ? 1 : 0;
    this.metrics.tokensUsed += tokensUsed;
    this.metrics.errorsEncountered += success ? 0 : 1;

    const totalTasks = this.metrics.tasksCompleted + this.metrics.errorsEncountered;
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (totalTasks - 1) + responseTime) / totalTasks;

    this.metrics.lastActivity = Date.now();
  }

  getStatus() {
    return {
      agent: this.agentName,
      currentProvider: this.currentProvider,
      activeRequests: this.activeRequests.size,
      metrics: this.metrics,
      capabilities: this.capabilities,
      artifacts: Array.from(this.artifactStore.keys()).length
    };
  }
}

// Specialized agent harnesses
class NovaHarness extends AgentCapabilityHarness {
  constructor(providerConfig) {
    super('Nova', ['frontend', 'react', 'typescript', 'ui-components'], providerConfig);
  }

  async createComponent(specs) {
    return await this.executeTask({
      description: `Create a React component with the following specifications: ${JSON.stringify(specs)}.

      Output the complete code for the component in a markdown code block.
      Output the complete CSS in a markdown code block.
      Log every file creation event in the response as: FILE: <filename>.js or FILE: <filename>.css followed by the file content.
      Save the component as a .js file in server/artifacts/nova/. 
      The file should be named according to the component (e.g., AboutUsPage.js).
      Include any required CSS as a separate .css file in the same directory.
      Respond ONLY with code blocks and file logs, not with planning or analysis.`,
      context: { type: 'component_creation', specs }
    });
  }

  async optimizePerformance(codebase) {
    return await this.executeTask({
      description: `Analyze and optimize the performance of this React codebase`,
      context: { type: 'performance_optimization', codebase }
    });
  }
}

class ZephyrHarness extends AgentCapabilityHarness {
  constructor(providerConfig) {
    super('Zephyr', ['backend', 'apis', 'databases', 'microservices'], providerConfig);
  }

  async createAPI(specs) {
    return await this.executeTask({
      description: `Create an API endpoint with the following specifications: ${JSON.stringify(specs)}`,
      context: { type: 'api_creation', specs }
    });
  }

  async optimizeDatabase(schema) {
    return await this.executeTask({
      description: `Analyze and optimize this database schema and queries`,
      context: { type: 'database_optimization', schema }
    });
  }
}

class CipherHarness extends AgentCapabilityHarness {
  constructor(providerConfig) {
    super('Cipher', ['security', 'encryption', 'authentication', 'vulnerability-assessment'], providerConfig);
  }

  async securityAudit(codebase) {
    return await this.executeTask({
      description: `Perform a comprehensive security audit of this codebase`,
      context: { type: 'security_audit', codebase }
    });
  }

  async implementAuth(requirements) {
    return await this.executeTask({
      description: `Implement authentication system with requirements: ${JSON.stringify(requirements)}`,
      context: { type: 'auth_implementation', requirements }
    });
  }
}

class SageHarness extends AgentCapabilityHarness {
  constructor(providerConfig) {
    super('Sage', ['devops', 'infrastructure', 'deployment', 'monitoring'], providerConfig);
  }

  async setupInfrastructure(requirements) {
    return await this.executeTask({
      description: `Set up infrastructure with requirements: ${JSON.stringify(requirements)}`,
      context: { type: 'infrastructure_setup', requirements }
    });
  }

  async createDeploymentPipeline(config) {
    return await this.executeTask({
      description: `Create CI/CD pipeline with configuration: ${JSON.stringify(config)}`,
      context: { type: 'pipeline_creation', config }
    });
  }
}

module.exports = {
  AgentCapabilityHarness,
  NovaHarness,
  ZephyrHarness,
  CipherHarness,
  SageHarness
};
