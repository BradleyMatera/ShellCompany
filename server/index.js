// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Provider and engine monitoring
const providerMonitor = require('./services/provider-monitor');
const agentEngine = require('./services/agent-engine');

// Import console logger FIRST to capture all logs
const consoleLogger = require('./services/console-logger');

// Import AI workers service
const aiWorkers = require('./services/ai-workers');

// Import health monitoring
const healthMonitor = require('./services/health-monitor');

// Import workspace manager
const workspaceManager = require('./services/workspace-manager');

// Import project manager
const projectManager = require('./services/project-manager');

// Import autonomous agent system
const { initializeDatabase } = require('./models');
const { router: autonomousRouter, initializeWebSocket } = require('./routes/autonomous-api');

const app = express();
const PORT = 3001;

// In-memory event buffer for Console view
const EVENT_LIMIT = 500;
const eventBuffer = [];
function pushEvent(evt) {
  const enriched = { id: Math.random().toString(36).slice(2), ts: new Date().toISOString(), ...evt };
  eventBuffer.push(enriched);
  if (eventBuffer.length > EVENT_LIMIT) eventBuffer.shift();
}

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));
app.use(express.json());
app.use('/api/agents/*/files/*', express.text({ type: '*/*' }));
app.use('/api/projects/*/files/*', express.text({ type: '*/*' }));

// Add health monitoring middleware (disabled for now)
// app.use(healthMonitor.requestTracker());

// Enhanced HTTP request logging with timing and status codes
app.use((req, res, next) => {
  const start = Date.now();
  
  // Log request start
  console.log(`[HTTP] ${req.method} ${req.path} - ${req.ip} - Started`);
  
  // Capture response end
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
});

// Health check endpoints
app.get('/health', (req, res) => {
  const health = healthMonitor.getHealthStatus();
  res.status(health.status === 'critical' ? 503 : 200).json(health);
});

app.get('/metrics', (req, res) => {
  res.json(healthMonitor.getDetailedMetrics());
});

// Simple root handlers
app.get('/', (req, res) => res.send('ShellCompany API (simple server)'));
app.get('/api', (req, res) => res.send('ShellCompany API root'));

// API Routes - Projects from database
app.get('/api/projects', async (req, res) => {
  try {
    const { Project } = require('./models');
    let list = await Project.findAll();
    // Fallback: return a default project in dev if DB is empty
    if ((list?.length || 0) === 0) {
      const defaultProject = {
        id: 'shellcompany',
        name: 'ShellCompany',
        description: 'Autonomous AI company development project',
        status: 'active',
        progress: 0,
        workers: [],
        tasks: [],
        repository: { url: '', branch: 'main' }
      };
      return res.json([defaultProject]);
    }
    // Map Sequelize rows to a minimal shape expected by client
    const mapped = list.map(p => ({
      id: (p.name || String(p.id)).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: p.name || `Project ${p.id}`,
      description: p.description || '',
      status: p.status || 'active',
      progress: 0,
      workers: [],
      tasks: [],
      repository: { url: '', branch: 'main' }
    }));
    res.json(mapped);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.json([]);
  }
});

// Company status endpoint
app.get('/api/company/status', (req, res) => {
  res.json({
    status: 'operational',
    version: '1.0.0',
    uptime: process.uptime(),
    agents: {
      total: 37,
      active: 37,
      idle: 37
    }
  });
});


// Minimal mocks for endpoints used by the dashboard details view
app.get('/api/projects/:id/environments', (req, res) => {
  res.json({
    development: { status: 'running', health: 'healthy', url: '' },
    staging: { status: 'stopped', health: 'unknown', url: '' },
    production: { status: 'stopped', health: 'unknown', url: '' }
  });
});

app.get('/api/projects/:id/pipeline', (req, res) => {
  res.json({
    lastRun: { id: 'demo', status: 'success', startedAt: new Date().toISOString(), duration: 120000 },
    steps: [
      { name: 'Install', status: 'success' },
      { name: 'Build', status: 'success' },
      { name: 'Test', status: 'success' }
    ]
  });
});

app.get('/api/projects/:id/filesystem', (req, res) => {
  res.json({ root: [], count: 0 });
});

app.get('/api/projects/:id/metrics', (req, res) => {
  res.json({
    coverage: { lines: 0, functions: 0, branches: 0, statements: 0 },
    security: { vulnerabilities: 0, grade: 'A', lastScan: null }
  });
});

