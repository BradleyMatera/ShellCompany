const { NovaHarness, ZephyrHarness, CipherHarness, SageHarness } = require('./agent-harnesses');
const { IntegrationService } = require('./integrations');
const FileWatcherService = require('./file-watcher');
const { v4: uuidv4 } = require('uuid');

class AutonomousWorkflowSystem {
  constructor(io) {
    this.io = io;
    this.integrations = new IntegrationService();
    this.fileWatcher = new FileWatcherService(io);

    this.providerConfig = {
      anthropic: {
        available: true,
        utilization: 0.45,
        errorRate: 0.02,
        tokensRemaining: 85000,
        limits: { requestsPerMinute: 50, tokensPerHour: 100000 },
        capabilities: { reasoning: 95, coding: 85, analysis: 90 },
        endpoint: 'https://api.anthropic.com/v1/messages',
        apiKey: process.env.ANTHROPIC_API_KEY
      },
      openai: {
        available: true,
        utilization: 0.30,
        errorRate: 0.01,
        tokensRemaining: 120000,
        limits: { requestsPerMinute: 60, tokensPerHour: 150000 },
        capabilities: { reasoning: 88, coding: 95, analysis: 85 },
        endpoint: 'https://api.openai.com/v1/chat/completions',
        apiKey: process.env.OPENAI_API_KEY
      },
      google: {
        available: true,
        utilization: 0.60,
        errorRate: 0.05,
        tokensRemaining: 45000,
        limits: { requestsPerMinute: 30, tokensPerHour: 80000 },
        capabilities: { reasoning: 80, coding: 75, analysis: 90 },
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: process.env.GOOGLE_API_KEY
      }
    };

    this.agents = {
      nova: new NovaHarness(this.providerConfig),
      zephyr: new ZephyrHarness(this.providerConfig),
      cipher: new CipherHarness(this.providerConfig),
      sage: new SageHarness(this.providerConfig)
    };

    this.workQueue = [];
    this.activeWorkflows = new Map();
    this.completedTasks = [];
    this.maxConcurrentAgents = 8;
    this.isRunning = false;

    // Only set up event handlers and start file watching if not running under test
    if (process.env.NODE_ENV !== 'test') {
      this.setupEventHandlers();
    }
  }

  setupEventHandlers() {
    if (this.io) {
      this.io.on('connection', (socket) => {
        socket.on('start-workflow', (request) => this.handleWorkflowRequest(request, socket));
        socket.on('get-agent-status', () => this.broadcastAgentStatus());
        socket.on('get-workflow-status', () => this.broadcastWorkflowStatus());
        socket.on('pause-workflow', (workflowId) => this.pauseWorkflow(workflowId));
        socket.on('resume-workflow', (workflowId) => this.resumeWorkflow(workflowId));
        socket.on('cancel-workflow', (workflowId) => this.cancelWorkflow(workflowId));
      });
    }

    this.fileWatcher.startWatching();
  }

  // Graceful shutdown for tests and controlled environments
  async shutdown() {
    try {
      if (this.fileWatcher && typeof this.fileWatcher.stopWatching === 'function') {
        this.fileWatcher.stopWatching();
      }

      // stop any running work queue loops
      this.isRunning = false;
      this.workQueue = [];
      this.activeWorkflows.clear();
      this.completedTasks = [];
    } catch (e) {
      // ignore errors during shutdown
    }
  }

  async handleWorkflowRequest(request, socket) {
    const workflowId = uuidv4();
    const workflow = {
      id: workflowId,
      request: request.content,
      requester: request.sender || 'CEO',
      status: 'analyzing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tasks: [],
      decisions: [],
      risks: [],
      budget: {
        tokensAllocated: 200000,
        tokensUsed: 0,
        deployMinutesAllocated: 120,
        deployMinutesUsed: 0
      },
      timeline: {
        estimated: this.estimateTimeline(request.content),
        started: Date.now(),
        deadline: Date.now() + (7 * 24 * 60 * 60 * 1000) // 1 week default
      }
    };

    this.activeWorkflows.set(workflowId, workflow);

    if (socket) {
      socket.emit('workflow-created', {
        workflowId,
        status: 'analyzing',
        message: 'Analyzing your request and creating project brief...'
      });
    }

    await this.analyzeAndDecomposeRequest(workflow);
    await this.orchestrateWorkflow(workflow);

    return workflowId;
  }

