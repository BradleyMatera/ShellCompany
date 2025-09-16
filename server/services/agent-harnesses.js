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

      // If the provider returned textual content but no artifacts were extracted,
      // create a lightweight 'report' artifact so the frontend has something to show
      // (useful for brainstorms and plain-text outputs).
      if ((!result.artifacts || result.artifacts.length === 0) && result.content && result.content.trim().length > 0) {
        const textArtifact = {
          id: uuidv4(),
          type: 'report',
          title: `${this.agentName} output - ${workflowId}`,
          preview: result.content.length > 200 ? result.content.substring(0, 200) + '...' : result.content,
          content: result.content,
          timestamp: Date.now()
        };

        // persist artifact to agent's artifact store and on-disk
        await this.storeArtifact(textArtifact, workflowId);

        // ensure result.artifacts array includes the generated artifact
        result.artifacts = result.artifacts || [];
        result.artifacts.push(textArtifact);
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

    try {
      const response = await axios.post(provider.endpoint, requestBody, { headers, timeout: 120000 });
      // normalize response data shape before parsing
      const data = response && response.data ? response.data : {};
      return this.parseProviderResponse(data, this.currentProvider);
    } catch (err) {
      console.warn(`[AGENT:${this.agentName}] Provider call failed for ${this.currentProvider}:`, err && err.message);
      // Return a safe default result object so executeTask can continue gracefully
      return { content: '', tokensUsed: 0, artifacts: [] };
    }
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
    // Defensive parsing: coerce to expected shapes and avoid throwing on missing fields
    let content = '';
    let tokensUsed = 0;
    let artifacts = [];

    try {
      switch (provider) {
        case 'anthropic':
          // data.content may be string or array; handle both
          if (Array.isArray(data.content) && data.content.length > 0) {
            content = String(data.content[0].text || '');
          } else if (typeof data.content === 'string') {
            content = data.content;
          } else {
            content = '';
          }
          tokensUsed = Number(data.usage?.output_tokens || 0) || 0;
          break;

        case 'openai':
          // choices may be missing or in unexpected format
          if (Array.isArray(data.choices) && data.choices.length > 0) {
            const choice = data.choices[0];
            content = String(choice?.message?.content || choice?.text || '');
          } else if (typeof data.text === 'string') {
            content = data.text;
          }
          tokensUsed = Number(data.usage?.total_tokens || 0) || 0;
          break;

        case 'google':
          // candidates -> content -> parts is deep; guard every access
          if (Array.isArray(data.candidates) && data.candidates.length > 0) {
            const cand = data.candidates[0];
            if (cand && cand.content && Array.isArray(cand.content.parts) && cand.content.parts.length > 0) {
              content = String(cand.content.parts[0].text || '');
            } else if (typeof cand?.content === 'string') {
              content = cand.content;
            }
          }
          tokensUsed = Number(data.usageMetadata?.totalTokenCount || 0) || 0;
          break;

        default:
          content = typeof data === 'string' ? data : JSON.stringify(data || {});
          tokensUsed = 0;
      }
    } catch (e) {
      console.warn(`[AGENT:${this.agentName}] Error parsing provider response for ${provider}:`, e && e.message);
      content = '';
      tokensUsed = 0;
    }

    // Ensure content is a string
    content = content == null ? '' : String(content);

    // Extract artifacts defensively; if extractArtifacts throws, catch it
    try {
      artifacts = Array.isArray(this.extractArtifacts(content)) ? this.extractArtifacts(content) : [];
    } catch (e) {
      console.warn(`[AGENT:${this.agentName}] extractArtifacts failed:`, e && e.message);
      artifacts = [];
    }

    // Normalize return object
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
    const crypto = require('crypto');
    const { Artifact, Workflow } = require('../models');

    const artifactPath = path.join(__dirname, '../artifacts', this.agentName.toLowerCase());
    await fs.mkdir(artifactPath, { recursive: true });

    const filename = artifact.filename || `${artifact.id}.${artifact.language || 'txt'}`;
    const filepath = path.join(artifactPath, filename);

    // Ensure content is a string or buffer
    const contentBuf = Buffer.isBuffer(artifact.content) ? artifact.content : Buffer.from(String(artifact.content || ''), 'utf8');

    // Compute sha256 to dedupe
    const sha256 = crypto.createHash('sha256').update(contentBuf).digest('hex');

    // If artifact with sha exists in DB, link instead of duplicating
    let dbArtifact = null;
    try {
      dbArtifact = await Artifact.findOne({ where: { sha256 } });
    } catch (e) {
      console.warn('[AGENT] Artifact DB lookup failed:', e && e.message);
    }

    if (dbArtifact) {
      // Already exists: create an entry in local store linking to existing artifact id
      this.artifactStore.set(dbArtifact.id, {
        ...artifact,
        filepath: dbArtifact.path,
        stored: true,
        sha256: dbArtifact.sha256
      });

      console.log(`[AGENT:${this.agentName}] [WORKFLOW:${workflowId}] Linked to existing artifact: ${dbArtifact.path} (sha256=${sha256})`);
      return dbArtifact;
    }

    // Write file to disk
    await fs.writeFile(filepath, contentBuf);

    // Persist artifact row with lineage
    const bytes = contentBuf.length;
    const lineage = {
      created_by: this.agentName,
      requested_by: artifact.requestedBy || null,
      workflow_id: workflowId
    };

    try {
      // Try to determine project_id from workflow metadata if possible
      let projectId = null;
      if (workflowId && workflowId !== 'unknown') {
        try {
          const wf = await Workflow.findByPk(workflowId);
          projectId = wf && wf.metadata && wf.metadata.project_id ? wf.metadata.project_id : null;
        } catch (e) {
          // ignore - best-effort
        }
      }

      // Fallback to default project if not found
      if (!projectId) projectId = artifact.projectId || 'unknown';

      dbArtifact = await Artifact.create({
        project_id: projectId,
        path: filepath,
        sha256,
        bytes,
        produced_by_task: artifact.produced_by_task || null,
        workflow_id: workflowId === 'unknown' ? null : workflowId,
        created_by: lineage.created_by,
        requested_by: lineage.requested_by,
        metadata: artifact.metadata || null
      });

      this.artifactStore.set(dbArtifact.id, {
        ...artifact,
        id: dbArtifact.id,
        filepath,
        stored: true,
        sha256
      });

      console.log(`[AGENT:${this.agentName}] [WORKFLOW:${workflowId}] Stored and persisted artifact: ${filename} (${bytes} bytes) -> DB ID ${dbArtifact.id}`);

      return dbArtifact;
    } catch (err) {
      console.warn('[AGENT] Failed to persist Artifact row:', err && err.message);
      // still keep artifact on disk and local store
      this.artifactStore.set(artifact.id, {
        ...artifact,
        filepath,
        stored: true,
        sha256
      });

      return null;
    }
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