// Integrations providers endpoint
app.get('/api/integrations/providers', (req, res) => {
  res.json({
    github: { connected: true, status: 'active' },
    vercel: { connected: true, status: 'active' },
    google: { connected: false, status: 'disconnected' }
  });
});

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({ 
    ok: true, 
    version: '1.0.0',
    ws: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Board Room API - Real autonomous workflow
app.post('/boardroom/messages', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { projectId, author, message } = req.body;
  
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  // TODO: Persist message to database
  // TODO: Trigger Alex PM agent to create plan
  // TODO: Emit boardroom.plan event via WebSocket
  
  console.log(`[BOARDROOM] ${author}: ${message} (Project: ${projectId})`);
  
  // Simulate immediate plan creation by Alex
  setTimeout(() => {
    const plan = {
      messageId,
      projectId,
      plan: `Analysis of "${message}": This requires frontend development, backend APIs, and testing.`,
      tasks: [
        { id: 'task_1', title: 'Create frontend components', assignee: 'Nova', status: 'created' },
        { id: 'task_2', title: 'Implement backend endpoints', assignee: 'Zephyr', status: 'created' },
        { id: 'task_3', title: 'Add security review', assignee: 'Cipher', status: 'created' }
      ],
      createdAt: new Date().toISOString()
    };
    
    // Emit to WebSocket clients
    if (global.wsClients) {
      global.wsClients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'boardroom.plan', data: plan }));
        }
      });
    }
  }, 1000);
  
  res.json({ messageId, accepted: true });
});

app.get('/boardroom/stream', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  // TODO: Return recent boardroom activity
  res.json({ messages: [], plans: [] });
});

// Engine Status API - Live provider monitoring
app.get('/engine/status', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.query.ping === 'true') {
      await providerMonitor.pingAll();
    }
    const payload = providerMonitor.buildStatusPayload({ agentEngine, orchestrator: req.app.locals.orchestrator });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch engine status', detail: error.message });
  }
});

app.get('/api/engine/status', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    if (req.query.ping === 'true') {
      await providerMonitor.pingAll();
    }
    const payload = providerMonitor.buildStatusPayload({ agentEngine, orchestrator: req.app.locals.orchestrator });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch engine status', detail: error.message });
  }
});

// Engine testing and logs endpoints
app.post('/api/engine/test/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { prompt } = req.body || {};
    const result = await providerMonitor.test(provider, prompt || 'Echo test: Hello from ShellCompany.');
    res.json({ provider, ...result });
  } catch (error) {
    res.status(400).json({ provider: req.params.provider, success: false, error: error.message });
  }
});

app.get('/api/engine/logs', (req, res) => {
  const { provider, limit } = req.query;
  try {
    const logs = providerMonitor.getLogs({ provider, limit: parseInt(limit || '100', 10) });
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch logs', detail: error.message });
  }
});