  async analyzeAndDecomposeRequest(workflow) {
    const analysisPrompt = `
Analyze this business request and break it down into specific, actionable tasks:

Request: "${workflow.request}"

Please provide:
1. Project scope and objectives
2. Technical requirements
3. Task breakdown with owners (Nova=Frontend, Zephyr=Backend, Cipher=Security, Sage=DevOps)
4. Dependencies between tasks
5. Risk assessment
6. Success criteria

Format as JSON with clear task assignments.
    `;

    try {
      const analysis = await this.agents.nova.executeTask({
        description: analysisPrompt,
        context: { type: 'project_analysis', request: workflow.request }
      });

      if (analysis.success) {
        const taskBreakdown = this.parseAnalysisResponse(analysis.result);
        workflow.tasks = taskBreakdown.tasks || [];
        workflow.risks = taskBreakdown.risks || [];
        workflow.scope = taskBreakdown.scope;
        workflow.successCriteria = taskBreakdown.successCriteria || [];

        // Detect page/component requests and add a Nova component generation task
        const req = workflow.request.toLowerCase();
        if (
          req.includes('page') ||
          req.includes('component') ||
          req.includes('about') ||
          req.includes('splash')
        ) {
          workflow.tasks.push({
            id: `nova-component-${Date.now()}`,
            title: `Generate React component for "${workflow.request}"`,
            owner: 'Nova',
            status: 'pending',
            type: 'component_generation',
            specs: { name: workflow.request.replace(/[^a-zA-Z0-9]/g, '') + 'Page' }
          });
        }

        workflow.status = 'planned';
        workflow.updatedAt = Date.now();

        this.broadcastWorkflowUpdate(workflow);
        this.broadcastBoardRoomMessage({
          sender: 'Alex',
          senderRole: 'Project Manager',
          content: `Project brief created for: "${workflow.scope}"\n\n**Task Breakdown:**\n${workflow.tasks.map(t => `• ${t.title} (${t.owner})`).join('\n')}\n\n**Timeline:** ${Math.ceil(workflow.timeline.estimated / (24 * 60 * 60 * 1000))} days\n**Budget:** ${workflow.budget.tokensAllocated.toLocaleString()} tokens`,
          workflowId: workflow.id,
          artifacts: [
            {
              id: 'project-brief',
              type: 'report',
              title: 'Project Brief & Task Breakdown',
              preview: `Scope: ${workflow.scope}`
            }
          ]
        });
      }
    } catch (error) {
      console.error('Error analyzing workflow request:', error);
      workflow.status = 'error';
      workflow.error = error.message;
    }
  }

  parseAnalysisResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error parsing analysis response:', error);
    }

    return {
      scope: 'Project analysis pending',
      tasks: [
        { id: 'task-1', title: 'Define requirements', owner: 'Nova', status: 'pending' },
        { id: 'task-2', title: 'Setup infrastructure', owner: 'Sage', status: 'pending' }
      ],
      risks: [
        { id: 'risk-1', title: 'Timeline uncertainty', severity: 'medium', owner: 'Alex' }
      ]
    };
  }

  async orchestrateWorkflow(workflow) {
    this.workQueue.push(...workflow.tasks.map(task => ({
      ...task,
      workflowId: workflow.id,
      type: 'task_execution'
    })));

    if (!this.isRunning) {
      this.isRunning = true;
      this.processWorkQueue();
    }
  }

  async processWorkQueue() {
    while (this.workQueue.length > 0 && this.getActiveAgentCount() < this.maxConcurrentAgents) {
      const work = this.workQueue.shift();
      if (!work) continue;

      const workflow = this.activeWorkflows.get(work.workflowId);
      if (!workflow || workflow.status === 'cancelled') continue;

      await this.executeWorkItem(work, workflow);
    }

    if (this.workQueue.length > 0) {
      setTimeout(() => this.processWorkQueue(), 5000);
    } else {
      this.isRunning = false;
    }
  }

  async executeWorkItem(workItem, workflow) {
    const agentName = this.mapOwnerToAgent(workItem.owner);
    const agent = this.agents[agentName];

    if (!agent) {
      console.error(`No agent found for owner: ${workItem.owner}`);
      return;
    }

    workItem.status = 'in_progress';
    workItem.startedAt = Date.now();

    this.broadcastWorkflowUpdate(workflow);
    this.broadcastBoardRoomMessage({
      sender: workItem.owner,
      senderRole: agent.agentName,
      content: `🔄 **Starting Task:** ${workItem.title}\n\nEstimated completion: ${this.formatDuration(workItem.estimatedDuration || 3600000)}`,
      workflowId: workflow.id
    });

    let result;
    try {
      if (workItem.type === 'component_generation' && agent.createComponent) {
        result = await agent.createComponent(workItem.specs || {});
      } else {
        result = await agent.executeTask({
          description: workItem.description || workItem.title,
          context: {
            type: 'workflow_task',
            workflowId: workflow.id,
            taskId: workItem.id,
            projectScope: workflow.scope,
            constraints: workflow.budget,
            dependencies: workItem.dependencies || []
          }
        });
      }

      // Broadcast every agent action, artifact, and file event live
      this.broadcastAgentAction({
        agent: agent.agentName,
        taskId: workItem.id,
        workflowId: workflow.id,
        action: 'execute',
        status: result.success ? 'completed' : 'failed',
        result: result.result,
        artifacts: result.artifacts || [],
        metrics: result.metrics
      });

      if (result.artifacts && result.artifacts.length > 0) {
        for (const artifact of result.artifacts) {
          this.broadcastAgentAction({
            agent: agent.agentName,
            taskId: workItem.id,
            workflowId: workflow.id,
            action: 'artifact',
            artifact
          });
        }
      }

      if (result.success) {
        workItem.status = 'completed';
        workItem.completedAt = Date.now();
        workItem.result = result.result;
        workItem.artifacts = result.artifacts || [];

        workflow.budget.tokensUsed += result.metrics.tokensUsed;

        const statusUpdate = this.generateTaskCompletionMessage(workItem, result);
        this.broadcastBoardRoomMessage({
          sender: workItem.owner,
          senderRole: agent.agentName,
          content: statusUpdate,
          workflowId: workflow.id,
          artifacts: result.artifacts || []
        });

        await this.handleTaskCompletion(workItem, workflow);
      } else {
        workItem.status = 'failed';
        workItem.error = result.error;
        workItem.completedAt = Date.now();

        this.broadcastBoardRoomMessage({
          sender: workItem.owner,
          senderRole: agent.agentName,
          content: `❌ **Task Failed:** ${workItem.title}\n\nError: ${result.error}\n\nRequesting support from Alex for resolution.`,
          workflowId: workflow.id
        });

        workflow.risks.push({
          id: uuidv4(),
          title: `Task failure: ${workItem.title}`,
          description: result.error,
          severity: 'high',
          owner: 'Alex',
          mitigationPlan: 'Reassigning to alternative agent or breaking down into smaller tasks'
        });
      }
    } catch (error) {
      console.error(`Error executing work item ${workItem.id}:`, error);
      workItem.status = 'error';
      workItem.error = error.message;
    }

    workflow.updatedAt = Date.now();
    this.broadcastWorkflowUpdate(workflow);

    if (this.isWorkflowComplete(workflow)) {
      await this.completeWorkflow(workflow);
    }
  }

  // Broadcast agent actions and file events to frontend for live visibility
  broadcastAgentAction(action) {
    if (this.io) {
      this.io.emit('agent-action', {
        ...action,
        timestamp: Date.now()
      });
    }
  }

  generateTaskCompletionMessage(workItem, result) {
    const duration = workItem.completedAt - workItem.startedAt;
    let message = `✅ **Task Completed:** ${workItem.title}\n\n`;
    message += `**Execution Time:** ${this.formatDuration(duration)}\n`;
    message += `**Tokens Used:** ${result.metrics.tokensUsed}\n`;
    message += `**Provider:** ${result.metrics.provider}\n\n`;

    if (result.artifacts && result.artifacts.length > 0) {
      message += `**Deliverables:** ${result.artifacts.length} artifacts created\n`;
    }

    if (result.result && result.result.length > 200) {
      message += `**Summary:** ${result.result.substring(0, 200)}...\n\n`;
    } else if (result.result) {
      message += `**Result:** ${result.result}\n\n`;
    }

    message += `**Next:** Checking dependencies and triggering follow-up tasks`;

    return message;
  }

  async handleTaskCompletion(completedTask, workflow) {
    const dependentTasks = workflow.tasks.filter(task =>
      task.dependencies && task.dependencies.includes(completedTask.id)
    );

    for (const task of dependentTasks) {
      const allDependenciesComplete = task.dependencies.every(depId => {
        const depTask = workflow.tasks.find(t => t.id === depId);
        return depTask && depTask.status === 'completed';
      });

      if (allDependenciesComplete && task.status === 'pending') {
        this.workQueue.push({
          ...task,
          workflowId: workflow.id,
          type: 'task_execution'
        });
      }
    }

    if (completedTask.owner === 'Sage' && completedTask.title.includes('deploy')) {
      await this.handleDeploymentCompletion(completedTask, workflow);
    }
  }

  async handleDeploymentCompletion(deployTask, workflow) {
    try {
      const vercel = await this.integrations.getIntegration('vercel');
      const deployments = await vercel.getDeployments(5);

      if (deployments.success) {
        const recentDeploy = deployments.deployments[0];
        this.broadcastBoardRoomMessage({
          sender: 'Sage',
          senderRole: 'DevOps Engineer',
          content: `🚀 **Deployment Live!**\n\n**URL:** https://${recentDeploy.url}\n**Status:** ${recentDeploy.status}\n**Deployed:** ${new Date(recentDeploy.createdAt).toLocaleTimeString()}\n\n**Next:** Running automated tests and performance monitoring`,
          workflowId: workflow.id,
          artifacts: [
            {
              id: 'deployment-link',
              type: 'link',
              title: 'Live Deployment',
              url: `https://${recentDeploy.url}`,
              preview: 'Production environment ready for testing'
            }
          ]
        });
      }
    } catch (error) {
      console.error('Error handling deployment completion:', error);
    }
  }

  isWorkflowComplete(workflow) {
    return workflow.tasks.every(task =>
      task.status === 'completed' || task.status === 'skipped'
    );
  }

  async completeWorkflow(workflow) {
    workflow.status = 'completed';
    workflow.completedAt = Date.now();
    workflow.updatedAt = Date.now();

    const summary = this.generateWorkflowSummary(workflow);

    this.broadcastBoardRoomMessage({
      sender: 'Alex',
      senderRole: 'Project Manager',
      content: `🎉 **Project Completed Successfully!**\n\n${summary}\n\n**Final Status:**\n• All tasks completed ✅\n• Budget: ${workflow.budget.tokensUsed.toLocaleString()}/${workflow.budget.tokensAllocated.toLocaleString()} tokens\n• Duration: ${this.formatDuration(workflow.completedAt - workflow.timeline.started)}\n\n**Ready for client review and approval.**`,
      workflowId: workflow.id,
      artifacts: [
        {
          id: 'project-summary',
          type: 'report',
          title: 'Project Completion Summary',
          preview: `${workflow.tasks.length} tasks completed successfully`
        }
      ]
    });

    this.completedTasks.push(workflow);
    this.broadcastWorkflowUpdate(workflow);

    console.log(`Workflow ${workflow.id} completed successfully`);
  }

  generateWorkflowSummary(workflow) {
    const completedTasks = workflow.tasks.filter(t => t.status === 'completed');
    const totalDuration = workflow.completedAt - workflow.timeline.started;
    const artifactsCreated = workflow.tasks.reduce((total, task) =>
      total + (task.artifacts ? task.artifacts.length : 0), 0
    );

    return `**Project:** ${workflow.scope}
**Tasks Completed:** ${completedTasks.length}/${workflow.tasks.length}
**Artifacts Created:** ${artifactsCreated}
**Total Duration:** ${this.formatDuration(totalDuration)}
**Efficiency:** ${this.calculateEfficiencyScore(workflow)}%`;
  }

  calculateEfficiencyScore(workflow) {
    const plannedDuration = workflow.timeline.estimated;
    const actualDuration = workflow.completedAt - workflow.timeline.started;
    const tokenEfficiency = (workflow.budget.tokensAllocated - workflow.budget.tokensUsed) / workflow.budget.tokensAllocated;

    const timeScore = Math.max(0, 100 - ((actualDuration - plannedDuration) / plannedDuration) * 100);
    const budgetScore = tokenEfficiency * 100;

    return Math.round((timeScore + budgetScore) / 2);
  }

  mapOwnerToAgent(owner) {
    const mapping = {
      'Nova': 'nova',
      'Zephyr': 'zephyr',
      'Cipher': 'cipher',
      'Sage': 'sage'
    };
    return mapping[owner] || 'nova';
  }

  getActiveAgentCount() {
    return Object.values(this.agents).reduce((count, agent) =>
      count + agent.activeRequests.size, 0
    );
  }

  formatDuration(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }

  estimateTimeline(request) {
    const complexity = this.assessComplexity(request);
    const baseTime = 2 * 60 * 60 * 1000; // 2 hours base
    return baseTime * complexity;
  }

  assessComplexity(request) {
    const complexWords = ['integration', 'deployment', 'security', 'database', 'api', 'auth'];
    const matches = complexWords.filter(word =>
      request.toLowerCase().includes(word)
    ).length;

    return Math.max(1, Math.min(5, 1 + matches * 0.5));
  }

  broadcastWorkflowUpdate(workflow) {
    if (this.io) {
      this.io.emit('workflow-updated', workflow);
    }
  }

  broadcastBoardRoomMessage(message) {
    if (this.io) {
      this.io.emit('boardroom-message', {
        ...message,
        id: uuidv4(),
        timestamp: Date.now()
      });
    }
  }

  broadcastAgentStatus() {
    const status = Object.entries(this.agents).reduce((acc, [name, agent]) => {
      acc[name] = agent.getStatus();
      return acc;
    }, {});

    if (this.io) {
      this.io.emit('agent-status', status);
    }
  }

  broadcastWorkflowStatus() {
    const status = {
      active: Array.from(this.activeWorkflows.values()),
      queue: this.workQueue.length,
      completed: this.completedTasks.length,
      capacity: {
        maxConcurrent: this.maxConcurrentAgents,
        currentActive: this.getActiveAgentCount()
      }
    };

    if (this.io) {
      this.io.emit('workflow-status', status);
    }
  }

  pauseWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (workflow) {
      workflow.status = 'paused';
      workflow.updatedAt = Date.now();
      this.broadcastWorkflowUpdate(workflow);
    }
  }

  resumeWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (workflow) {
      workflow.status = 'running';
      workflow.updatedAt = Date.now();
      this.broadcastWorkflowUpdate(workflow);
      this.processWorkQueue();
    }
  }

  cancelWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (workflow) {
      workflow.status = 'cancelled';
      workflow.updatedAt = Date.now();
      workflow.cancelledAt = Date.now();

      workflow.tasks.forEach(task => {
        if (task.status === 'in_progress' || task.status === 'pending') {
          task.status = 'cancelled';
        }
      });

      this.broadcastWorkflowUpdate(workflow);
      this.broadcastBoardRoomMessage({
        sender: 'System',
        senderRole: 'Workflow Manager',
        content: `🚫 **Workflow Cancelled**\n\nWorkflow "${workflow.scope}" has been cancelled by user request.`,
        workflowId: workflow.id
      });
    }
  }

  getSystemStatus() {
    return {
      isRunning: this.isRunning,
      activeWorkflows: this.activeWorkflows.size,
      queueLength: this.workQueue.length,
      completedTasks: this.completedTasks.length,
      maxConcurrentAgents: this.maxConcurrentAgents,
      currentActiveAgents: this.getActiveAgentCount(),
      providerStatus: Object.entries(this.providerConfig).reduce((acc, [name, config]) => {
        acc[name] = {
          available: config.available,
          utilization: config.utilization,
          tokensRemaining: config.tokensRemaining,
          errorRate: config.errorRate
        };
        return acc;
      }, {}),
      fileWatcher: this.fileWatcher.getWatcherStatus()
    };
  }
}

module.exports = AutonomousWorkflowSystem;
