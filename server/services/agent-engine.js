const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const { User, Project, Connection, EnvVar, Audit } = require('../models');
const providerMonitor = require('./provider-monitor');

// Import agent roster for specialized agent handling
let agentRoster;
try {
  agentRoster = require('./agent-roster');
} catch (e) {
  console.warn('Agent roster not available:', e.message);
}

class AgentEngine {
  constructor() {
    this.models = {
      openai: {
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        priority: 1,
        rateLimits: { rpm: 3500, tpm: 90000 },
        dailyBudget: parseFloat(process.env.OPENAI_DAILY_BUDGET) || 50
      },
      openai_project: {
        name: 'OpenAI (Project)',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        priority: 2,
        rateLimits: { rpm: 3500, tpm: 90000 },
        dailyBudget: parseFloat(process.env.OPENAI_PROJECT_DAILY_BUDGET) || 50
      },
      claude: {
        name: 'Claude',
        endpoint: process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/messages',
        priority: 3,
        rateLimits: { rpm: 5000, tpm: 200000 },
        dailyBudget: parseFloat(process.env.CLAUDE_DAILY_BUDGET) || 100
      },
      gemini: {
        name: 'Gemini',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        priority: 4,
        rateLimits: { rpm: 60, tpm: 32000 },
        dailyBudget: parseFloat(process.env.GEMINI_DAILY_BUDGET) || 25
      },
      xai: {
        name: 'xAI',
        endpoint: 'https://api.x.ai/v1/chat/completions',
        priority: 5,
        rateLimits: { rpm: 300, tpm: 60000 },
        dailyBudget: parseFloat(process.env.XAI_DAILY_BUDGET) || 25
      }
    };

    this.activeJobs = new Map();
    this.jobQueue = [];
    this.usageStats = new Map();
    this.isProcessing = false;
  }

  // Model selection and fallback logic with intent-aware provider routing (and key-aware)
  async selectModel(requirements = {}) {
    const { preferredModel, intent = 'general' } = requirements;

    const policy = {
      general: ['openai', 'claude', 'gemini', 'xai', 'openai_project'],
      reasoning: ['claude', 'openai', 'gemini', 'xai', 'openai_project'],
      coding: ['openai', 'claude', 'gemini', 'xai', 'openai_project'],
      research: ['gemini', 'openai', 'claude', 'xai', 'openai_project']
    };

    // honor explicit preferred provider if available
    if (preferredModel && this.models[preferredModel]) {
      if (providerMonitor.hasKey(preferredModel)) {
        const available = await this.checkModelAvailability(preferredModel);
        if (available) return preferredModel;
      }
    }

    const order = policy[intent] || policy.general;
    for (const provider of order) {
      if (!providerMonitor.hasKey(provider)) continue;
      const available = await this.checkModelAvailability(provider);
      if (available) return provider;
    }

    // Fallback to priority order
    for (const [modelKey, meta] of Object.entries(this.models).sort((a, b) => a[1].priority - b[1].priority)) {
      if (!providerMonitor.hasKey(modelKey)) continue;
      const available = await this.checkModelAvailability(modelKey);
      if (available) return modelKey;
    }

    throw new Error('No available AI models within budget and rate limits');
  }

  async checkModelAvailability(modelKey) {
    const model = this.models[modelKey];
    if (!model) return false;

    const today = new Date().toISOString().split('T')[0];
    const stats = this.usageStats.get(`${modelKey}-${today}`) || { cost: 0, requests: 0, tokens: 0 };

    // Check daily budget
    if (stats.cost >= model.dailyBudget) return false;

    // Check rate limits (simplified - would need Redis for distributed systems)
    const currentMinute = Math.floor(Date.now() / 60000);
    const currentMinuteStats = this.usageStats.get(`${modelKey}-${currentMinute}`) || { requests: 0 };
    if (currentMinuteStats.requests >= Math.floor(model.rateLimits.rpm / 60)) return false;

    return true;
  }