// Client-reported log entry (for non-JSON or proxy HTML errors)
app.post('/api/engine/logs', (req, res) => {
  try {
    const { provider, action = 'client_error', success = false, statusCode, error, snippet, latencyMs } = req.body || {};
    if (!provider) return res.status(400).json({ error: 'provider required' });

    // Redact any accidental secrets
    const scrub = (s) => typeof s === 'string' ? s.replace(/(api[_-]?key|token)=([^&\s]+)/ig, '$1=REDACTED') : s;

    providerMonitor.record(provider, {
      action,
      success: !!success,
      statusCode: statusCode ? parseInt(statusCode, 10) : undefined,
      error: scrub(error),
      snippet: typeof snippet === 'string' ? snippet.slice(0, 200) : undefined,
      latencyMs: latencyMs ? parseInt(latencyMs, 10) : undefined
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to record log', detail: e.message });
  }
});

app.get('/api/engine/models', async (req, res) => {
  try {
    const summary = await providerMonitor.getModelsSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch models', detail: error.message });
  }
});

// Cost mode policies: economy | balanced | premium
app.get('/api/engine/policies', (req, res) => {
  try {
    res.json(providerMonitor.policies || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch policies', detail: error.message });
  }
});

app.post('/api/engine/provider/:provider/cost-mode', (req, res) => {
  try {
    const { provider } = req.params;
    const { mode } = req.body || {};
    if (!provider) return res.status(400).json({ error: 'provider required' });
    if (!mode) return res.status(400).json({ error: 'mode required (economy|balanced|premium)' });
    const result = providerMonitor.setCostMode(provider, mode);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/engine/provider/:provider/model', (req, res) => {
  try {
    const { provider } = req.params;
    const { model } = req.body || {};
    if (!provider) return res.status(400).json({ error: 'provider required' });
    if (!model) return res.status(400).json({ error: 'model required' });
    const result = providerMonitor.setPreferredModel(provider, model);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/engine/ping', async (req, res) => {
  try {
    const { provider } = req.body || {};
    if (provider) {
      const state = await providerMonitor.ping(provider);
      return res.json({ provider, state });
    }
    const results = await providerMonitor.pingAll();
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to ping provider(s)', detail: error.message });
  }
});

// Agents API - Real AI worker data from integrated configuration
app.get('/agents', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    const agents = aiWorkers.getWorkers();
    res.json(agents);
  } catch (error) {
    console.error('Failed to fetch AI workers:', error);
    res.json([]);
  }
});

// Add missing autonomous workflow route for Board Room
app.get('/api/autonomous/workflow', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({ 
    status: 'operational',
    agents: ['Alex', 'Nova', 'Zephyr', 'Cipher', 'Sage'],
    activeWorkflows: 0,
    queuedTasks: 0,
    message: 'Autonomous workflow system ready'
  });
});

// POST handler for Board Room workflow requests - REAL AUTONOMOUS EXECUTION
app.post('/api/autonomous/workflow', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { directive } = req.body; // Fixed: expect 'directive' not 'content'
  
  if (!directive) {
    return res.status(400).json({ 
      success: false, 
      error: 'Directive is required' 
    });
  }

  console.log(`[BOARDROOM] REAL workflow request: "${directive}"`);
  
  try {
    // Create REAL autonomous workflow with actual agent execution
    const orchestrator = req.app.locals.orchestrator;
    if (!orchestrator) {
      return res.status(500).json({ 
        error: 'Workflow orchestrator not available' 
      });
    }
    
    const { workflowId, workflow } = await orchestrator.createWorkflow(directive);
    
    console.log(`[BOARDROOM] Created REAL workflow ${workflowId} with ${workflow.tasks.length} tasks`);
    
    res.json({ 
      success: true,
      workflowId: workflowId,
      message: 'REAL autonomous workflow initiated successfully',
      estimatedCompletion: workflow.estimates.explanation,
      tasks: workflow.tasks.length,
      agents: workflow.estimates.availableAgents
    });
    
  } catch (error) {
    console.error('[BOARDROOM] Failed to create workflow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create autonomous workflow',
      details: error.message
    });
  }
});

// Add autonomous agent routes
app.use('/api/autonomous', autonomousRouter);

// ONGOING PROJECTS API - Real workflow persistence
app.get('/api/autonomous/workflows', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const orchestrator = req.app.locals.orchestrator;
    if (!orchestrator) {
      console.log('No orchestrator found, returning empty workflows');
      return res.json({ workflows: [] });
    }

    // Use the new async getAllWorkflows method that loads from database
    const allWorkflows = await orchestrator.getAllWorkflows();
    
    console.log(`[API] Loaded ${allWorkflows.length} workflows from database`);
    
    // Convert workflows to API format
    const workflows = allWorkflows.map(workflow => ({
      id: workflow.id,
      directive: workflow.directive,
      status: workflow.status || 'running',
      createdAt: workflow.startTime ? new Date(workflow.startTime).toISOString() : new Date().toISOString(),
      completedAt: workflow.endTime ? new Date(workflow.endTime).toISOString() : null,
      duration: workflow.totalDuration,
      progress: workflow.progress || { completed: 0, total: workflow.tasks?.length || 0, percentage: 0 },
      tasks: workflow.tasks || [],
      artifacts: workflow.artifacts || [],
      estimates: workflow.estimates
    }));

    console.log(`[API] Returning ${workflows.length} workflows to client`);
    res.json({ workflows });
  } catch (error) {
    console.error('Failed to fetch workflows:', error);
    res.json({ workflows: [] });
  }
});

