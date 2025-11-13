// server/routes/mvp-api.js
const express = require('express');
const router = express.Router();
const { Agent, Directive, Project, Log } = require('../models');

// Agents
router.get('/agents', async (req, res) => {
  const agents = await Agent.findAll();
  res.json(agents);
});
router.post('/agents', async (req, res) => {
  const agent = await Agent.create(req.body);
  res.json(agent);
});

// Advanced agent execution integration
const AgentExecutor = require('../services/agent-executor');
const ConsoleLogger = require('../services/console-logger');
const WorkflowOrchestrator = require('../services/workflow-orchestrator');

// Ollama integration
const ollama = require('../services/ollama-provider');

// Get available Ollama models
router.get('/ollama/models', async (req, res) => {
  try {
    const models = await ollama.getModels();
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Execute agent (MVP + advanced)
router.post('/agents/execute', async (req, res) => {
  try {
    const { agentId, directiveId, modelProvider, modelName, ollamaOptions } = req.body;
    const agent = await Agent.findByPk(agentId);
    const directiveObj = await Directive.findByPk(directiveId);
    if (!agent || !directiveObj) return res.status(404).send('Agent or directive not found');

    let result;
    if (modelProvider === 'ollama') {
      // Use Ollama for agent execution (cloud or local)
      result = await ollama.execute(agentId, directiveObj.description, modelName, ollamaOptions);
    } else if (modelProvider === 'openai') {
      result = await agentExecutor.executeOpenAI(agentId, directiveObj.description, modelName);
    } else if (modelProvider === 'anthropic') {
      result = await agentExecutor.executeAnthropic(agentId, directiveObj.description, modelName);
    } else {
      // Default to local agent runner
      result = await agentRunner.run(agentId, directiveObj.description);
    }

    res.json({ success: true, result });
  } catch (err) {
    // Log error
    ConsoleLogger.addLogEntry({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `[MVP] Error executing agent: ${err.message}`,
      source: 'mvp-api'
    });
    return res.status(500).json({ error: err.message });
  }
});
// ...existing code...

// Directives
router.get('/directives', async (req, res) => {
  const directives = await Directive.findAll();
  res.json(directives);
});
router.post('/directives', async (req, res) => {
  const directive = await Directive.create(req.body);
  res.json(directive);
});
router.put('/directives/:id', async (req, res) => {
  const directive = await Directive.findByPk(req.params.id);
  if (!directive) return res.status(404).send('Not found');
  await directive.update(req.body);
  res.json(directive);
});

// Projects
router.get('/projects', async (req, res) => {
  const projects = await Project.findAll();
  res.json(projects);
});
router.post('/projects', async (req, res) => {
  const project = await Project.create(req.body);
  res.json(project);
});

// Logs
router.get('/logs', async (req, res) => {
  const { agentId, directiveId } = req.query;
  const where = {};
  if (agentId) where.agentId = agentId;
  if (directiveId) where.directiveId = directiveId;
  const logs = await Log.findAll({ where });
  res.json(logs);
});

module.exports = router;