  // Core agent execution
  async executeTask(taskData) {
    const {
      id,
      userId,
      projectId,
      prompt,
      tools = ['filesystem', 'git', 'command'],
      constraints = {},
      priority = 'normal',
      assignedAgent = null
    } = taskData;

    const jobId = crypto.randomUUID();

    try {
      // Initialize job
      const job = {
        id: jobId,
        taskId: id,
        userId,
        projectId,
        status: 'running',
        startTime: new Date(),
        model: null,
        cost: 0,
        tokens: { input: 0, output: 0 },
        logs: [],
        artifacts: [],
        checkpoint: null
      };

      this.activeJobs.set(jobId, job);

      // Select provider/model variant based on intent
      const modelReq = constraints.model || {};
      const modelKey = await this.selectModel(modelReq);
      job.model = modelKey;
      // Cost-mode aware selection via ProviderMonitor; allow explicit override via constraints
      const chosen = modelReq.variant || providerMonitor.chooseModel(modelKey) || providerMonitor.getPreferredModel(modelKey);
      job.modelVariant = chosen || (
        modelKey === 'openai' ? 'gpt-4o-mini' :
        modelKey === 'openai_project' ? 'gpt-4o-mini' :
        modelKey === 'claude' ? 'claude-sonnet-4-20250514' :
        modelKey === 'gemini' ? 'models/gemini-1.5-flash-latest' :
        modelKey === 'xai' ? 'grok-3' : null
      );

      this.log(job, 'info', `Starting task with ${this.models[modelKey].name}`);

      // Load project context
      const context = await this.loadProjectContext(userId, projectId);

      // Get agent-specific system prompt and per-agent credentials
      let systemPrompt;
      let agentCreds = null;
      if (assignedAgent && agentRoster) {
        const agent = agentRoster.getAgent(assignedAgent);
        if (agent) {
          systemPrompt = this.buildAgentSystemPrompt(agent, tools, constraints, context);
          job.agentName = agent.name;
          job.agentTitle = agent.title;
          // try to retrieve persistent creds from DB if present
          try {
            const { Agent } = require('../models');
            const row = await Agent.findByPk(assignedAgent);
            agentCreds = row?.credentials || null;
          } catch {}
        } else {
          systemPrompt = this.buildSystemPrompt(tools, constraints, context);
        }
      } else {
        systemPrompt = this.buildSystemPrompt(tools, constraints, context);
      }

      // Execute with selected model
      // temporarily attach per-agent creds on job for provider key lookup
      job.agentCredentials = agentCreds;
      // expose current job so provider methods can read agentCredentials
      this.currentJob = job;
      const result = await this.callModel(modelKey, systemPrompt, prompt, tools, job);
      this.currentJob = null;

      // Process result and execute actions
      const executionResult = await this.processResult(result, job, tools, context);

      job.status = 'completed';
      job.endTime = new Date();
      job.result = executionResult;

      this.log(job, 'success', `Task completed successfully`);

      // Release agent if one was assigned
      if (assignedAgent && agentRoster) {
        await agentRoster.releaseAgent(assignedAgent, id, executionResult);
      }

      // Audit log
      await Audit.create({
        actor_id: userId,
        action: 'AGENT_TASK_COMPLETED',
        target: 'task',
        target_id: id.toString(),
        metadata: {
          jobId,
          model: modelKey,
          cost: job.cost,
          tokens: job.tokens,
          duration: job.endTime - job.startTime,
          assignedAgent: assignedAgent,
          agentName: job.agentName
        },
        ip_address: '127.0.0.1'
      });

      return job;

    } catch (error) {
      const job = this.activeJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
        job.endTime = new Date();
        this.log(job, 'error', `Task failed: ${error.message}`);
      }
      throw error;
    }
  }

  async callModel(modelKey, systemPrompt, userPrompt, tools, job) {
    const model = this.models[modelKey];

    try {
      let response;

      switch (modelKey) {
        case 'claude':
          response = await this.callClaude(systemPrompt, userPrompt, tools, job.modelVariant);
          break;
        case 'openai':
        case 'openai_project':
        case 'xai':
          response = await this.callOpenAI(systemPrompt, userPrompt, tools, job.modelVariant);
          break;
        case 'gemini':
          response = await this.callGemini(systemPrompt, userPrompt, tools, job.modelVariant);
          break;
        default:
          throw new Error(`Unknown model: ${modelKey}`);
      }

      // Update usage stats
      this.updateUsageStats(modelKey, response.usage);
      job.cost += response.cost || 0;
      job.tokens.input += response.usage?.input || 0;
      job.tokens.output += response.usage?.output || 0;

      return response;

    } catch (error) {
      this.log(job, 'error', `Model call failed: ${error.message}`);

      // Try fallback providers (respecting priorities and available keys)
      const fallbackModels = Object.keys(this.models)
        .filter(k => k !== modelKey)
        .sort((a, b) => this.models[a].priority - this.models[b].priority);

      for (const fallback of fallbackModels) {
        if (!providerMonitor.hasKey(fallback)) continue;
        const available = await this.checkModelAvailability(fallback);
        if (available) {
          this.log(job, 'warning', `Falling back to ${this.models[fallback].name}`);
          job.model = fallback;
          // choose a variant for the new provider (cost-mode aware)
          const nextVariant =
            providerMonitor.chooseModel(fallback) ||
            providerMonitor.getPreferredModel(fallback) ||
            (fallback === 'openai' || fallback === 'openai_project' ? 'gpt-4o-mini' :
             fallback === 'claude' ? 'claude-sonnet-4-20250514' :
             fallback === 'gemini' ? 'models/gemini-1.5-flash-latest' :
             fallback === 'xai' ? 'grok-3' : null);
          job.modelVariant = nextVariant;
          return this.callModel(fallback, systemPrompt, userPrompt, tools, job);
        }
      }

      throw new Error(`All models failed. Last error: ${error.message}`);
    }
  }

  async callClaude(systemPrompt, userPrompt, tools, variant) {
    const t0 = Date.now();
    let token = null;
    let release = null;
    try {
      // Prefer per-agent credentials when present on the job
      try {
        if (arguments.length >= 4 && typeof arguments[3] === 'string') {
          // no-op
        }
        const jobCtx = this.activeJobs?.get?.(arguments?.[4]?.id) || null;
      } catch {}
      try {
        if (!token && typeof (this.currentJob || {}) === 'object' && this.currentJob.agentCredentials) {
          token = this.currentJob.agentCredentials?.claude || null;
        }
      } catch {}
      try {
        if (!token) {
          const connection = await Connection.findOne({ where: { provider: 'claude', status: 'active' } });
          if (connection) token = connection.getToken();
        }
      } catch {}
      if (!token) token = process.env.CLAUDE_API_KEY;
      if (!token) {
        throw new Error('Claude API key not configured (no connection or CLAUDE_API_KEY)');
      }
      const limits = require('./provider-limits');
      limits.ensure('claude', token, this.models.claude.rateLimits || {});
      if (!limits.canStart('claude', token)) {
        throw new Error('Claude capacity saturated');
      }
      release = limits.acquire('claude', token);
      const response = await fetch(this.models.claude.endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': token,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: variant || providerMonitor.getPreferredModel('claude') || 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          tools: this.mapToolsForClaude(tools)
        })
      });

      const latencyMs = Date.now() - t0;

      if (!response.ok) {
        try { providerMonitor.recordCall({ provider: 'claude', model: variant || 'claude-3-5-sonnet-latest', latencyMs, tokens: { input: 0, output: 0 }, success: false, statusCode: response.status, error: `HTTP ${response.status}`, agentName: this.currentJob?.agentName }); } catch {}
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const out = {
        content: data.content?.[0]?.text || '',
        toolCalls: data.content?.filter(c => c.type === 'tool_use') || [],
        usage: data.usage,
        cost: this.calculateClaudeCost(data.usage)
      };

      try {
        providerMonitor.recordCall({
          provider: 'claude',
          model: variant || 'claude-3-5-sonnet-latest',
          latencyMs,
          tokens: { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 },
          success: true,
          statusCode: response.status,
          agentName: this.currentJob?.agentName
        });
      } catch {}

      release && release();
      return out;
    } catch (err) {
      const latencyMs = Date.now() - t0;
      try { providerMonitor.recordCall({ provider: 'claude', model: variant || 'claude-3-5-sonnet-latest', latencyMs, tokens: { input: 0, output: 0 }, success: false, error: err.message, agentName: this.currentJob?.agentName }); } catch {}
      if (release) try { release(); } catch {}
      throw err;
    }
  }

  async callOpenAI(systemPrompt, userPrompt, tools, variant) {
    const t0 = Date.now();
    let token = null;
    let release = null;
    // Determine actual provider ('openai', 'openai_project', or 'xai')
    const providerKey = (this.currentJob && this.currentJob.model) ? this.currentJob.model : 'openai';
    const envMap = { openai: 'OPENAI_API_KEY', openai_project: 'OPENAI_PROJECT_API_KEY', xai: 'X_AI_API_KEY' };
    const nameMap = { openai: 'OpenAI', openai_project: 'OpenAI (Project)', xai: 'xAI' };
    try {
      try {
        if (!token && this.currentJob?.agentCredentials) {
          token = this.currentJob.agentCredentials[providerKey] ||
                  (providerKey === 'openai_project' ? this.currentJob.agentCredentials.openai : null);
        }
        if (!token) {
          const connection = await Connection.findOne({ where: { provider: providerKey, status: 'active' } });
          if (connection) token = connection.getToken();
        }
      } catch {}
      if (!token) {
        const envVar = envMap[providerKey] || 'OPENAI_API_KEY';
        token = process.env[envVar];
        if (!token) {
          throw new Error(`${nameMap[providerKey] || 'Provider'} API key not configured (no connection or ${envVar})`);
        }
      }
      const limits = require('./provider-limits');
      limits.ensure(providerKey, token, (this.models[providerKey]?.rateLimits || this.models.openai.rateLimits || {}));
      if (!limits.canStart(providerKey, token)) {
        throw new Error(`${nameMap[providerKey] || 'Provider'} capacity saturated`);
      }
      release = limits.acquire(providerKey, token);

      const endpoint = (this.models[providerKey]?.endpoint) || this.models.openai.endpoint;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: variant || providerMonitor.getPreferredModel(providerKey) || (providerKey === 'xai' ? 'grok-3' : 'gpt-4o-mini'),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          tools: this.mapToolsForOpenAI(tools),
          tool_choice: 'auto'
        })
      });

      const latencyMs = Date.now() - t0;

      if (!response.ok) {
        try { providerMonitor.recordCall({ provider: providerKey, model: variant || (providerKey === 'xai' ? 'grok-3' : 'gpt-4o-mini'), latencyMs, tokens: { input: 0, output: 0 }, success: false, statusCode: response.status, error: `HTTP ${response.status}`, agentName: this.currentJob?.agentName }); } catch {}
        throw new Error(`${nameMap[providerKey] || 'Provider'} API error: ${response.status}`);
      }

      const data = await response.json();
      const out = {
        content: data.choices?.[0]?.message?.content || '',
        toolCalls: data.choices?.[0]?.message?.tool_calls || [],
        usage: data.usage,
        cost: this.calculateOpenAICost(data.usage)
      };

      try {
        providerMonitor.recordCall({
          provider: providerKey,
          model: variant || (providerKey === 'xai' ? 'grok-3' : 'gpt-4o-mini'),
          latencyMs,
          tokens: { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0 },
          success: true,
          statusCode: response.status,
          agentName: this.currentJob?.agentName
        });
      } catch {}

      release && release();
      return out;
    } catch (err) {
      const latencyMs = Date.now() - t0;
      try { providerMonitor.recordCall({ provider: providerKey, model: variant || (providerKey === 'xai' ? 'grok-3' : 'gpt-4o-mini'), latencyMs, tokens: { input: 0, output: 0 }, success: false, error: err.message, agentName: this.currentJob?.agentName }); } catch {}
      if (release) try { release(); } catch {}
      throw err;
    }
  }

  async callGemini(systemPrompt, userPrompt, tools, variant) {
    const t0 = Date.now();
    let token = null;
    let release = null;
    try {
      try {
        if (!token && this.currentJob?.agentCredentials) token = this.currentJob.agentCredentials.gemini;
        if (!token) {
          const connection = await Connection.findOne({ where: { provider: 'gemini', status: 'active' } });
          if (connection) token = connection.getToken();
        }
      } catch {}
      if (!token) token = process.env.GEMINI_API_KEY;
      if (!token) {
        throw new Error('Gemini API key not configured (no connection or GEMINI_API_KEY)');
      }
      const limits = require('./provider-limits');
      limits.ensure('gemini', token, this.models.gemini.rateLimits || {});
      if (!limits.canStart('gemini', token)) {
        throw new Error('Gemini capacity saturated');
      }
      release = limits.acquire('gemini', token);
      const modelId = (variant && !String(variant).startsWith('models/')) ? `models/${variant}` : (variant || providerMonitor.getPreferredModel('gemini') || 'models/gemini-1.5-pro-latest');
      const url = `https://generativelanguage.googleapis.com/v1beta/${modelId}:generateContent?key=${token}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\nUser: ${userPrompt}` }]
          }],
          tools: this.mapToolsForGemini(tools)
        })
      });

      const latencyMs = Date.now() - t0;

      if (!response.ok) {
        try { providerMonitor.recordCall({ provider: 'gemini', model: variant || 'gemini-1.5-flash', latencyMs, tokens: { input: 0, output: 0 }, success: false, statusCode: response.status, error: `HTTP ${response.status}`, agentName: this.currentJob?.agentName }); } catch {}
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const out = {
        content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
        toolCalls: data.candidates?.[0]?.content?.parts?.filter(p => p.functionCall) || [],
        usage: data.usageMetadata,
        cost: this.calculateGeminiCost(data.usageMetadata)
      };

      try {
        providerMonitor.recordCall({
          provider: 'gemini',
          model: variant || 'gemini-1.5-flash',
          latencyMs,
          tokens: { input: data.usageMetadata?.promptTokenCount || 0, output: data.usageMetadata?.candidatesTokenCount || 0 },
          success: true,
          statusCode: response.status,
          agentName: this.currentJob?.agentName
        });
      } catch {}

      release && release();
      return out;
    } catch (err) {
      const latencyMs = Date.now() - t0;
      try { providerMonitor.recordCall({ provider: 'gemini', model: variant || 'gemini-1.5-flash', latencyMs, tokens: { input: 0, output: 0 }, success: false, error: err.message, agentName: this.currentJob?.agentName }); } catch {}
      if (release) try { release(); } catch {}
      throw err;
    }
  }

  // Tool execution
  async processResult(result, job, allowedTools, context) {
    const { toolCalls = [] } = result;
    const executionResults = [];

    for (const toolCall of toolCalls) {
      try {
        const toolResult = await this.executeTool(toolCall, allowedTools, context, job);
        executionResults.push(toolResult);
        job.artifacts.push(toolResult);
      } catch (error) {
        this.log(job, 'error', `Tool execution failed: ${error.message}`);
        executionResults.push({ tool: toolCall.name, error: error.message });
      }
    }

    return {
      response: result.content,
      toolResults: executionResults,
      artifacts: job.artifacts
    };
  }

  async executeTool(toolCall, allowedTools, context, job) {
    const { name, input } = this.normalizeToolCall(toolCall);

    if (!allowedTools.includes(name)) {
      throw new Error(`Tool ${name} not allowed`);
    }

    this.log(job, 'info', `Executing tool: ${name}`);

    switch (name) {
      case 'filesystem':
        return this.executeFilesystemTool(input, context, job);
      case 'git':
        return this.executeGitTool(input, context, job);
      case 'command':
        return this.executeCommandTool(input, context, job);
      case 'http':
        return this.executeHttpTool(input, context, job);
      case 'database':
        return this.executeDatabaseTool(input, context, job);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  async executeFilesystemTool(input, context, job) {
    const { operation, path: filePath, content, encoding = 'utf8' } = input;
    const safePath = path.resolve(context.projectPath, filePath || '');

    // Security check - ensure path is within project directory
    if (!safePath.startsWith(context.projectPath)) {
      throw new Error('Path outside project directory not allowed');
    }

    switch (operation) {
      case 'read':
        const fileContent = await fs.readFile(safePath, encoding);
        return { tool: 'filesystem', operation: 'read', path: filePath, content: fileContent };

      case 'write':
        await fs.writeFile(safePath, content, encoding);
        return { tool: 'filesystem', operation: 'write', path: filePath, success: true };

      case 'append':
        await fs.appendFile(safePath, content, encoding);
        return { tool: 'filesystem', operation: 'append', path: filePath, success: true };

      case 'list':
        const items = await fs.readdir(safePath);
        return { tool: 'filesystem', operation: 'list', path: filePath, items };

      case 'delete':
        await fs.unlink(safePath);
        return { tool: 'filesystem', operation: 'delete', path: filePath, success: true };

      default:
        throw new Error(`Unknown filesystem operation: ${operation}`);
    }
  }

  async executeGitTool(input, context, job) {
    const { operation, ...args } = input;

    return new Promise((resolve, reject) => {
      let command;
      switch (operation) {
        case 'status':
          command = 'git status --porcelain';
          break;
        case 'add':
          command = `git add ${args.files || '.'}`;
          break;
        case 'commit':
          command = `git commit -m "${args.message}"`;
          break;
        case 'push':
          command = `git push ${args.remote || 'origin'} ${args.branch || 'main'}`;
          break;
        case 'pull':
          command = `git pull ${args.remote || 'origin'} ${args.branch || 'main'}`;
          break;
        case 'branch':
          command = args.name ? `git checkout -b ${args.name}` : 'git branch';
          break;
        case 'checkout':
          command = `git checkout ${args.branch}`;
          break;
        default:
          reject(new Error(`Unknown git operation: ${operation}`));
          return;
      }

      exec(command, { cwd: context.projectPath }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Git command failed: ${error.message}`));
        } else {
          resolve({ tool: 'git', operation, stdout, stderr, success: true });
        }
      });
    });
  }

  async executeCommandTool(input, context, job) {
    const { command, args = [], timeout = 30000 } = input;

    // Security whitelist
    const allowedCommands = ['npm', 'yarn', 'node', 'python', 'pip', 'docker', 'make', 'echo', 'ls', 'cat', 'grep'];
    if (!allowedCommands.includes(command)) {
      throw new Error(`Command ${command} not allowed`);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd: context.projectPath,
        timeout,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          tool: 'command',
          command,
          args,
          exitCode: code,
          stdout,
          stderr,
          success: code === 0
        });
      });

      proc.on('error', (error) => {
        reject(new Error(`Command execution failed: ${error.message}`));
      });

      // Timeout handling
      setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  async executeHttpTool(input, context, job) {
    const { url, method = 'GET', headers = {}, body } = input;

    const response = await fetch(url, {
      method,
      headers: {
        'User-Agent': 'ShellCompany-Agent',
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const responseBody = await response.text();

    return {
      tool: 'http',
      url,
      method,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
      success: response.ok
    };
  }

  // Helper methods
  buildSystemPrompt(tools, constraints, context) {
    const basePrompt = `You are an autonomous AI agent working for ShellCompany. You have access to the following tools: ${tools.join(', ')}.

Project Context:
- Project: ${context.projectName}
- Path: ${context.projectPath}
- Environment: ${context.environment}

Available Tools:
${tools.map(tool => this.getToolDescription(tool)).join('\n')}

Constraints:
${Object.entries(constraints).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

Always think step by step and explain your reasoning. Be precise and safe in your operations.`;

    return basePrompt;
  }

  buildAgentSystemPrompt(agent, tools, constraints, context) {
    const agentPrompt = `${agent.systemPrompt}

Project Context:
- Project: ${context.projectName}
- Path: ${context.projectPath}
- Environment: ${context.environment}

Your Role: ${agent.title} (${agent.name})
Department: ${agent.department}
Specialization: ${agent.specialization}

Your Skills: ${agent.skills.join(', ')}

Available Tools:
${tools.map(tool => this.getToolDescription(tool)).join('\n')}

Constraints:
${Object.entries(constraints).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

As ${agent.name}, use your specialized knowledge in ${agent.specialization} to complete this task. Apply your expertise in ${agent.skills.join(', ')} and always maintain the highest standards for your department (${agent.department}).`;

    return agentPrompt;
  }

  getToolDescription(tool) {
    const descriptions = {
      filesystem: '- filesystem: Read, write, list, delete files within the project directory',
      git: '- git: Perform git operations like status, add, commit, push, pull, branch management',
      command: '- command: Execute safe shell commands (npm, node, python, docker, etc.)',
      http: '- http: Make HTTP requests to external APIs',
      database: '- database: Query project database (read-only unless explicitly allowed)'
    };
    return descriptions[tool] || `- ${tool}: Available tool`;
  }

  async loadProjectContext(userId, projectId) {
    if (!projectId) {
      // Return default context if no project specified
      return {
        projectName: 'General Chat',
        projectPath: process.cwd(),
        environment: process.env.NODE_ENV || 'development',
        userId,
        projectId: null
      };
    }

    const project = await Project.findOne({
      where: { id: projectId, user_id: userId }
    });

    if (!project) {
      throw new Error('Project not found');
    }

    return {
      projectName: project.name,
      projectPath: project.root_path || process.cwd(),
      environment: process.env.NODE_ENV || 'development',
      userId,
      projectId
    };
  }

  normalizeToolCall(toolCall) {
    // Handle different model formats
    if (toolCall.function) {
      // OpenAI format
      return {
        name: toolCall.function.name,
        input: JSON.parse(toolCall.function.arguments)
      };
    } else if (toolCall.name) {
      // Claude format
      return {
        name: toolCall.name,
        input: toolCall.input
      };
    } else if (toolCall.functionCall) {
      // Gemini format
      return {
        name: toolCall.functionCall.name,
        input: toolCall.functionCall.args
      };
    }

    throw new Error('Unknown tool call format');
  }

  // Tool mappings for different models
  mapToolsForClaude(tools) {
    const toolSchemas = {
      filesystem: {
        name: 'filesystem',
        description: 'File system operations',
        input_schema: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['read', 'write', 'append', 'list', 'delete'] },
            path: { type: 'string', description: 'File or directory path' },
            content: { type: 'string', description: 'Content for write/append operations' }
          }
        }
      },
      git: {
        name: 'git',
        description: 'Git operations',
        input_schema: {
          type: 'object',
          properties: {
            operation: { type: 'string', enum: ['status', 'add', 'commit', 'push', 'pull', 'branch', 'checkout'] },
            message: { type: 'string', description: 'Commit message' },
            files: { type: 'string', description: 'Files to add' },
            branch: { type: 'string', description: 'Branch name' }
          }
        }
      }
    };

    return tools.map(tool => toolSchemas[tool]).filter(Boolean);
  }

  mapToolsForOpenAI(tools) {
    // Similar mapping for OpenAI format
    return this.mapToolsForClaude(tools).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    }));
  }

  mapToolsForGemini(tools) {
    // Similar mapping for Gemini format
    return [{
      function_declarations: this.mapToolsForClaude(tools).map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }))
    }];
  }

  // Cost calculation methods
  calculateClaudeCost(usage) {
    if (!usage) return 0;
    const inputCost = (usage.input_tokens || 0) * 0.000008;  // $8/million tokens
    const outputCost = (usage.output_tokens || 0) * 0.000024; // $24/million tokens
    return inputCost + outputCost;
  }

  calculateOpenAICost(usage) {
    if (!usage) return 0;
    const inputCost = (usage.prompt_tokens || 0) * 0.00003;   // $30/million tokens
    const outputCost = (usage.completion_tokens || 0) * 0.00006; // $60/million tokens
    return inputCost + outputCost;
  }

  calculateGeminiCost(usage) {
    if (!usage) return 0;
    const inputCost = (usage.promptTokenCount || 0) * 0.000001;  // $1/million tokens
    const outputCost = (usage.candidatesTokenCount || 0) * 0.000002; // $2/million tokens
    return inputCost + outputCost;
  }

  updateUsageStats(modelKey, usage) {
    const today = new Date().toISOString().split('T')[0];
    const currentMinute = Math.floor(Date.now() / 60000);

    // Daily stats
    const dailyKey = `${modelKey}-${today}`;
    const dailyStats = this.usageStats.get(dailyKey) || { cost: 0, requests: 0, tokens: 0 };
    dailyStats.requests += 1;
    dailyStats.tokens += (usage?.input || usage?.prompt_tokens || usage?.promptTokenCount || 0) +
                        (usage?.output || usage?.completion_tokens || usage?.candidatesTokenCount || 0);
    this.usageStats.set(dailyKey, dailyStats);

    // Rate limit stats
    const minuteKey = `${modelKey}-${currentMinute}`;
    const minuteStats = this.usageStats.get(minuteKey) || { requests: 0 };
    minuteStats.requests += 1;
    this.usageStats.set(minuteKey, minuteStats);
  }

  log(job, level, message) {
    const logEntry = {
      timestamp: new Date(),
      level,
      message,
      jobId: job.id
    };
    job.logs.push(logEntry);
    console.log(`[${level.toUpperCase()}] [${job.id}] ${message}`);
  }

  // Queue management
  async queueTask(taskData) {
    const task = {
      ...taskData,
      id: crypto.randomUUID(),
      queuedAt: new Date(),
      priority: taskData.priority || 'normal'
    };

    this.jobQueue.push(task);
    this.jobQueue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    this.processQueue();
    return task.id;
  }

  async processQueue() {
    if (this.isProcessing || this.jobQueue.length === 0) return;

    this.isProcessing = true;

    try {
      while (this.jobQueue.length > 0) {
        const task = this.jobQueue.shift();
        await this.executeTask(task);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Job monitoring
  getJob(jobId) {
    return this.activeJobs.get(jobId);
  }

  getActiveJobs() {
    return Array.from(this.activeJobs.values());
  }

  getUsageStats() {
    return Object.fromEntries(this.usageStats.entries());
  }

  // Graceful shutdown
  async shutdown() {
    console.log('Shutting down agent engine...');

    // Wait for active jobs to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const start = Date.now();

    while (this.activeJobs.size > 0 && (Date.now() - start) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Force stop remaining jobs
    for (const job of this.activeJobs.values()) {
      job.status = 'cancelled';
      job.endTime = new Date();
    }

    this.activeJobs.clear();
    console.log('Agent engine shut down');
  }
}

module.exports = new AgentEngine();