app.get('/api/autonomous/workflows/:workflowId', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { workflowId } = req.params;
  
  try {
    const orchestrator = req.app.locals.orchestrator;
    if (!orchestrator) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflow = orchestrator.getWorkflowStatus(workflowId);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json({ workflow });
  } catch (error) {
    console.error('Failed to fetch workflow:', error);
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

// ARTIFACTS API - Real artifact management
app.get('/api/autonomous/workflows/:workflowId/artifacts', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { workflowId } = req.params;
  
  try {
    const orchestrator = req.app.locals.orchestrator;
    if (!orchestrator) {
      return res.json({ artifacts: [] });
    }

    const workflow = orchestrator.getWorkflowStatus(workflowId);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Get artifacts from agent workspaces
    const fs = require('fs');
    const path = require('path');
    const artifacts = [];

    for (const task of workflow.tasks || []) {
      const agentName = task.assignedAgent;
      const agentWorkspace = path.join(__dirname, 'agent-workspaces', `${agentName.toLowerCase()}-workspace`);
      
      if (fs.existsSync(agentWorkspace)) {
        const files = fs.readdirSync(agentWorkspace, { withFileTypes: true });
        
        for (const file of files) {
          const filePath = path.join(agentWorkspace, file.name);
          const stats = fs.statSync(filePath);
          
          artifacts.push({
            id: `${agentName}-${file.name}`,
            name: file.name,
            type: file.isDirectory() ? 'folder' : 'file',
            size: file.isDirectory() ? 'N/A' : `${Math.round(stats.size / 1024)}KB`,
            agent: agentName,
            createdAt: stats.birthtime.toISOString(),
            path: filePath
          });
        }
      }
    }

    res.json({ artifacts });
  } catch (error) {
    console.error('Failed to fetch artifacts:', error);
    res.json({ artifacts: [] });
  }
});

app.get('/api/autonomous/workflows/:workflowId/artifacts/:artifactId/download', async (req, res) => {
  const { workflowId, artifactId } = req.params;
  
  try {
    const orchestrator = req.app.locals.orchestrator;
    if (!orchestrator) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflow = orchestrator.getWorkflowStatus(workflowId);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Find artifact file
    const fs = require('fs');
    const path = require('path');
    const [agentName, fileName] = artifactId.split('-', 2);
    const agentWorkspace = path.join(__dirname, 'agent-workspaces', `${agentName.toLowerCase()}-workspace`);
    const filePath = path.join(agentWorkspace, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      // For directories, create a zip archive
      const archiver = require('archiver');
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      res.attachment(`${fileName}.zip`);
      archive.pipe(res);
      archive.directory(filePath, false);
      archive.finalize();
    } else {
      // For files, send directly
      res.download(filePath, fileName);
    }

  } catch (error) {
    console.error('Failed to download artifact:', error);
    res.status(500).json({ error: 'Failed to download artifact' });
  }
});

// AGENT ENVIRONMENT API - Real agent workspace access
app.get('/api/agents/:agentName/environment', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { agentName } = req.params;

  try {
    const environment = await workspaceManager.getAgentEnvironment(agentName.toLowerCase());
    res.json({ environment });
  } catch (error) {
    console.error('Failed to fetch agent environment:', error);
    res.status(500).json({ error: 'Failed to fetch agent environment' });
  }
});

// Agent file access endpoints
app.get('/api/agents/:agentName/files/:filePath(*)', async (req, res) => {
  const { agentName, filePath } = req.params;

  try {
    const content = await workspaceManager.getFileContent(agentName.toLowerCase(), filePath || '');
    res.send(content);
  } catch (error) {
    if (error.message === 'File not found') {
      return res.status(404).send('File not found');
    }
    if (error.message.includes('Access denied')) {
      return res.status(403).send('Access denied');
    }
    console.error('Failed to read file:', error);
    res.status(500).send('Failed to read file');
  }
});

