const express = require('express');
const { Agent, Task, User } = require('../models');
const agentEngine = require('../services/agent-engine');
const agentRoster = require('../services/agent-roster');
const BriefManager = require('../services/brief-manager');
const WebSocket = require('ws');
const os = require('os');
const path = require('path');
const fsp = require('fs').promises;
const taskRunner = require('../services/task-runner');
const bus = (() => { try { return require('../services/bus'); } catch { return { emit(){ } }; } })();

const router = express.Router();

// Initialize Brief Manager for intelligent directive processing
const briefManager = new BriefManager();

// WebSocket clients for real-time updates
let wsClients = [];

// Initialize WebSocket server
function initializeWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    wsClients.push(ws);
    console.log('WebSocket client connected');

    ws.on('close', () => {
      wsClients = wsClients.filter(client => client !== ws);
      console.log('WebSocket client disconnected');
    });
  });

  return wss;
}

// Broadcast to all WebSocket clients
function broadcast(data) {
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Initialize agents in database
router.post('/initialize', async (req, res) => {
  try {
    console.log('🚀 Initializing agent roster in database...');

    for (const agent of agentRoster.agentsArray) {
      await Agent.upsert({
        id: agent.id,
        name: agent.name,
        title: agent.title,
        department: agent.department,
        avatar: agent.avatar,
        specialization: agent.specialization,
        tools: agent.tools,
        skills: agent.skills,
        preferred_model: agent.preferredModel,
        max_cost_per_task: agent.maxCostPerTask,
        system_prompt: agent.systemPrompt,
        status: 'idle'
      });
    }

    const count = await Agent.count();
    console.log(`✅ Initialized ${count} agents in database`);

    broadcast({
      type: 'agents_initialized',
      count: count,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, message: `Initialized ${count} agents`, count });
  } catch (error) {
    console.error('❌ Error initializing agents:', error);
    res.status(500).json({ error: 'Failed to initialize agents' });
  }
});

// Lightweight agent status list for polling
router.get('/agents/status', async (req, res) => {
  try {
    const agents = await Agent.findAll({ attributes: ['id', 'status', 'tasks_completed', 'average_duration', 'success_rate', 'total_cost'] });
    const list = agents.map(a => ({
      id: a.id,
      status: a.status,
      metrics: {
        tasksCompleted: a.tasks_completed,
        averageDuration: a.average_duration,
        successRate: a.success_rate,
        totalCost: parseFloat(a.total_cost || 0)
      }
    }));
    res.json(list);
  } catch (error) {
    console.error('❌ Error fetching agent statuses:', error);
    res.status(500).json({ error: 'Failed to fetch agent statuses' });
  }
});

// Assign a task to a specific or best-fit agent
router.post('/agents/assign', async (req, res) => {
  try {
    const { assignedAgent, prompt, projectId, userId = 1, priority = 'normal', skills = [], department } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    let result;
    if (assignedAgent) {
      // Direct assignment path mirrors POST /agents/:agentId/tasks
      const agent = await Agent.findByPk(assignedAgent);
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      const task = await Task.create({ agent_id: assignedAgent, user_id: userId, project_id: projectId, prompt, priority, status: 'pending' });
      // Kick off async execution without blocking
      executeTask(task.id, agent, prompt).catch(() => {});
      result = { success: true, taskId: task.id, agentId: assignedAgent };
    } else {
      // Use roster to select the best-fit agent
      result = await agentRoster.assignTask({ userId, projectId, prompt, skills, department, urgency: priority });
    }

    res.json(result);
  } catch (error) {
    console.error('❌ Error assigning agent task:', error);
    res.status(500).json({ error: 'Failed to assign task' });
  }
});
// Get all agents with their current status
router.get('/agents', async (req, res) => {
  try {
    const agents = await Agent.findAll({
      order: [['department', 'ASC'], ['name', 'ASC']]
    });

    // Group by department
    const departments = {};
    agents.forEach(agent => {
      if (!departments[agent.department]) {
        departments[agent.department] = [];
      }
      departments[agent.department].push(agent);
    });

    res.json({ departments, totalAgents: agents.length });
  } catch (error) {
    console.error('❌ Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// Get specific agent details
router.get('/agents/:agentId', async (req, res) => {
  try {
    const agent = await Agent.findByPk(req.params.agentId, {
      include: [{
        model: Task,
        limit: 10,
        order: [['createdAt', 'DESC']]
      }]
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(agent);
  } catch (error) {
    console.error('❌ Error fetching agent:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// Set per-agent credential token (desktop/local only)
router.patch('/agents/:agentId/credentials', async (req, res) => {
  try {
    const { provider, token } = req.body || {};
    if (!provider || !token) return res.status(400).json({ error: 'provider and token required' });
    const agent = await Agent.findByPk(req.params.agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const creds = agent.credentials || {};
    creds[provider] = token;
    agent.credentials = creds;
    await agent.save();
    res.json({ ok: true, stored: provider });
  } catch (e) {
    res.status(500).json({ error: 'set_credentials_failed', detail: e.message });
  }
});

// Update agent status
router.patch('/agents/:agentId/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['idle', 'busy', 'offline'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const agent = await Agent.findByPk(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    await agent.update({
      status,
      last_active: new Date()
    });

    broadcast({
      type: 'agent_status_updated',
      agentId: req.params.agentId,
      status,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, agent });
  } catch (error) {
    console.error('❌ Error updating agent status:', error);
    res.status(500).json({ error: 'Failed to update agent status' });
  }
});

// Assign task to agent
router.post('/agents/:agentId/tasks', async (req, res) => {
  try {
    const { prompt, priority = 'medium', userId = 1, projectId } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const agent = await Agent.findByPk(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Create task
    const task = await Task.create({
      agent_id: req.params.agentId,
      user_id: userId,
      project_id: projectId,
      prompt,
      priority,
      status: 'pending'
    });

    // Update agent status to busy
    await agent.update({ status: 'busy', last_active: new Date() });

    broadcast({
      type: 'task_created',
      task: {
        id: task.id,
        agentId: req.params.agentId,
        prompt,
        priority,
        status: 'pending'
      },
      timestamp: new Date().toISOString()
    });

    // Execute task asynchronously
    executeTask(task.id, agent, prompt);

    res.json({ success: true, task });
  } catch (error) {
    console.error('❌ Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Quick self-test for an agent: runs a small prompt using its preferred model
router.post('/agents/:agentId/test', async (req, res) => {
  try {
    const crypto = require('crypto');
    const agent = await Agent.findByPk(req.params.agentId, { attributes: ['id','name','preferred_model','system_prompt'] });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const prompt = (req.body && req.body.prompt) || 'hi';
    const modelKey = (agent.preferred_model || 'claude').toLowerCase();
    const systemPrompt = agent.system_prompt || `You are ${agent.name}`;

    // Minimal job context for logging/usage
    const job = { id: crypto.randomUUID(), cost: 0, tokens: { input: 0, output: 0 }, logs: [] };
    const result = await agentEngine.callModel(modelKey, systemPrompt, prompt, ['filesystem'], job);

    res.json({ ok: true, agentId: agent.id, model: modelKey, reply: result.content || result.response || '', usage: result.usage, cost: result.cost });
  } catch (error) {
    res.status(500).json({ error: 'Agent self-test failed', detail: error.message });
  }
});

// Execute task with real AI
async function executeTask(taskId, agent, prompt) {
  const startTime = Date.now();

  try {
    console.log(`🤖 Agent ${agent.name} starting task ${taskId}`);

    // Update task status to running
    await Task.update({ status: 'running' }, { where: { id: taskId } });

    broadcast({
      type: 'task_started',
      taskId,
      agentId: agent.id,
      timestamp: new Date().toISOString()
    });

    // Execute with agent engine
    const result = await agentEngine.executeTask(agent.id, prompt, {
      model: agent.preferred_model,
      maxCost: agent.max_cost_per_task,
      systemPrompt: agent.system_prompt
    });

    const duration = Date.now() - startTime;

    // Update task with result
    await Task.update({
      status: 'completed',
      result: result.response,
      cost: result.cost,
      duration
    }, { where: { id: taskId } });

    // Update agent metrics
    await agent.update({
      status: 'idle',
      tasks_completed: agent.tasks_completed + 1,
      total_cost: parseFloat(agent.total_cost) + result.cost,
      average_duration: Math.round((agent.average_duration * agent.tasks_completed + duration) / (agent.tasks_completed + 1)),
      last_active: new Date()
    });

    broadcast({
      type: 'task_completed',
      taskId,
      agentId: agent.id,
      result: result.response,
      cost: result.cost,
      duration,
      timestamp: new Date().toISOString()
    });

    console.log(`✅ Agent ${agent.name} completed task ${taskId} in ${duration}ms`);

  } catch (error) {
    console.error(`❌ Agent ${agent.name} failed task ${taskId}:`, error);

    const duration = Date.now() - startTime;

    // Update task as failed
    await Task.update({
      status: 'failed',
      result: `Error: ${error.message}`,
      duration
    }, { where: { id: taskId } });

    // Update agent status back to idle
    await Agent.update({ status: 'idle' }, { where: { id: agent.id } });

    broadcast({
      type: 'task_failed',
      taskId,
      agentId: agent.id,
      error: error.message,
      duration,
      timestamp: new Date().toISOString()
    });
  }
}

// Get all tasks with filters
router.get('/tasks', async (req, res) => {
  try {
    const { status, agentId, userId, limit = 50, offset = 0 } = req.query;

    const where = {};
    if (status) where.status = status;
    if (agentId) where.agent_id = agentId;
    if (userId) where.user_id = userId;

    const tasks = await Task.findAll({
      where,
      include: [{ model: Agent, attributes: ['name', 'department', 'avatar'] }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await Task.count({ where });

    res.json({ tasks, total, page: Math.floor(offset / limit) + 1 });
  } catch (error) {
    console.error('❌ Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get task details
router.get('/tasks/:taskId', async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.taskId, {
      include: [{ model: Agent, attributes: ['name', 'department', 'avatar'] }]
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error('❌ Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Cancel running task
router.patch('/tasks/:taskId/cancel', async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== 'running' && task.status !== 'pending') {
      return res.status(400).json({ error: 'Task cannot be cancelled' });
    }

    await task.update({ status: 'failed', result: 'Task cancelled by user' });
    await Agent.update({ status: 'idle' }, { where: { id: task.agent_id } });

    broadcast({
      type: 'task_cancelled',
      taskId: req.params.taskId,
      agentId: task.agent_id,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error cancelling task:', error);
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

// Get agent performance metrics
router.get('/metrics', async (req, res) => {
  try {
    const agents = await Agent.findAll({
      attributes: ['id', 'name', 'department', 'status', 'tasks_completed', 'total_cost', 'success_rate', 'average_duration']
    });

    const tasks = await Task.findAll({
      attributes: ['status', 'cost', 'duration', 'createdAt']
    });

    // Calculate overall metrics
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const failedTasks = tasks.filter(t => t.status === 'failed').length;
    const totalCost = tasks.reduce((sum, t) => sum + parseFloat(t.cost || 0), 0);
    const avgDuration = tasks.length > 0 ? tasks.reduce((sum, t) => sum + (t.duration || 0), 0) / tasks.length : 0;

    // Active agents
    const activeAgents = agents.filter(a => a.status === 'busy').length;
    const idleAgents = agents.filter(a => a.status === 'idle').length;
    const offlineAgents = agents.filter(a => a.status === 'offline').length;

    // Department breakdown
    const departmentStats = {};
    agents.forEach(agent => {
      if (!departmentStats[agent.department]) {
        departmentStats[agent.department] = {
          total: 0,
          active: 0,
          idle: 0,
          offline: 0,
          tasksCompleted: 0,
          totalCost: 0
        };
      }

      const dept = departmentStats[agent.department];
      dept.total++;
      dept[agent.status]++;
      dept.tasksCompleted += agent.tasks_completed;
      dept.totalCost += parseFloat(agent.total_cost || 0);
    });

    res.json({
      overview: {
        totalAgents: agents.length,
        activeAgents,
        idleAgents,
        offlineAgents,
        totalTasks,
        completedTasks,
        failedTasks,
        successRate: totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(2) : 100,
        totalCost: totalCost.toFixed(4),
        avgDuration: Math.round(avgDuration)
      },
      departments: departmentStats,
      topPerformers: agents
        .sort((a, b) => b.tasks_completed - a.tasks_completed)
        .slice(0, 10)
        .map(a => ({
          id: a.id,
          name: a.name,
          department: a.department,
          tasksCompleted: a.tasks_completed,
          successRate: a.success_rate,
          totalCost: a.total_cost
        }))
    });
  } catch (error) {
    console.error('❌ Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Multi-agent workflow execution
router.post('/workflows/execute', async (req, res) => {
  try {
    const { workflow, userId = 1, projectId } = req.body;

    if (!workflow || !workflow.steps || workflow.steps.length === 0) {
      return res.status(400).json({ error: 'Invalid workflow' });
    }

    const workflowId = `workflow_${Date.now()}`;
    const results = [];

    broadcast({
      type: 'workflow_started',
      workflowId,
      steps: workflow.steps.length,
      timestamp: new Date().toISOString()
    });

    // Execute steps sequentially
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];

      broadcast({
        type: 'workflow_step_started',
        workflowId,
        stepIndex: i,
        agentId: step.agentId,
        timestamp: new Date().toISOString()
      });

      const agent = await Agent.findByPk(step.agentId);
      if (!agent) {
        throw new Error(`Agent ${step.agentId} not found`);
      }

      // Create task for this step
      const task = await Task.create({
        agent_id: step.agentId,
        user_id: userId,
        project_id: projectId,
        prompt: step.prompt,
        priority: 'high',
        workflow_id: workflowId,
        status: 'pending'
      });

      // Execute task synchronously for workflow
      await executeTaskSync(task.id, agent, step.prompt);

      const completedTask = await Task.findByPk(task.id);
      results.push({
        step: i + 1,
        agentId: step.agentId,
        agentName: agent.name,
        prompt: step.prompt,
        result: completedTask.result,
        status: completedTask.status,
        cost: completedTask.cost,
        duration: completedTask.duration
      });

      broadcast({
        type: 'workflow_step_completed',
        workflowId,
        stepIndex: i,
        result: completedTask.result,
        timestamp: new Date().toISOString()
      });
    }

    broadcast({
      type: 'workflow_completed',
      workflowId,
      results,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, workflowId, results });
  } catch (error) {
    console.error('❌ Error executing workflow:', error);

    broadcast({
      type: 'workflow_failed',
      workflowId: req.body.workflowId || 'unknown',
      error: error.message,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({ error: 'Failed to execute workflow' });
  }
});

// Synchronous task execution for workflows
async function executeTaskSync(taskId, agent, prompt) {
  const startTime = Date.now();

  try {
    await Task.update({ status: 'running' }, { where: { id: taskId } });
    await Agent.update({ status: 'busy' }, { where: { id: agent.id } });

    const result = await agentEngine.executeTask(agent.id, prompt, {
      model: agent.preferred_model,
      maxCost: agent.max_cost_per_task,
      systemPrompt: agent.system_prompt
    });

    const duration = Date.now() - startTime;

    await Task.update({
      status: 'completed',
      result: result.response,
      cost: result.cost,
      duration
    }, { where: { id: taskId } });

    await agent.update({
      status: 'idle',
      tasks_completed: agent.tasks_completed + 1,
      total_cost: parseFloat(agent.total_cost) + result.cost,
      last_active: new Date()
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    await Task.update({
      status: 'failed',
      result: `Error: ${error.message}`,
      duration
    }, { where: { id: taskId } });

    await Agent.update({ status: 'idle' }, { where: { id: agent.id } });

    throw error;
  }
}

// Real-time agent chat endpoint
router.post('/agents/:agentId/chat', async (req, res) => {
  try {
    const { message, userId = 1 } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const agent = await Agent.findByPk(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Create a chat task
    const task = await Task.create({
      agent_id: req.params.agentId,
      user_id: userId,
      prompt: message,
      priority: 'high',
      status: 'pending'
    });

    // Execute immediately for chat
    const startTime = Date.now();

    try {
      await Task.update({ status: 'running' }, { where: { id: task.id } });

      const result = await agentEngine.executeTask(agent.id, message, {
        model: agent.preferred_model,
        maxCost: agent.max_cost_per_task,
        systemPrompt: agent.system_prompt
      });

      const duration = Date.now() - startTime;

      await Task.update({
        status: 'completed',
        result: result.response,
        cost: result.cost,
        duration
      }, { where: { id: task.id } });

      await agent.update({
        tasks_completed: agent.tasks_completed + 1,
        total_cost: parseFloat(agent.total_cost) + result.cost,
        last_active: new Date()
      });

      res.json({
        success: true,
        response: result.response,
        cost: result.cost,
        duration,
        taskId: task.id
      });

    } catch (error) {
      await Task.update({
        status: 'failed',
        result: `Error: ${error.message}`,
        duration: Date.now() - startTime
      }, { where: { id: task.id } });

      throw error;
    }

  } catch (error) {
    console.error('❌ Error in agent chat:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// =====================================================
// INTELLIGENT BRIEF MANAGEMENT SYSTEM (PHASE 1)
// =====================================================

// Step 1: Analyze directive and generate clarifying questions
router.post('/brief/analyze', async (req, res) => {
  try {
    const { directive, userId = 'user' } = req.body;
    
    if (!directive) {
      return res.status(400).json({ error: 'Directive is required' });
    }

    console.log(`🧠 [BRIEF] Analyzing directive: "${directive}"`);
    const brief = await briefManager.analyzeDirective(directive, userId);

    broadcast({
      type: 'brief_analysis_complete',
      briefId: brief.id,
      directive,
      questionsCount: brief.clarifyingQuestions.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      brief: {
        id: brief.id,
        directive: brief.originalDirective,
        status: brief.status,
        knownFacts: brief.knownFacts,
        assumptions: brief.assumptions,
        unknowns: brief.unknowns,
        clarifyingQuestions: brief.clarifyingQuestions,
        estimatedComplexity: brief.estimatedComplexity,
        suggestedAgents: brief.suggestedAgents
      }
    });
  } catch (error) {
    console.error('❌ Error analyzing directive:', error);
    res.status(500).json({ error: 'Failed to analyze directive', detail: error.message });
  }
});

// Step 2: Record response to clarifying question
router.post('/brief/:briefId/respond', async (req, res) => {
  try {
    const { briefId } = req.params;
    const { questionId, response } = req.body;

    if (!questionId || response === undefined) {
      return res.status(400).json({ error: 'questionId and response are required' });
    }

    console.log(`💬 [BRIEF:${briefId}] Recording response: ${questionId} = ${JSON.stringify(response)}`);
    const brief = await briefManager.recordResponse(briefId, questionId, response);

    broadcast({
      type: 'brief_response_recorded',
      briefId,
      questionId,
      response,
      status: brief.status,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      brief: {
        id: brief.id,
        status: brief.status,
        answeredQuestions: Array.from(brief.responses.keys()).length,
        totalQuestions: brief.clarifyingQuestions.length,
        readyForApproval: brief.status === 'ready_for_approval'
      }
    });
  } catch (error) {
    console.error('❌ Error recording brief response:', error);
    res.status(500).json({ error: 'Failed to record response', detail: error.message });
  }
});

// Step 3: Get brief status and details
router.get('/brief/:briefId', async (req, res) => {
  try {
    const { briefId } = req.params;
    const brief = briefManager.getBrief(briefId);

    if (!brief) {
      return res.status(404).json({ error: 'Brief not found' });
    }

    res.json({
      success: true,
      brief: {
        id: brief.id,
        directive: brief.originalDirective,
        status: brief.status,
        knownFacts: brief.knownFacts,
        assumptions: brief.assumptions,
        unknowns: brief.unknowns,
        clarifyingQuestions: brief.clarifyingQuestions,
        responses: Array.from(brief.responses.entries()).map(([id, resp]) => ({
          questionId: id,
          response: resp.response,
          timestamp: resp.timestamp
        })),
        estimatedComplexity: brief.estimatedComplexity,
        suggestedAgents: brief.suggestedAgents,
        completedBrief: brief.completedBrief
      }
    });
  } catch (error) {
    console.error('❌ Error fetching brief:', error);
    res.status(500).json({ error: 'Failed to fetch brief', detail: error.message });
  }
});

// Step 4: Approve brief and generate complete project brief
router.post('/brief/:briefId/approve', async (req, res) => {
  try {
    const { briefId } = req.params;
    
    console.log(`✅ [BRIEF:${briefId}] Generating complete brief`);
    const completedBrief = await briefManager.generateCompleteBrief(briefId);

    broadcast({
      type: 'brief_approved',
      briefId,
      completedBrief,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      completedBrief,
      message: 'Brief approved and completed successfully'
    });
  } catch (error) {
    console.error('❌ Error approving brief:', error);
    res.status(500).json({ error: 'Failed to approve brief', detail: error.message });
  }
});

// Step 5: Create workflow from approved brief
router.post('/brief/:briefId/create-workflow', async (req, res) => {
  try {
    const { briefId } = req.params;
    const brief = briefManager.getBrief(briefId);

    if (!brief || !brief.completedBrief) {
      return res.status(400).json({ error: 'Brief must be approved before creating workflow' });
    }

    const orchestrator = req.app.locals.orchestrator;
    if (!orchestrator) {
      return res.status(500).json({ error: 'Workflow orchestrator not available' });
    }

    console.log(`🚀 [BRIEF:${briefId}] Creating workflow from approved brief`);

    // Approval gating: if the brief analysis produced a high-priority
    // 'agent_mismatch' clarifying question, ensure the user answered it
    // and apply their choice to the completed brief before creating the workflow.
    try {
      const clarifiers = brief.clarifyingQuestions || (brief.analysis && brief.analysis.clarifyingQuestions) || [];
      const agentMismatch = clarifiers.find(q => q && q.id === 'agent_mismatch');

      // Determine initial requested agent from analysis if present
      const initialRequested = (brief.analysis && brief.analysis.requestedAgent) || null;

      if (agentMismatch) {
        // Require response before proceeding
        if (!brief.responses || !brief.responses.has('agent_mismatch')) {
          return res.status(400).json({
            error: 'agent_mismatch_unresolved',
            message: 'The brief includes a high-priority agent mismatch question. Please answer the clarifying question before creating a workflow.',
            question: agentMismatch
          });
        }

        const respEntry = brief.responses.get('agent_mismatch');
        const resp = respEntry && respEntry.response ? String(respEntry.response) : '';

        // Apply user's selection to the completed brief context
        if (!brief.completedBrief) brief.completedBrief = {};
        // Default to initial requested agent
        brief.completedBrief.requestedAgent = initialRequested;
        brief.completedBrief.agentExplicit = !!initialRequested;

        if (/^Assign\s+/i.test(resp)) {
          // Keep the originally requested agent
          // no-op, already set
        } else if (/^Reassign to\s+/i.test(resp)) {
          // Expect format: 'Reassign to Name1, Name2' -> pick first recommended agent
          const m = resp.match(/^Reassign to\s+(.+)$/i);
          if (m && m[1]) {
            const candidates = m[1].split(',').map(s => s.trim()).filter(Boolean);
            if (candidates.length > 0) {
              brief.completedBrief.requestedAgent = candidates[0];
              brief.completedBrief.agentExplicit = true;
            }
          }
        } else if (/let system choose/i.test(resp)) {
          // Clear explicit request and allow system to select
          brief.completedBrief.requestedAgent = null;
          brief.completedBrief.agentExplicit = false;
        }
      } else {
        // No agent_mismatch clarifier; propagate any requestedAgent from analysis
        if (!brief.completedBrief) brief.completedBrief = {};
        const initialRequested = (brief.analysis && brief.analysis.requestedAgent) || null;
        brief.completedBrief.requestedAgent = initialRequested;
        brief.completedBrief.agentExplicit = !!initialRequested;
      }
    } catch (e) {
      console.warn('[BRIEF CREATE] Warning while applying agent mismatch gating:', e && e.message);
      // Fall through - do not block workflow creation on gating errors
    }

    // Enhanced workflow creation with brief context
    const result = await orchestrator.createWorkflow(
      brief.completedBrief.directive,
      brief.completedBrief  // Pass complete brief for context
    );

    broadcast({
      type: 'workflow_created_from_brief',
      briefId,
      workflowId: result.workflowId,
      directive: brief.completedBrief.directive,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      workflowId: result.workflowId,
      workflow: result.workflow,
      brief: brief.completedBrief,
      message: 'Workflow created from approved brief'
    });
  } catch (error) {
    console.error('❌ Error creating workflow from brief:', error);
    res.status(500).json({ error: 'Failed to create workflow from brief', detail: error.message });
  }
});

// =====================================================
// ARTIFACT LINEAGE API ENDPOINTS (PHASE 3 COMPLETION)
// =====================================================

// Get artifact with full lineage information
router.get('/artifacts/:artifactId/lineage', async (req, res) => {
  try {
    const { artifactId } = req.params;
    const orchestrator = req.app.locals.orchestrator;
    
    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not available' });
    }

    const artifactWithLineage = orchestrator.getArtifactLineage(artifactId);
    
    if (!artifactWithLineage) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json({
      success: true,
      artifact: artifactWithLineage,
      links: orchestrator.generateArtifactLinks(artifactId)
    });
  } catch (error) {
    console.error('❌ Error fetching artifact lineage:', error);
    res.status(500).json({ error: 'Failed to fetch artifact lineage' });
  }
});

// Search artifacts with multiple criteria
router.get('/artifacts/search', async (req, res) => {
  try {
    const { 
      workflowId, 
      agentName, 
      fileName, 
      fileType, 
      createdAfter, 
      content,
      limit = 50 
    } = req.query;
    
    const orchestrator = req.app.locals.orchestrator;
    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not available' });
    }

    const criteria = {};
    if (workflowId) criteria.workflowId = workflowId;
    if (agentName) criteria.agentName = agentName;
    if (fileName) criteria.fileName = fileName;
    if (fileType) criteria.fileType = fileType;
    if (createdAfter) criteria.createdAfter = createdAfter;
    if (content) criteria.content = content;

    const results = orchestrator.searchArtifacts(criteria);
    const limitedResults = results.slice(0, parseInt(limit));

    res.json({
      success: true,
      artifacts: limitedResults,
      total: results.length,
      criteria
    });
  } catch (error) {
    console.error('❌ Error searching artifacts:', error);
    res.status(500).json({ error: 'Failed to search artifacts' });
  }
});

// Get all artifacts for a workflow with lineage
router.get('/workflows/:workflowId/artifacts', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const orchestrator = req.app.locals.orchestrator;
    
    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not available' });
    }

    const artifacts = orchestrator.getWorkflowArtifactsWithLineage(workflowId);

    res.json({
      success: true,
      workflowId,
      artifacts,
      total: artifacts.length
    });
  } catch (error) {
    console.error('❌ Error fetching workflow artifacts:', error);
    res.status(500).json({ error: 'Failed to fetch workflow artifacts' });
  }
});

// Get workflow by id (includes artifacts and any dbArtifactId links)
router.get('/workflows/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const orchestrator = req.app.locals.orchestrator;
    if (!orchestrator) return res.status(500).json({ error: 'Orchestrator not available' });

    // Prefer DB row for canonical fields
    const dbWorkflow = await require('../models').Workflow.findByPk(workflowId).catch(() => null);
    const memWorkflow = orchestrator.getWorkflowStatus(workflowId) || {};

    const merged = Object.assign({}, memWorkflow, dbWorkflow ? {
      id: dbWorkflow.id,
      directive: dbWorkflow.directive,
      status: dbWorkflow.status,
      startTime: dbWorkflow.start_time ? dbWorkflow.start_time.getTime() : undefined,
      endTime: dbWorkflow.end_time ? dbWorkflow.end_time.getTime() : undefined,
      tasks: dbWorkflow.tasks || memWorkflow.tasks || [],
      progress: dbWorkflow.progress || memWorkflow.progress || {},
      artifacts: dbWorkflow.artifacts || memWorkflow.artifacts || []
    } : memWorkflow);

    res.json({ success: true, workflow: merged });
  } catch (error) {
    console.error('❌ Error fetching workflow:', error);
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

// Get artifact details by db id (includes lineage if available)
router.get('/artifacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const models = require('../models');
    const orchestrator = req.app.locals.orchestrator;

    // Try DB first
    const dbArtifact = await models.Artifact.findByPk(id).catch(() => null);

    // Merge with in-memory lineage if orchestrator provides it
    let lineage = null;
    if (orchestrator && typeof orchestrator.getArtifactWithLineage === 'function') {
      lineage = orchestrator.getArtifactWithLineage(id);
    }

    if (!dbArtifact && !lineage) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    res.json({ success: true, artifact: dbArtifact || null, lineage });
  } catch (error) {
    console.error('❌ Error fetching artifact:', error);
    res.status(500).json({ error: 'Failed to fetch artifact' });
  }
});

// Stream/download artifact file (secure)
router.get('/artifacts/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    const models = require('../models');
    const orchestrator = req.app.locals.orchestrator;

    // Resolve DB artifact or in-memory lineage
    let dbArtifact = await models.Artifact.findByPk(id).catch(() => null);
    let lineage = orchestrator && typeof orchestrator.getArtifactWithLineage === 'function' ? orchestrator.getArtifactWithLineage(id) : null;

    // Prefer absolute path from lineage, then DB path
    const candidatePath = (lineage && lineage.metadata && lineage.metadata.absolutePath) || (dbArtifact && dbArtifact.path) || null;
    if (!candidatePath) {
      return res.status(404).json({ error: 'Artifact file path not available' });
    }

    // Normalize and ensure path is within agent workspaces directory
    const workspaceRoot = path.join(__dirname, '..', 'agent-workspaces');
    const normalized = path.normalize(candidatePath);
    if (!normalized.startsWith(workspaceRoot)) {
      // If DB stored a relative path, attempt to resolve under workspaceRoot
      const resolvedAttempt = path.join(workspaceRoot, normalized);
      if (!resolvedAttempt.startsWith(workspaceRoot)) {
        return res.status(403).json({ error: 'Artifact path is not allowed' });
      }
    }

    // Try streaming the file
    try {
      return res.sendFile(normalized, (err) => {
        if (err) {
          console.error('❌ Error sending artifact file:', err);
          if (!res.headersSent) res.status(404).json({ error: 'File not found' });
        }
      });
    } catch (err) {
      console.error('❌ Failed to stream artifact file:', err);
      return res.status(500).json({ error: 'Failed to stream file' });
    }
  } catch (error) {
    console.error('❌ Error in artifact file route:', error);
    res.status(500).json({ error: 'Failed to fetch artifact file' });
  }
});

// Get all artifacts for an agent with lineage  
router.get('/agents/:agentName/artifacts', async (req, res) => {
  try {
    const { agentName } = req.params;
    const orchestrator = req.app.locals.orchestrator;
    
    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not available' });
    }

    const artifacts = orchestrator.getAgentArtifactsWithLineage(agentName);

    res.json({
      success: true,
      agentName,
      artifacts,
      total: artifacts.length
    });
  } catch (error) {
    console.error('❌ Error fetching agent artifacts:', error);
    res.status(500).json({ error: 'Failed to fetch agent artifacts' });
  }
});

// Update artifact lineage when file is modified
router.post('/agents/:agentName/artifacts/:fileName/update', async (req, res) => {
  try {
    const { agentName, fileName } = req.params;
    const { content, modificationContext } = req.body;
    
    const orchestrator = req.app.locals.orchestrator;
    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not available' });
    }

    const artifactId = await orchestrator.updateArtifactLineage(
      agentName, 
      fileName, 
      content, 
      modificationContext || {}
    );

    if (artifactId) {
      res.json({
        success: true,
        artifactId,
        agentName,
        fileName,
        message: 'Artifact lineage updated'
      });
    } else {
      res.status(404).json({ error: 'Artifact not found for lineage update' });
    }
  } catch (error) {
    console.error('❌ Error updating artifact lineage:', error);
    res.status(500).json({ error: 'Failed to update artifact lineage' });
  }
});

// Get lineage report for debugging/monitoring
router.get('/artifacts/report', async (req, res) => {
  try {
    const orchestrator = req.app.locals.orchestrator;
    if (!orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not available' });
    }

    const report = orchestrator.getLineageReport();

    res.json({
      success: true,
      report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error generating lineage report:', error);
    res.status(500).json({ error: 'Failed to generate lineage report' });
  }
});

// Create autonomous workflow (Board Room directive) - Legacy support + Brief integration
router.post('/workflow', async (req, res) => {
  try {
    const { directive, briefId } = req.body;
    
    if (!directive) {
      return res.status(400).json({ error: 'Directive is required' });
    }

    const orchestrator = req.app.locals.orchestrator;
    if (!orchestrator) {
      return res.status(500).json({ error: 'Workflow orchestrator not available' });
    }

    let briefContext = null;
    
    // If briefId provided, get brief context
    if (briefId) {
      const brief = briefManager.getBrief(briefId);
      if (brief && brief.completedBrief) {
        // Apply gating similar to /brief/:briefId/create-workflow for agent_mismatch clarifier
        try {
          const clarifiers = brief.clarifyingQuestions || (brief.analysis && brief.analysis.clarifyingQuestions) || [];
          const agentMismatch = clarifiers.find(q => q && q.id === 'agent_mismatch');

          // If unresolved high-priority clarifier present, require response
          if (agentMismatch && (!brief.responses || !brief.responses.has('agent_mismatch'))) {
            return res.status(400).json({
              error: 'agent_mismatch_unresolved',
              message: 'The brief includes a high-priority agent mismatch question. Please answer the clarifying question before creating a workflow.',
              question: agentMismatch
            });
          }

          // Apply response if present
          let initialRequested = (brief.analysis && brief.analysis.requestedAgent) || null;
          if (!brief.completedBrief) brief.completedBrief = {};
          brief.completedBrief.requestedAgent = initialRequested;
          brief.completedBrief.agentExplicit = !!initialRequested;

          if (brief.responses && brief.responses.has('agent_mismatch')) {
            const respEntry = brief.responses.get('agent_mismatch');
            const resp = respEntry && respEntry.response ? String(respEntry.response) : '';

            if (/^Assign\s+/i.test(resp)) {
              // keep
            } else if (/^Reassign to\s+/i.test(resp)) {
              const m = resp.match(/^Reassign to\s+(.+)$/i);
              if (m && m[1]) {
                const candidates = m[1].split(',').map(s => s.trim()).filter(Boolean);
                if (candidates.length > 0) {
                  brief.completedBrief.requestedAgent = candidates[0];
                  brief.completedBrief.agentExplicit = true;
                }
              }
            } else if (/let system choose/i.test(resp)) {
              brief.completedBrief.requestedAgent = null;
              brief.completedBrief.agentExplicit = false;
            }
          }

        } catch (e) {
          console.warn('[LEGACY WORKFLOW CREATE] Warning while applying agent mismatch gating:', e && e.message);
          // fall through
        }

        briefContext = brief.completedBrief;
        console.log(`🚀 Creating workflow with brief context: ${briefId}`);
      }
    }

    console.log(`🚀 Creating autonomous workflow: "${directive}"`);
    const result = await orchestrator.createWorkflow(directive, briefContext);

    broadcast({
      type: 'workflow_created',
      workflowId: result.workflowId,
      directive,
      briefId,
      timestamp: new Date().toISOString()
    });

    res.json({ 
      success: true, 
      workflowId: result.workflowId,
      workflow: result.workflow,
      briefContext: briefContext ? 'Brief context applied' : 'Direct workflow creation'
    });
  } catch (error) {
    console.error('❌ Error creating workflow:', error);
    res.status(500).json({ error: 'Failed to create workflow', detail: error.message });
  }
});

// Get all workflows (fixed async issue)
router.get('/workflows', async (req, res) => {
  try {
    const orchestrator = req.app.locals.orchestrator;
    if (orchestrator) {
      // Fix: getAllWorkflows is async, need to await it
      const allWorkflows = await orchestrator.getAllWorkflows();
      const completedWorkflows = orchestrator.completedWorkflows || [];
      
      console.log(`[WORKFLOWS API] Found ${allWorkflows.length} workflows from database`);
      
      // Combine active and completed workflows
      const workflows = [...allWorkflows, ...completedWorkflows].map(workflow => ({
        id: workflow.id,
        directive: workflow.directive,
        status: workflow.status || 'running',
        createdAt: workflow.startTime ? new Date(workflow.startTime).toISOString() : new Date().toISOString(),
        progress: workflow.progress || { completed: 0, total: workflow.tasks?.length || 0, percentage: 0 },
        tasks: workflow.tasks || [],
        artifacts: workflow.artifacts || [],
        estimates: workflow.estimates
      }));

      res.json({ workflows, total: workflows.length });
    } else {
      console.log('[WORKFLOWS API] No orchestrator available');
      res.json({ workflows: [], total: 0 });
    }
  } catch (error) {
    console.error('[WORKFLOWS API] Error fetching workflows:', error);
    res.status(500).json({ error: 'Failed to fetch workflows', detail: error.message });
  }
});

// Get agent environment data (workspace files)
router.get('/agents/:agentName/environment', async (req, res) => {
  try {
    const agentName = req.params.agentName;
    const fs = require('fs').promises;
    const path = require('path');
    
    // Check both workspace and artifacts directories
    const workspaceDir = path.join(__dirname, '..', 'agent-workspaces', `${agentName.toLowerCase()}-workspace`);
    const artifactsDir = path.join(__dirname, '..', 'artifacts', agentName.toLowerCase());
    
    console.log(`[AGENT ENV] Loading environment for ${agentName}`);
    console.log(`[AGENT ENV] Workspace: ${workspaceDir}`);
    console.log(`[AGENT ENV] Artifacts: ${artifactsDir}`);
    
    let files = [];
    
    // Load workspace files (top-level only for directory browsing)
    try {
      await fs.access(workspaceDir);
      const workspaceFiles = await loadDirectoryContents(workspaceDir);
      files.push(...workspaceFiles.map(f => ({ ...f, source: 'workspace' })));
      console.log(`[AGENT ENV] Found ${workspaceFiles.length} workspace items`);
    } catch (error) {
      console.log(`[AGENT ENV] No workspace directory found: ${workspaceDir}`);
    }
    
    // Load artifact files (top-level only)
    try {
      await fs.access(artifactsDir);
      const artifactFiles = await loadDirectoryContents(artifactsDir);
      files.push(...artifactFiles.map(f => ({ ...f, source: 'artifacts' })));
      console.log(`[AGENT ENV] Found ${artifactFiles.length} artifact items`);
    } catch (error) {
      console.log(`[AGENT ENV] No artifacts directory found: ${artifactsDir}`);
    }
    
    console.log(`[AGENT ENV] Total items for ${agentName}: ${files.length}`);
    
    res.json({
      environment: {
        agentName,
        workspacePath: workspaceDir,
        artifactsPath: artifactsDir,
        files: files,
        totalFiles: files.length
      }
    });
  } catch (error) {
    console.error(`❌ Error loading agent environment:`, error);
    res.status(500).json({ error: 'Failed to load agent environment' });
  }
});

// Get directory contents for agent environment
router.get('/agents/:agentName/directory/*', async (req, res) => {
  try {
    const agentName = req.params.agentName;
    const relativePath = req.params[0] || '';
    const fs = require('fs').promises;
    const path = require('path');
    
    console.log(`[AGENT DIR] Loading directory contents: ${relativePath} for ${agentName}`);
    
    // Determine full path based on source
    const workspaceDir = path.join(__dirname, '..', 'agent-workspaces', `${agentName.toLowerCase()}-workspace`);
    const targetDir = path.join(workspaceDir, relativePath);
    
    // Security check - ensure path is within workspace
    const resolvedTarget = path.resolve(targetDir);
    const resolvedWorkspace = path.resolve(workspaceDir);
    
    if (!resolvedTarget.startsWith(resolvedWorkspace)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const files = await loadDirectoryContents(targetDir);
    console.log(`[AGENT DIR] Found ${files.length} items in ${relativePath}`);
    
    res.json({
      path: relativePath,
      files: files
    });
  } catch (error) {
    console.error(`❌ Error loading directory contents:`, error);
    res.status(500).json({ error: 'Failed to load directory contents' });
  }
});

// Helper function to load directory contents (top-level only)
async function loadDirectoryContents(dirPath) {
  const fs = require('fs').promises;
  const path = require('path');
  const files = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const stats = await fs.stat(fullPath);
      
      files.push({
        name: entry.name,
        path: fullPath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        type: entry.isDirectory() ? 'directory' : 'file'
      });
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }
  
  return files;
}

// Helper function to recursively load directory files
async function loadDirectoryFiles(dirPath, basePath) {
  const fs = require('fs').promises;
  const path = require('path');
  const files = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      
      if (entry.isDirectory()) {
        // Recursively load subdirectory files
        const subFiles = await loadDirectoryFiles(fullPath, basePath);
        files.push(...subFiles);
      } else {
        const stats = await fs.stat(fullPath);
        files.push({
          name: entry.name,
          path: relativePath,
          fullPath: fullPath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          type: path.extname(entry.name).slice(1) || 'file'
        });
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }
  
  return files;
}

// Get specific file content
router.get('/agents/:agentName/files/:fileName(*)', async (req, res) => {
  try {
    const agentName = req.params.agentName;
    const fileName = req.params.fileName;
    const fs = require('fs').promises;
    const path = require('path');
    
    console.log(`[AGENT FILE] Loading file ${fileName} for ${agentName}`);
    
    // Check workspace first, then artifacts
    const workspaceDir = path.join(__dirname, '..', 'agent-workspaces', `${agentName.toLowerCase()}-workspace`);
    const artifactsDir = path.join(__dirname, '..', 'artifacts', agentName.toLowerCase());
    
    let filePath;
    let found = false;
    
    // Try workspace first
    const workspacePath = path.join(workspaceDir, fileName);
    try {
      await fs.access(workspacePath);
      filePath = workspacePath;
      found = true;
      console.log(`[AGENT FILE] Found in workspace: ${workspacePath}`);
    } catch (error) {
      // Try artifacts directory
      const artifactPath = path.join(artifactsDir, fileName);
      try {
        await fs.access(artifactPath);
        filePath = artifactPath;
        found = true;
        console.log(`[AGENT FILE] Found in artifacts: ${artifactPath}`);
      } catch (error) {
        console.log(`[AGENT FILE] File not found in either location: ${fileName}`);
      }
    }
    
    if (!found) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    res.type('text/plain').send(content);
  } catch (error) {
    console.error(`❌ Error loading file:`, error);
    res.status(500).json({ error: 'Failed to load file' });
  }
});

// Save file content
router.put('/agents/:agentName/files/:fileName(*)', async (req, res) => {
  try {
    const agentName = req.params.agentName;
    const fileName = req.params.fileName;
    const fs = require('fs').promises;
    const path = require('path');
    
    console.log(`[AGENT FILE] Saving file ${fileName} for ${agentName}`);
    
    // Determine target directory (prefer workspace for edits)
    const workspaceDir = path.join(__dirname, '..', 'agent-workspaces', `${agentName.toLowerCase()}-workspace`);
    await fs.mkdir(workspaceDir, { recursive: true });
    
    const filePath = path.join(workspaceDir, fileName);
    const fileDir = path.dirname(filePath);
    await fs.mkdir(fileDir, { recursive: true });
    
    await fs.writeFile(filePath, req.body);
    
    console.log(`[AGENT FILE] Saved file: ${filePath}`);
    
    // Add lineage entry (simple version)
    const lineage = {
      timestamp: new Date().toISOString(),
      action: 'edited',
      file: fileName,
      agent: agentName,
      note: 'Manual edit via Agent Environment'
    };
    
    res.json({ success: true, lineage });
  } catch (error) {
    console.error(`❌ Error saving file:`, error);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

// Agent chat endpoint (enhanced)
router.post('/agents/:agentName/chat', async (req, res) => {
  try {
    const agentName = req.params.agentName;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    console.log(`[AGENT CHAT] ${agentName} received: ${message}`);
    
    // Simple agent response (could be enhanced with AI)
    const responses = {
      'Nova': [
        "I'm focused on creating responsive, modern frontend components. I use React and TypeScript for scalable development.",
        "I structured the CSS with mobile-first approach and used CSS Grid for layout flexibility.",
        "The component architecture follows atomic design principles for maximum reusability.",
        "I'm currently working on the kitten rescue splash page with engaging visuals and clear call-to-actions."
      ],
      'Alex': [
        "I'm coordinating the project timeline and ensuring all team dependencies are managed effectively.",
        "The task breakdown follows agile methodology with clear deliverables and realistic estimates.",
        "I monitor project risks and adjust resource allocation based on team capacity and priorities."
      ],
      'Pixel': [
        "I'm focused on creating visually appealing designs that enhance user experience and brand consistency.",
        "The color palette and typography choices support readability and emotional connection with users.",
        "I ensure all design elements are accessible and follow modern UX best practices."
      ]
    };
    
    const agentResponses = responses[agentName] || [
      `I'm ${agentName}, and I'm here to help with any questions about my work and decisions.`,
      "I follow best practices and focus on delivering high-quality results for the team."
    ];
    
    const response = agentResponses[Math.floor(Math.random() * agentResponses.length)];
    
    res.json({
      success: true,
      message: response,
      agent: agentName,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`❌ Error in agent chat:`, error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// File preview endpoint
router.post('/agents/:agentName/preview', async (req, res) => {
  try {
    const agentName = req.params.agentName;
    const { file, type } = req.body;
    
    console.log(`[AGENT PREVIEW] Creating preview for ${file} (${type})`);
    
    // For HTML files, create a simple preview URL
    if (type === 'html') {
      const previewUrl = `/api/agents/${agentName}/files/${encodeURIComponent(file)}`;
      res.json({
        success: true,
        previewUrl: previewUrl,
        type: 'html'
      });
    } else {
      res.json({
        success: true,
        message: `Preview for ${file} is available in the editor`,
        type: 'text'
      });
    }
  } catch (error) {
    console.error(`❌ Error creating preview:`, error);
    res.status(500).json({ error: 'Failed to create preview' });
  }
});

module.exports = { router, initializeWebSocket, broadcast };

// Capability harnesses for key agents (Nova/Zephyr/Cipher/Sage)
// POST /api/autonomous/agents/:agentId/harness/:cap
router.post('/agents/:agentId/harness/:cap', async (req, res) => {
  try {
    const { Agent } = require('../models');
    const { Run, Artifact } = require('../models');
    const agent = await Agent.findByPk(req.params.agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const cap = req.params.cap.toLowerCase();
    const projectId = (req.body && req.body.projectId) || 'shellcompany';
    const projRoot = path.join(os.homedir(), 'ShellCompany', projectId);
    await fsp.mkdir(projRoot, { recursive: true });

    let result = { ok: true };
    if (cap === 'nova') {
      const file = path.join(projRoot, 'frontend');
      await fsp.mkdir(file, { recursive: true });
      const component = path.join(file, 'NovaSample.tsx');
      await fsp.writeFile(component, `export const NovaSample = () => <div>NOVA OK - ${new Date().toISOString()}</div>;\n`);
      const crypto = require('crypto');
      const buf = Buffer.from(await fsp.readFile(component));
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const { Artifact } = require('../models');
      const art = await Artifact.create({ project_id: projectId, path: component, sha256, bytes: buf.length, produced_by_task: null });
      result = { ok: true, artifact: art };
      bus.emit('event', { source: 'agent', kind: 'file_written', project: projectId, payload: { path: component, sha256 } });
    } else if (cap === 'zephyr') {
      const tmpDir = path.join(projRoot, 'backend');
      await fsp.mkdir(tmpDir, { recursive: true });
      const outFile = path.join(tmpDir, 'healthz.txt');
      const port = 5200 + Math.floor(Math.random()*300);
      const script = `node -e \'require(\"http\").createServer((q,r)=>{if(q.url===\"/healthz\"){r.end(\"ok\")}else r.end(\"root\")}).listen(${port})\' & pid=$!; sleep 0.3; curl -s http://127.0.0.1:${port}/healthz > ${outFile}; kill $pid 2>/dev/null || true`;
      await taskRunner.startTask({ projectId, command: 'bash', args: ['-lc', script], cwd: projRoot });
      const buf = await fsp.readFile(outFile).catch(() => Buffer.from(''));
      const crypto = require('crypto');
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const art = await Artifact.create({ project_id: projectId, path: outFile, sha256, bytes: buf.length, produced_by_task: null });
      result = { ok: true, artifact: art, port };
      bus.emit('event', { source: 'agent', kind: 'service_probe', project: projectId, payload: { port, status: buf.toString() } });
    } else if (cap === 'cipher') {
      const outFile = path.join(projRoot, 'audit.json');
      const cmd = `npm audit --json > ${outFile} 2>/dev/null || echo '{"note":"npm audit unavailable"}' > ${outFile}`;
      await taskRunner.startTask({ projectId, command: 'bash', args: ['-lc', cmd], cwd: projRoot });
      const buf = await fsp.readFile(outFile).catch(() => Buffer.from('{}'));
      const crypto = require('crypto');
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const art = await Artifact.create({ project_id: projectId, path: outFile, sha256, bytes: buf.length, produced_by_task: null });
      result = { ok: true, artifact: art };
      bus.emit('event', { source: 'agent', kind: 'security_scan', project: projectId, payload: { path: outFile } });
    } else if (cap === 'sage') {
      // Minimal vercel connectivity run record
      const fetch = (await import('node-fetch')).default;
      const token = process.env.VERCEL_TOKEN;
      const r = await fetch('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({}));
      const run = await Run.create({ project_id: projectId, provider: 'vercel', job_id: (r.user && r.user.uid) || 'unknown', url: 'https://vercel.com', status: 'completed', started_at: new Date(), finished_at: new Date(), meta_json: r });
      result = { ok: true, run };
      bus.emit('event', { source: 'vercel', kind: 'account_ping', project: projectId, payload: { user: r.user?.username || r.user?.name || 'unknown' } });
    } else {
      return res.status(400).json({ error: 'Unknown capability' });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'harness_failed', detail: e.message });
  }
});