app.put('/api/agents/:agentName/files/:filePath(*)', async (req, res) => {
  const { agentName, filePath } = req.params;
  const content = req.body;

  try {
    await workspaceManager.saveFileContent(agentName.toLowerCase(), filePath || '', content);

    console.log(`[AGENT-ENV] File saved: ${filePath} by agent ${agentName}`);

    res.json({
      message: 'File saved successfully',
      path: filePath,
      size: Buffer.byteLength(content, 'utf8')
    });
  } catch (error) {
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    console.error('Failed to save file:', error);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

// PROJECT MANAGEMENT API - Real project workspace management
app.get('/api/projects', async (req, res) => {
  try {
    const workspaces = await projectManager.getProjectWorkspaces();
    const stats = await projectManager.getProjectStats();

    res.json({
      workspaces,
      stats,
      total: workspaces.reduce((sum, w) => sum + w.projects.length, 0)
    });
  } catch (error) {
    console.error('Failed to get project workspaces:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.get('/api/projects/:agentName/:projectName', async (req, res) => {
  const { agentName, projectName } = req.params;

  try {
    const workspaces = await projectManager.getProjectWorkspaces();
    const workspace = workspaces.find(w => w.agent === agentName);
    const project = workspace?.projects.find(p => p.name === projectName);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project });
  } catch (error) {
    console.error('Failed to get project details:', error);
    res.status(500).json({ error: 'Failed to fetch project details' });
  }
});

app.get('/api/projects/:agentName/:projectName/files/:filePath(*)', async (req, res) => {
  const { agentName, projectName, filePath } = req.params;

  try {
    const content = await projectManager.getProjectContent(agentName, projectName, filePath || '');
    res.send(content);
  } catch (error) {
    if (error.message === 'File not found') {
      return res.status(404).send('File not found');
    }
    if (error.message.includes('Access denied')) {
      return res.status(403).send('Access denied');
    }
    console.error('Failed to read project file:', error);
    res.status(500).send('Failed to read file');
  }
});

app.put('/api/projects/:agentName/:projectName/files/:filePath(*)', async (req, res) => {
  const { agentName, projectName, filePath } = req.params;
  const content = req.body;

  try {
    await projectManager.saveProjectContent(agentName, projectName, filePath || '', content);

    console.log(`[PROJECT] File saved: ${filePath} in ${agentName}/${projectName}`);

    res.json({
      message: 'File saved successfully',
      path: filePath,
      size: Buffer.byteLength(content, 'utf8')
    });
  } catch (error) {
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    console.error('Failed to save project file:', error);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

app.post('/api/projects/:agentName/:projectName/commands', async (req, res) => {
  const { agentName, projectName } = req.params;
  const { command } = req.body;

  try {
    const result = await projectManager.runProjectCommand(agentName, projectName, command);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/projects/:agentName/:projectName/clone', async (req, res) => {
  const { agentName, projectName } = req.params;
  const { newProjectName } = req.body;

  try {
    await projectManager.cloneProject(agentName, projectName, newProjectName);
    res.json({ message: 'Project cloned successfully', newProject: newProjectName });
  } catch (error) {
    console.error('Failed to clone project:', error);
    res.status(500).json({ error: 'Failed to clone project' });
  }
});

app.delete('/api/projects/:agentName/:projectName', async (req, res) => {
  const { agentName, projectName } = req.params;

  try {
    await projectManager.deleteProject(agentName, projectName);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Failed to delete project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Agent chat endpoint
app.post('/api/agents/:agentName/chat', async (req, res) => {
  const { agentName } = req.params;
  const { message } = req.body;
  
  try {
    // Simulate agent response (in real implementation, this would use the actual agent)
    const responses = {
      'Alex': [
        `As project manager, I'd say: ${message}`,
        'From a project coordination perspective, that makes sense.',
        'Let me break that down into actionable tasks.',
        'I see this fitting into our current sprint goals.'
      ],
      'Nova': [
        `Looking at the frontend implications: ${message}`,
        'I can implement that with React and TypeScript.',
        'This will require some UI component updates.',
        'The user experience should be smooth with this approach.'
      ],
      'Pixel': [
        `From a design standpoint: ${message}`,
        'This could enhance the visual hierarchy.',
        'I\'d recommend considering the color palette for this.',
        'The user interface should remain intuitive.'
      ],
      'Zephyr': [
        `Backend perspective: ${message}`,
        'This will need database schema changes.',
        'I can create the necessary API endpoints.',
        'Performance implications should be minimal.'
      ],
      'Cipher': [
        `Security-wise: ${message}`,
        'We need to ensure proper authentication for this.',
        'Let me audit this for potential vulnerabilities.',
        'Access controls should be implemented properly.'
      ],
      'Sage': [
        `From an infrastructure angle: ${message}`,
        'This might require deployment pipeline updates.',
        'Monitoring and logging should be in place.',
        'Scalability considerations look good.'
      ]
    };

    const agentResponses = responses[agentName] || responses['Alex'];
    const response = agentResponses[Math.floor(Math.random() * agentResponses.length)];
    
    console.log(`[AGENT-CHAT] ${agentName}: User said "${message}", responding with "${response}"`);
    
    res.json({ message: response });

  } catch (error) {
    console.error('Failed to process chat message:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// Agent preview endpoint
app.post('/api/agents/:agentName/preview', async (req, res) => {
  const { agentName, file, type } = req.body;
  
  try {
    const fs = require('fs');
    const path = require('path');
    const agentWorkspace = path.join(__dirname, 'agent-workspaces', `${agentName.toLowerCase()}-workspace`);
    const fullPath = path.join(agentWorkspace, file || '');
    
    // Security: ensure path is within agent workspace
    if (!fullPath.startsWith(agentWorkspace)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (type === 'html') {
      // For HTML files, serve them directly
      const previewUrl = `/api/agents/${agentName}/preview-file/${encodeURIComponent(file)}`;
      res.json({ previewUrl });
    } else {
      // For other files, provide a generic preview
      const previewUrl = `/api/agents/${agentName}/preview-file/${encodeURIComponent(file)}`;
      res.json({ previewUrl });
    }

    console.log(`[AGENT-PREVIEW] ${agentName} previewing ${file}`);

  } catch (error) {
    console.error('Failed to create preview:', error);
    res.status(500).json({ error: 'Failed to create preview' });
  }
});

// Serve preview files
app.get('/api/agents/:agentName/preview-file/:filePath(*)', async (req, res) => {
  const { agentName, filePath } = req.params;
  
  try {
    const fs = require('fs');
    const path = require('path');
    const agentWorkspace = path.join(__dirname, 'agent-workspaces', `${agentName.toLowerCase()}-workspace`);
    const fullPath = path.join(agentWorkspace, decodeURIComponent(filePath));
    
    // Security: ensure path is within agent workspace
    if (!fullPath.startsWith(agentWorkspace)) {
      return res.status(403).send('Access denied');
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).send('File not found');
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      return res.status(400).send('Cannot preview directory');
    }

    // Set appropriate content type
    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.md': 'text/markdown'
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'text/plain');
    res.sendFile(fullPath);

  } catch (error) {
    console.error('Failed to serve preview file:', error);
    res.status(500).send('Failed to serve preview file');
  }
});

app.get('/api/agents/:agentName/environment/file', async (req, res) => {
  const { agentName } = req.params;
  const { path: filePath } = req.query;
  
  try {
    const fs = require('fs');
    const path = require('path');
    const agentWorkspace = path.join(__dirname, 'agent-workspaces', `${agentName.toLowerCase()}-workspace`);
    const fullPath = path.join(agentWorkspace, filePath || '');
    
    // Security: ensure path is within agent workspace
    if (!fullPath.startsWith(agentWorkspace)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory' });
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    res.json({ 
      content, 
      path: filePath, 
      size: stats.size,
      modified: stats.mtime.toISOString()
    });

  } catch (error) {
    console.error('Failed to read file:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

app.post('/api/agents/:agentName/environment/file', async (req, res) => {
  const { agentName } = req.params;
  const { path: filePath, content } = req.body;
  
  try {
    const fs = require('fs');
    const path = require('path');
    const agentWorkspace = path.join(__dirname, 'agent-workspaces', `${agentName.toLowerCase()}-workspace`);
    const fullPath = path.join(agentWorkspace, filePath || '');
    
    // Security: ensure path is within agent workspace
    if (!fullPath.startsWith(agentWorkspace)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create directory if it doesn't exist
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, 'utf8');
    
    res.json({ 
      message: 'File saved successfully',
      path: filePath,
      size: Buffer.byteLength(content, 'utf8')
    });

  } catch (error) {
    console.error('Failed to save file:', error);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

// Events API for Console panel (empty buffer unless something pushes)
app.get('/api/events', (req, res) => {
  res.json({ events: eventBuffer });
});

// Console logs API for real-time console tab
app.get('/api/console/logs', (req, res) => {
  res.json({ logs: consoleLogger.getLogBuffer() });
});

// Test endpoint to trigger console logs for debugging
app.post('/api/test-log', (req, res) => {
  const { message } = req.body;
  console.log(`[TEST-LOG] ${message || 'Default test message'}`);
  console.error(`[TEST-ERROR] ${message || 'Default test error'}`);
  console.warn(`[TEST-WARN] ${message || 'Default test warning'}`);
  
  // Also try adding log directly to buffer
  consoleLogger.addLogEntry({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    level: 'info',
    message: `[DIRECT-ADD] ${message || 'Direct buffer addition test'}`,
    source: 'api'
  });
  
  const buffer = consoleLogger.getLogBuffer();
  res.json({ 
    success: true, 
    message: 'Test logs generated',
    bufferSize: buffer.length,
    recentLogs: buffer.slice(-5) // Show last 5 logs
  });
});

// Workers and System Monitoring APIs
app.get('/api/workers', async (req, res) => {
  try {
    const { Worker } = require('./models');
    const dbWorkers = await Worker.findAll();
    
    // Add real process information
    const workers = dbWorkers.map(worker => ({
      id: worker.id,
      pid: worker.pid || process.pid,
      status: worker.status || 'running',
      cwd: worker.metadata?.cwd || process.cwd(),
      queueDepth: worker.metadata?.queueDepth || 0,
      memoryUsage: process.memoryUsage().heapUsed,
      lastHeartbeat: worker.updated_at || new Date().toISOString()
    }));
    
    // If no DB workers, show current process as default
    if (workers.length === 0) {
      workers.push({
        id: 'server-main',
        pid: process.pid,
        status: 'running',
        cwd: process.cwd(),
        queueDepth: 0,
        memoryUsage: process.memoryUsage().heapUsed,
        lastHeartbeat: new Date().toISOString()
      });
    }
    
    res.json({ workers });
  } catch (error) {
    console.error('Failed to fetch workers:', error);
    res.json({ workers: [] });
  }
});

// REAL AUTONOMOUS AGENTS STATUS API
app.get('/api/agents', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    const agents = aiWorkers.getWorkers();
    res.json({ agents });
  } catch (error) {
    console.error('Failed to fetch AI workers:', error);
    res.json({ agents: [] });
  }
});

// Individual agent endpoint
app.get('/api/agents/:agentId', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    const agent = aiWorkers.getWorker(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json({ agent });
  } catch (error) {
    console.error('Failed to fetch agent:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// AI Project information
app.get('/api/ai-project', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    const projectInfo = aiWorkers.getProjectInfo();
    const teamStructure = aiWorkers.getTeamStructure();
    const workers = aiWorkers.getWorkers();

    res.json({
      project: projectInfo,
      team: teamStructure,
      workers: workers.length,
      activeWorkers: workers.filter(w => w.status === 'active' || w.status === 'busy').length
    });
  } catch (error) {
    console.error('Failed to fetch AI project info:', error);
    res.json({ project: null, team: null, workers: 0, activeWorkers: 0 });
  }
});

// AI Tasks endpoint
app.get('/api/ai-tasks', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    const tasks = aiWorkers.getTasks();
    res.json(tasks);
  } catch (error) {
    console.error('Failed to fetch AI tasks:', error);
    res.json({ tasks: [] });
  }
});

app.get('/api/system/processes', (req, res) => {
  const { spawn } = require('child_process');
  
  // Use ps command to get real process information
  const ps = spawn('ps', ['aux']);
  let data = '';
  
  ps.stdout.on('data', (chunk) => {
    data += chunk;
  });
  
  ps.on('close', (code) => {
    try {
      const lines = data.split('\n').slice(1); // Skip header
      const processes = lines
        .filter(line => line.trim())
        .slice(0, 50) // Limit to 50 processes
        .map((line, index) => {
          const parts = line.trim().split(/\s+/);
          return {
            pid: parseInt(parts[1]) || index + 1000,
            command: parts.slice(10).join(' ') || 'Unknown',
            cpu: parseFloat(parts[2]) || 0,
            memory: parseFloat(parts[3]) * 1024 * 1024 || 0, // Convert to bytes
            status: 'running',
            startTime: new Date().toISOString()
          };
        });
      
      res.json({ processes });
    } catch (error) {
      // Fallback if ps command fails
      res.json({
        processes: [{
          pid: process.pid,
          command: 'node server/index.js',
          cpu: 0.5,
          memory: process.memoryUsage().heapUsed,
          status: 'running',
          startTime: new Date().toISOString()
        }]
      });
    }
  });
  
  ps.on('error', (error) => {
    // Fallback for systems without ps command
    res.json({
      processes: [{
        pid: process.pid,
        command: 'node server/index.js',
        cpu: 0.5,
        memory: process.memoryUsage().heapUsed,
        status: 'running',
        startTime: new Date().toISOString()
      }]
    });
  });
});

app.get('/api/system/info', (req, res) => {
  const os = require('os');
  const memoryUsage = process.memoryUsage();
  
  res.json({
    cpu: {
      usage: (os.loadavg()[0] * 100 / os.cpus().length).toFixed(1)
    },
    memory: {
      total: os.totalmem(),
      used: os.totalmem() - os.freemem(),
      free: os.freemem(),
      heap: memoryUsage.heapUsed
    },
    uptime: process.uptime(),
    loadavg: os.loadavg().map(load => load.toFixed(2)),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    pid: process.pid
  });
});

app.post('/api/system/processes/:pid/kill', (req, res) => {
  const pid = parseInt(req.params.pid);
  
  if (pid === process.pid) {
    return res.status(400).json({ error: 'Cannot kill server process' });
  }
  
  if (pid < 1000) {
    return res.status(400).json({ error: 'Cannot kill system processes' });
  }
  
  try {
    process.kill(pid, 'SIGTERM');
    res.json({ success: true, message: `Process ${pid} terminated` });
  } catch (error) {
    res.status(400).json({ error: `Failed to kill process: ${error.message}` });
  }
});

// Dev login stub for simple server (no-op, just returns ok)
app.get('/auth/dev-login', (req, res) => {
  res.json({ message: 'Dev login not required on simple server' });
});

// HTTP Server
const server = app.listen(PORT, async () => {
  console.log(`🚀 ShellCompany API running on http://localhost:${PORT}`);

  // Initialize database and autonomous agents
  try {
    await initializeDatabase();
    console.log('✅ Database and models initialized');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
  }
});

// Socket.IO Server (replaces plain WebSocket)
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Socket.IO client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Socket.IO client disconnected:', socket.id);
  });

  // Send initial connection confirmation
  socket.emit('connection_confirmed', { 
    message: 'Connected to ShellCompany autonomous agent platform',
    timestamp: new Date().toISOString()
  });
});

// Initialize REAL autonomous agent execution platform
const WorkflowOrchestrator = require('./services/workflow-orchestrator');
const workspaceRoot = path.join(__dirname, 'agent-workspaces');
const orchestrator = new WorkflowOrchestrator(workspaceRoot, io);
app.locals.orchestrator = orchestrator;
app.locals.socketio = io;

// Setup console logger broadcast function for real-time logging
consoleLogger.setBroadcastFunction((data) => {
  io.emit('console_log', data);
});

// Test log to verify console logger is working
console.log('[CONSOLE-LOGGER-TEST] Console logger initialized and broadcasting should work');
console.log('[HTTP] Test - This should appear in the browser Console tab');
console.error('[ERROR-TEST] Test error message for debugging');

// Add periodic test logs to verify console capture
setInterval(() => {
  console.log(`[SERVER] Heartbeat - Active connections: ${io.engine.clientsCount}, Time: ${new Date().toISOString()}`);
}, 30000);

// Add agent activity logging
setTimeout(() => {
  const originalCreateWorkflow = app.locals.orchestrator?.createWorkflow;
  if (originalCreateWorkflow) {
    app.locals.orchestrator.createWorkflow = async function(directive) {
      console.log(`[AGENT] Creating workflow for directive: "${directive}"`);
      const result = await originalCreateWorkflow.call(this, directive);
      console.log(`[AGENT] Workflow ${result.workflowId} created with ${result.workflow.tasks.length} tasks`);
      return result;
    };
  }
}, 1000); // Wait for orchestrator to be initialized

console.log('✅ Console logger connected to Socket.IO broadcasting');

// Kick off background provider pings to keep status fresh
setTimeout(() => {
  providerMonitor.pingAll().catch(() => {});
  setInterval(() => providerMonitor.pingAll().catch(() => {}), 60_000);
}, 2000);
