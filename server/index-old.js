// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Import autonomous agent system
const { initializeDatabase } = require('./models');
const { router: autonomousRouter, initializeWebSocket } = require('./routes/autonomous-api');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Projects will be loaded from database

// API Routes - Projects from database
app.get('/api/projects', async (req, res) => {
  try {
    const { Project } = require('./models');
    const projects = await Project.findAll();
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.json([]);  // Return empty array if no projects or error
  }
});

app.get('/api/projects/:id', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

app.post('/api/projects', (req, res) => {
  const newProject = {
    id: Date.now().toString(),
    ...req.body,
    status: 'active',
    progress: 0,
    workers: [],
    tasks: []
  };
  projects.push(newProject);
  broadcast({ type: 'PROJECT_CREATED', project: newProject });
  res.status(201).json(newProject);
});

app.put('/api/projects/:id/tasks/:taskId', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const task = project.tasks.find(t => t.id === parseInt(req.params.taskId));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  
  Object.assign(task, req.body);
  broadcast({ type: 'TASK_UPDATED', projectId: req.params.id, task });
  res.json(task);
});

// Worker Management APIs
app.get('/api/projects/:id/workers', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project.workers);
});

app.get('/api/projects/:id/workers/:workerId', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const worker = project.workers.find(w => w.id === req.params.workerId);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  
  res.json(worker);
});

app.post('/api/projects/:id/workers', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const newWorker = {
    id: `worker_${Date.now()}`,
    name: req.body.name || 'New Worker',
    role: req.body.role || 'General',
    status: 'idle',
    avatar: req.body.avatar || '🤖',
    terminal: '',
    outputs: [],
    files: [],
    summary: 'New worker created.',
    commands: [],
    workingDirectory: '/project',
    created: new Date(),
    lastActive: new Date(),
    ...req.body
  };
  
  project.workers.push(newWorker);
  broadcast({ type: 'WORKER_CREATED', projectId: req.params.id, worker: newWorker });
  res.status(201).json(newWorker);
});

app.put('/api/projects/:id/workers/:workerId', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const worker = project.workers.find(w => w.id === req.params.workerId);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  
  Object.assign(worker, req.body, { lastActive: new Date() });
  broadcast({ type: 'WORKER_UPDATED', projectId: req.params.id, worker });
  res.json(worker);
});

app.delete('/api/projects/:id/workers/:workerId', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const workerIndex = project.workers.findIndex(w => w.id === req.params.workerId);
  if (workerIndex === -1) return res.status(404).json({ error: 'Worker not found' });
  
  const deletedWorker = project.workers.splice(workerIndex, 1)[0];
  broadcast({ type: 'WORKER_DELETED', projectId: req.params.id, workerId: req.params.workerId });
  res.json({ message: 'Worker deleted', worker: deletedWorker });
});

// File Management APIs
app.get('/api/projects/:id/workers/:workerId/files', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const worker = project.workers.find(w => w.id === req.params.workerId);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  
  res.json(worker.files || []);
});

app.post('/api/projects/:id/workers/:workerId/files', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const worker = project.workers.find(w => w.id === req.params.workerId);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  
  const newFile = {
    name: req.body.name,
    content: req.body.content || '',
    modified: new Date()
  };
  
  if (!worker.files) worker.files = [];
  worker.files.push(newFile);
  worker.lastActive = new Date();
  
  broadcast({ type: 'FILE_CREATED', projectId: req.params.id, workerId: req.params.workerId, file: newFile });
  res.status(201).json(newFile);
});

app.put('/api/projects/:id/workers/:workerId/files/:fileName', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const worker = project.workers.find(w => w.id === req.params.workerId);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  
  const file = worker.files?.find(f => f.name === req.params.fileName);
  if (!file) return res.status(404).json({ error: 'File not found' });
  
  Object.assign(file, req.body, { modified: new Date() });
  worker.lastActive = new Date();
  
  broadcast({ type: 'FILE_UPDATED', projectId: req.params.id, workerId: req.params.workerId, file });
  res.json(file);
});

// Terminal/Output Management
app.post('/api/projects/:id/workers/:workerId/terminal', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const worker = project.workers.find(w => w.id === req.params.workerId);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  
  const command = req.body.command;
  worker.terminal += `\n$ ${command}`;
  
  if (!worker.commands) worker.commands = [];
  worker.commands.push(command);
  
  // Simulate command execution
  setTimeout(() => {
    const output = `Output from: ${command}`;
    worker.terminal += `\n${output}`;
    
    const logEntry = {
      timestamp: new Date(),
      type: 'command',
      message: `Executed: ${command}`,
      output: output
    };
    
    if (!worker.outputs) worker.outputs = [];
    worker.outputs.push(logEntry);
    worker.lastActive = new Date();
    
    broadcast({ type: 'TERMINAL_UPDATED', projectId: req.params.id, workerId: req.params.workerId, worker });
  }, 1000);
  
  res.json({ message: 'Command sent', command });
});

app.post('/api/projects/:id/workers/:workerId/outputs', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const worker = project.workers.find(w => w.id === req.params.workerId);
  if (!worker) return res.status(404).json({ error: 'Worker not found' });
  
  const output = {
    timestamp: new Date(),
    type: req.body.type || 'info',
    message: req.body.message
  };
  
  if (!worker.outputs) worker.outputs = [];
  worker.outputs.push(output);
  worker.lastActive = new Date();
  
  broadcast({ type: 'OUTPUT_ADDED', projectId: req.params.id, workerId: req.params.workerId, output });
  res.status(201).json(output);
});

// Project Management APIs
app.post('/api/projects', (req, res) => {
  const newProject = {
    id: `project_${Date.now()}`,
    name: req.body.name || 'New Project',
    description: req.body.description || '',
    status: 'active',
    progress: 0,
    repository: {
      url: req.body.repository?.url || '',
      branch: 'main',
      lastCommit: null
    },
    environments: {
      development: {
        status: 'pending',
        url: '',
        lastDeployed: null,
        version: 'v0.1.0-dev',
        health: 'unknown'
      },
      staging: {
        status: 'pending',
        url: '',
        lastDeployed: null,
        version: 'v0.1.0',
        health: 'unknown'
      },
      production: {
        status: 'pending',
        url: '',
        lastDeployed: null,
        version: 'v0.1.0',
        health: 'unknown'
      }
    },
    cicd: {
      provider: 'GitHub Actions',
      lastBuild: null,
      pipeline: []
    },
    fileSystem: {
      rootPath: req.body.rootPath || '',
      structure: {}
    },
    metrics: {
      performance: {
        responseTime: '0ms',
        uptime: '0%',
        errorRate: '0%',
        throughput: '0 req/min'
      },
      coverage: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0
      },
      security: {
        vulnerabilities: 0,
        lastScan: new Date(),
        grade: 'Not Assessed'
      }
    },
    workers: [],
    tasks: [],
    created: new Date(),
    ...req.body
  };
  
  projects.push(newProject);
  broadcast({ type: 'PROJECT_CREATED', project: newProject });
  res.status(201).json(newProject);
});

// Environment Management APIs
app.get('/api/projects/:id/environments', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project.environments);
});

app.put('/api/projects/:id/environments/:env', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const env = req.params.env;
  if (!project.environments[env]) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  
  Object.assign(project.environments[env], req.body, { lastDeployed: new Date() });
  broadcast({ type: 'ENVIRONMENT_UPDATED', projectId: req.params.id, environment: env, data: project.environments[env] });
  res.json(project.environments[env]);
});

// CI/CD Pipeline APIs
app.get('/api/projects/:id/pipeline', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project.cicd);
});

app.post('/api/projects/:id/deploy/:env', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const env = req.params.env;
  if (!project.environments[env]) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  
  // Simulate deployment
  const deployment = {
    id: `deploy_${Date.now()}`,
    environment: env,
    status: 'in_progress',
    startTime: new Date(),
    version: req.body.version || `v1.0.${Date.now()}`,
    deployedBy: req.body.deployedBy || 'Sentinel'
  };
  
  // Update environment status
  project.environments[env].status = 'deploying';
  project.environments[env].lastDeployed = new Date();
  project.environments[env].version = deployment.version;
  
  // Simulate deployment completion after 3 seconds
  setTimeout(() => {
    project.environments[env].status = 'running';
    project.environments[env].health = 'healthy';
    deployment.status = 'success';
    deployment.endTime = new Date();
    broadcast({ type: 'DEPLOYMENT_COMPLETED', projectId: req.params.id, deployment });
  }, 3000);
  
  broadcast({ type: 'DEPLOYMENT_STARTED', projectId: req.params.id, deployment });
  res.status(201).json(deployment);
});

// Deployment History and Tracking APIs
app.get('/api/projects/:id/deployments', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  // Mock deployment history
  const deployments = [
    {
      id: 'deploy_1705123456789',
      environment: 'production',
      status: 'success',
      version: 'v1.2.1',
      startTime: new Date(Date.now() - 86400000),
      endTime: new Date(Date.now() - 86340000),
      duration: '1m 0s',
      deployedBy: 'Sentinel',
      commit: 'a1b2c3d',
      size: '12.3MB',
      changes: [
        'Added worker management dashboard',
        'Fixed authentication bug',
        'Updated dependencies'
      ]
    },
    {
      id: 'deploy_1705123456788',
      environment: 'staging',
      status: 'success',
      version: 'v1.2.2',
      startTime: new Date(Date.now() - 43200000),
      endTime: new Date(Date.now() - 43140000),
      duration: '45s',
      deployedBy: 'Alex',
      commit: 'e4f5g6h',
      size: '12.5MB',
      changes: [
        'Added DevOps pipeline visualization',
        'Improved error handling',
        'Performance optimizations'
      ]
    },
    {
      id: 'deploy_1705123456787',
      environment: 'development',
      status: 'success',
      version: 'v1.2.3-dev',
      startTime: new Date(Date.now() - 7200000),
      endTime: new Date(Date.now() - 7140000),
      duration: '30s',
      deployedBy: 'Nova',
      commit: 'i7j8k9l',
      size: '12.1MB',
      changes: [
        'UI improvements',
        'File browser enhancements',
        'Bug fixes'
      ]
    }
  ];
  
  const environment = req.query.environment;
  const filteredDeployments = environment 
    ? deployments.filter(d => d.environment === environment)
    : deployments;
    
  res.json({
    deployments: filteredDeployments,
    total: filteredDeployments.length,
    environments: ['development', 'staging', 'production']
  });
});

app.get('/api/projects/:id/deployments/:deploymentId', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const { deploymentId } = req.params;
  
  // Mock detailed deployment info
  const deployment = {
    id: deploymentId,
    environment: 'production',
    status: 'success',
    version: 'v1.2.1',
    startTime: new Date(Date.now() - 86400000),
    endTime: new Date(Date.now() - 86340000),
    duration: '1m 0s',
    deployedBy: 'Sentinel',
    commit: {
      hash: 'a1b2c3d',
      message: 'Add comprehensive worker management system',
      author: 'Alex'
    },
    buildInfo: {
      buildNumber: '123',
      buildTime: '2m 15s',
      testsPassed: 127,
      testsFailed: 0,
      codeQuality: 'A+',
      coverage: '94%'
    },
    infrastructure: {
      instances: 3,
      memory: '512MB',
      cpu: '0.5 vCPU',
      storage: '10GB',
      region: 'us-east-1'
    },
    logs: [
      { timestamp: new Date(Date.now() - 86400000), level: 'info', message: 'Starting deployment...' },
      { timestamp: new Date(Date.now() - 86395000), level: 'info', message: 'Building application...' },
      { timestamp: new Date(Date.now() - 86380000), level: 'info', message: 'Running tests...' },
      { timestamp: new Date(Date.now() - 86365000), level: 'success', message: 'All tests passed!' },
      { timestamp: new Date(Date.now() - 86350000), level: 'info', message: 'Deploying to production...' },
      { timestamp: new Date(Date.now() - 86340000), level: 'success', message: 'Deployment completed successfully!' }
    ],
    metrics: {
      deploymentFrequency: '2.3 deploys/day',
      leadTime: '45 minutes',
      meanTimeToRestore: '12 minutes',
      changeFailureRate: '2.1%'
    }
  };
  
  res.json(deployment);
});

app.post('/api/projects/:id/deployments/:deploymentId/rollback', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const { deploymentId } = req.params;
  const { environment, reason } = req.body;
  
  // Create rollback deployment
  const rollback = {
    id: `rollback_${Date.now()}`,
    environment: environment,
    status: 'in_progress',
    startTime: new Date(),
    originalDeployment: deploymentId,
    reason: reason || 'Manual rollback',
    rollbackBy: req.body.rollbackBy || 'Emergency Response Team'
  };
  
  // Update environment status
  if (project.environments[environment]) {
    project.environments[environment].status = 'rolling_back';
    
    // Simulate rollback completion
    setTimeout(() => {
      project.environments[environment].status = 'running';
      project.environments[environment].health = 'healthy';
      rollback.status = 'success';
      rollback.endTime = new Date();
      broadcast({ type: 'ROLLBACK_COMPLETED', projectId: req.params.id, rollback });
    }, 2000);
  }
  
  broadcast({ type: 'ROLLBACK_STARTED', projectId: req.params.id, rollback });
  res.status(201).json(rollback);
});

app.get('/api/projects/:id/deployments/metrics', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const metrics = {
    overview: {
      totalDeployments: 157,
      successfulDeployments: 153,
      failedDeployments: 4,
      successRate: '97.4%',
      averageDeploymentTime: '2m 15s'
    },
    frequency: {
      daily: 2.3,
      weekly: 16.1,
      monthly: 69.4
    },
    performance: {
      leadTime: '45 minutes',
      deploymentFrequency: '2.3 deploys/day',
      meanTimeToRestore: '12 minutes',
      changeFailureRate: '2.1%'
    },
    environments: {
      development: {
        deployments: 89,
        successRate: '98.9%',
        averageTime: '45s'
      },
      staging: {
        deployments: 45,
        successRate: '97.8%',
        averageTime: '1m 30s'
      },
      production: {
        deployments: 23,
        successRate: '95.7%',
        averageTime: '2m 45s'
      }
    },
    timeline: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000),
      deployments: Math.floor(Math.random() * 5) + 1,
      failures: Math.random() > 0.8 ? 1 : 0
    }))
  };
  
  res.json(metrics);
});

// External Integrations and Links APIs
app.get('/api/projects/:id/integrations', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const integrations = {
    repository: {
      github: {
        name: 'GitHub',
        url: 'https://github.com/shellcompany/dashboard',
        status: 'connected',
        lastSync: new Date(),
        features: ['Source Control', 'Issues', 'Pull Requests', 'Actions'],
        icon: '🐙'
      }
    },
    ci_cd: {
      github_actions: {
        name: 'GitHub Actions',
        url: 'https://github.com/shellcompany/dashboard/actions',
        status: 'connected',
        lastRun: new Date(),
        features: ['Continuous Integration', 'Automated Testing', 'Deployment'],
        icon: '⚙️'
      }
    },
    deployment: {
      vercel: {
        name: 'Vercel',
        url: 'https://vercel.com/shellcompany/dashboard',
        status: 'connected',
        lastDeployment: new Date(),
        features: ['Static Hosting', 'Edge Functions', 'Analytics'],
        icon: '▲'
      },
      aws: {
        name: 'AWS',
        url: 'https://console.aws.amazon.com/',
        status: 'connected',
        lastActivity: new Date(),
        features: ['EC2', 'S3', 'CloudFront', 'RDS'],
        icon: '☁️'
      }
    },
    monitoring: {
      datadog: {
        name: 'Datadog',
        url: 'https://app.datadoghq.com/dashboard/abc123',
        status: 'connected',
        lastUpdate: new Date(),
        features: ['Application Monitoring', 'Log Analytics', 'Alerts'],
        icon: '📊'
      },
      sentry: {
        name: 'Sentry',
        url: 'https://sentry.io/organizations/shellcompany/projects/dashboard/',
        status: 'connected',
        lastError: new Date(Date.now() - 86400000),
        features: ['Error Tracking', 'Performance Monitoring', 'Release Health'],
        icon: '🚨'
      }
    },
    communication: {
      slack: {
        name: 'Slack',
        url: 'https://shellcompany.slack.com/channels/development',
        status: 'connected',
        lastMessage: new Date(),
        features: ['Team Communication', 'Notifications', 'Bot Integration'],
        icon: '💬'
      },
      discord: {
        name: 'Discord',
        url: 'https://discord.gg/shellcompany',
        status: 'connected',
        lastActivity: new Date(),
        features: ['Voice Chat', 'Screen Sharing', 'Community'],
        icon: '🎮'
      }
    },
    analytics: {
      google_analytics: {
        name: 'Google Analytics',
        url: 'https://analytics.google.com/analytics/web/#/p123456789/reports/dashboard',
        status: 'connected',
        lastUpdate: new Date(),
        features: ['User Analytics', 'Traffic Analysis', 'Conversion Tracking'],
        icon: '📈'
      }
    },
    security: {
      snyk: {
        name: 'Snyk',
        url: 'https://app.snyk.io/org/shellcompany/projects',
        status: 'connected',
        lastScan: new Date(),
        features: ['Vulnerability Scanning', 'Dependency Monitoring', 'License Compliance'],
        icon: '🛡️'
      }
    }
  };
  
  res.json(integrations);
});

app.post('/api/projects/:id/integrations/:service/connect', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const { service } = req.params;
  const { token, config } = req.body;
  
  // Simulate connection process
  const connection = {
    service,
    status: 'connecting',
    startTime: new Date(),
    config: config || {}
  };
  
  // Simulate successful connection after 2 seconds
  setTimeout(() => {
    connection.status = 'connected';
    connection.connectedAt = new Date();
    broadcast({ type: 'INTEGRATION_CONNECTED', projectId: req.params.id, service, connection });
  }, 2000);
  
  broadcast({ type: 'INTEGRATION_CONNECTING', projectId: req.params.id, service, connection });
  res.status(201).json(connection);
});

app.delete('/api/projects/:id/integrations/:service', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const { service } = req.params;
  
  broadcast({ type: 'INTEGRATION_DISCONNECTED', projectId: req.params.id, service });
  res.json({ message: `${service} integration disconnected successfully` });
});

app.get('/api/projects/:id/links', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const links = {
    project: [
      { name: 'Live Website', url: 'https://shellcompany.ai', icon: '🌐', type: 'external' },
      { name: 'Documentation', url: 'https://docs.shellcompany.ai', icon: '📚', type: 'external' },
      { name: 'API Reference', url: 'https://api.shellcompany.ai/docs', icon: '🔗', type: 'external' }
    ],
    development: [
      { name: 'GitHub Repository', url: 'https://github.com/shellcompany/dashboard', icon: '📦', type: 'external' },
      { name: 'Development Server', url: 'http://localhost:5173', icon: '💻', type: 'local' },
      { name: 'API Server', url: 'http://localhost:3001', icon: '🖥️', type: 'local' },
      { name: 'Storybook', url: 'http://localhost:6006', icon: '📖', type: 'local' }
    ],
    deployment: [
      { name: 'Production Dashboard', url: 'https://dashboard.shellcompany.ai', icon: '🚀', type: 'external' },
      { name: 'Staging Environment', url: 'https://staging.shellcompany.ai', icon: '🧪', type: 'external' },
      { name: 'Vercel Dashboard', url: 'https://vercel.com/shellcompany/dashboard', icon: '▲', type: 'external' },
      { name: 'AWS Console', url: 'https://console.aws.amazon.com/', icon: '☁️', type: 'external' }
    ],
    monitoring: [
      { name: 'Application Metrics', url: 'https://app.datadoghq.com/dashboard/abc123', icon: '📊', type: 'external' },
      { name: 'Error Tracking', url: 'https://sentry.io/organizations/shellcompany/', icon: '🚨', type: 'external' },
      { name: 'Uptime Monitor', url: 'https://status.shellcompany.ai', icon: '💚', type: 'external' },
      { name: 'Performance Insights', url: 'https://analytics.google.com/analytics/web/', icon: '📈', type: 'external' }
    ],
    team: [
      { name: 'Slack Workspace', url: 'https://shellcompany.slack.com/', icon: '💬', type: 'external' },
      { name: 'Discord Server', url: 'https://discord.gg/shellcompany', icon: '🎮', type: 'external' },
      { name: 'Team Calendar', url: 'https://calendar.google.com/calendar/b/1/', icon: '📅', type: 'external' },
      { name: 'Meeting Room', url: 'https://meet.google.com/shellcompany-daily', icon: '📞', type: 'external' }
    ],
    tools: [
      { name: 'Figma Designs', url: 'https://figma.com/file/shellcompany-dashboard', icon: '🎨', type: 'external' },
      { name: 'Notion Workspace', url: 'https://notion.so/shellcompany', icon: '📝', type: 'external' },
      { name: 'Jira Board', url: 'https://shellcompany.atlassian.net/', icon: '📋', type: 'external' },
      { name: 'Confluence Wiki', url: 'https://shellcompany.atlassian.net/wiki/', icon: '📖', type: 'external' }
    ]
  };
  
  res.json(links);
});

app.post('/api/projects/:id/links', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const { name, url, icon, type, category } = req.body;
  
  if (!name || !url) {
    return res.status(400).json({ error: 'Name and URL are required' });
  }
  
  const newLink = {
    id: `link_${Date.now()}`,
    name,
    url,
    icon: icon || '🔗',
    type: type || 'external',
    category: category || 'project',
    createdAt: new Date(),
    createdBy: 'User'
  };
  
  broadcast({ type: 'LINK_ADDED', projectId: req.params.id, link: newLink });
  res.status(201).json(newLink);
});

app.delete('/api/projects/:id/links/:linkId', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const { linkId } = req.params;
  
  broadcast({ type: 'LINK_REMOVED', projectId: req.params.id, linkId });
  res.json({ message: 'Link removed successfully' });
});

app.get('/api/projects/:id/webhooks', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const webhooks = [
    {
      id: 'webhook_1',
      name: 'GitHub Push Events',
      url: 'https://api.shellcompany.ai/webhooks/github',
      events: ['push', 'pull_request', 'release'],
      status: 'active',
      lastTriggered: new Date(Date.now() - 3600000),
      totalCalls: 1247
    },
    {
      id: 'webhook_2',
      name: 'Deployment Notifications',
      url: 'https://hooks.slack.com/services/T123/B456/xyz789',
      events: ['deployment_started', 'deployment_completed', 'deployment_failed'],
      status: 'active',
      lastTriggered: new Date(Date.now() - 1800000),
      totalCalls: 89
    },
    {
      id: 'webhook_3',
      name: 'Error Alerts',
      url: 'https://discord.com/api/webhooks/123456/abcdef',
      events: ['error_occurred', 'critical_alert'],
      status: 'active',
      lastTriggered: new Date(Date.now() - 86400000),
      totalCalls: 23
    }
  ];
  
  res.json({ webhooks });
});

app.post('/api/projects/:id/webhooks', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const { name, url, events, secret } = req.body;
  
  if (!name || !url || !events) {
    return res.status(400).json({ error: 'Name, URL, and events are required' });
  }
  
  const webhook = {
    id: `webhook_${Date.now()}`,
    name,
    url,
    events,
    secret: secret || `secret_${Math.random().toString(36).substring(2)}`,
    status: 'active',
    createdAt: new Date(),
    totalCalls: 0
  };
  
  broadcast({ type: 'WEBHOOK_CREATED', projectId: req.params.id, webhook });
  res.status(201).json(webhook);
});

// File System APIs
app.get('/api/projects/:id/filesystem', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project.fileSystem);
});

app.get('/api/projects/:id/filesystem/browse', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const requestedPath = req.query.path || '';
  const fullPath = path.join(project.fileSystem.rootPath, requestedPath);
  
  // Security check: ensure path is within project root
  if (!fullPath.startsWith(project.fileSystem.rootPath)) {
    return res.status(403).json({ error: 'Access denied: Path outside project root' });
  }
  
  try {
    // Check if path exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }
    
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      // List directory contents
      const items = fs.readdirSync(fullPath);
      const contents = {};
      
      items.forEach(item => {
        const itemPath = path.join(fullPath, item);
        const itemStats = fs.statSync(itemPath);
        
        contents[item] = {
          type: itemStats.isDirectory() ? 'directory' : 'file',
          size: itemStats.isFile() ? `${(itemStats.size / 1024).toFixed(1)}KB` : undefined,
          modified: itemStats.mtime,
          children: itemStats.isDirectory() ? {} : undefined
        };
      });
      
      res.json({ path: requestedPath, contents, isDirectory: true });
    } else {
      // Return file info
      res.json({ 
        path: requestedPath, 
        isDirectory: false,
        size: `${(stats.size / 1024).toFixed(1)}KB`,
        modified: stats.mtime
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to read filesystem', message: error.message });
  }
});

// File Content API
app.get('/api/projects/:id/filesystem/read', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const requestedPath = req.query.path;
  if (!requestedPath) {
    return res.status(400).json({ error: 'Path parameter required' });
  }
  
  const fullPath = path.join(project.fileSystem.rootPath, requestedPath);
  
  // Security check: ensure path is within project root
  if (!fullPath.startsWith(project.fileSystem.rootPath)) {
    return res.status(403).json({ error: 'Access denied: Path outside project root' });
  }
  
  try {
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory, not a file' });
    }
    
    // Check if file is too large (limit to 1MB)
    if (stats.size > 1024 * 1024) {
      return res.status(413).json({ error: 'File too large to display' });
    }
    
    // Check if file is binary
    const isBinary = (filePath) => {
      const buffer = fs.readFileSync(filePath);
      for (let i = 0; i < Math.min(buffer.length, 512); i++) {
        if (buffer[i] === 0) return true;
      }
      return false;
    };
    
    if (isBinary(fullPath)) {
      return res.json({ 
        path: requestedPath,
        isBinary: true,
        size: `${(stats.size / 1024).toFixed(1)}KB`,
        message: 'Binary file - cannot display content'
      });
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    res.json({ 
      path: requestedPath,
      content,
      size: `${(stats.size / 1024).toFixed(1)}KB`,
      modified: stats.mtime,
      lines: content.split('\n').length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read file', message: error.message });
  }
});

// Repository Management APIs
app.get('/api/projects/:id/repository', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project.repository);
});

app.post('/api/projects/:id/repository/commit', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const commit = {
    hash: Math.random().toString(36).substring(2, 8),
    message: req.body.message || 'Update files',
    author: req.body.author || 'Unknown',
    timestamp: new Date()
  };
  
  project.repository.lastCommit = commit;
  broadcast({ type: 'COMMIT_CREATED', projectId: req.params.id, commit });
  res.status(201).json(commit);
});

// Git Branch Management APIs
app.get('/api/projects/:id/repository/branches', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  try {
    // Execute git command to get branches
    const { execSync } = require('child_process');
    const gitCmd = `cd "${project.fileSystem.rootPath}" && git branch -a --format="%(refname:short)|%(HEAD)|%(upstream:short)|%(subject)"`;
    
    try {
      const output = execSync(gitCmd, { encoding: 'utf8' });
      const branches = output.trim().split('\n').map(line => {
        const [name, isHead, upstream, subject] = line.split('|');
        return {
          name: name.trim(),
          current: isHead.trim() === '*',
          upstream: upstream || null,
          lastCommit: subject || 'No commits',
          remote: name.startsWith('origin/'),
          ahead: Math.floor(Math.random() * 5),
          behind: Math.floor(Math.random() * 3)
        };
      }).filter(branch => branch.name && !branch.name.includes('HEAD'));
      
      res.json({ branches, currentBranch: project.repository.branch });
    } catch (gitError) {
      // Fallback to mock data if git fails
      res.json({
        branches: [
          { name: 'main', current: true, upstream: 'origin/main', lastCommit: 'Add worker management', remote: false, ahead: 0, behind: 0 },
          { name: 'feature/devops-integration', current: false, upstream: null, lastCommit: 'Add DevOps dashboard', remote: false, ahead: 2, behind: 0 },
          { name: 'feature/file-system', current: false, upstream: null, lastCommit: 'Implement file browser', remote: false, ahead: 1, behind: 0 },
          { name: 'origin/main', current: false, upstream: null, lastCommit: 'Latest from remote', remote: true, ahead: 0, behind: 0 }
        ],
        currentBranch: project.repository.branch,
        isGitRepo: false
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to get branches', message: error.message });
  }
});

app.post('/api/projects/:id/repository/branches', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const { name, fromBranch } = req.body;
  if (!name) return res.status(400).json({ error: 'Branch name required' });
  
  try {
    const { execSync } = require('child_process');
    const gitCmd = `cd "${project.fileSystem.rootPath}" && git checkout -b "${name}" ${fromBranch || ''}`;
    
    try {
      execSync(gitCmd, { encoding: 'utf8' });
      project.repository.branch = name;
      
      broadcast({ type: 'BRANCH_CREATED', projectId: req.params.id, branch: name });
      res.status(201).json({ message: 'Branch created successfully', name });
    } catch (gitError) {
      res.status(400).json({ error: 'Failed to create branch', message: gitError.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Git operation failed', message: error.message });
  }
});

app.post('/api/projects/:id/repository/branches/:branchName/checkout', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const { branchName } = req.params;
  
  try {
    const { execSync } = require('child_process');
    const gitCmd = `cd "${project.fileSystem.rootPath}" && git checkout "${branchName}"`;
    
    try {
      execSync(gitCmd, { encoding: 'utf8' });
      project.repository.branch = branchName;
      
      broadcast({ type: 'BRANCH_CHANGED', projectId: req.params.id, branch: branchName });
      res.json({ message: 'Branch checked out successfully', branch: branchName });
    } catch (gitError) {
      res.status(400).json({ error: 'Failed to checkout branch', message: gitError.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Git operation failed', message: error.message });
  }
});

app.delete('/api/projects/:id/repository/branches/:branchName', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const { branchName } = req.params;
  
  if (branchName === 'main' || branchName === 'master') {
    return res.status(400).json({ error: 'Cannot delete main branch' });
  }
  
  try {
    const { execSync } = require('child_process');
    const gitCmd = `cd "${project.fileSystem.rootPath}" && git branch -D "${branchName}"`;
    
    try {
      execSync(gitCmd, { encoding: 'utf8' });
      
      broadcast({ type: 'BRANCH_DELETED', projectId: req.params.id, branch: branchName });
      res.json({ message: 'Branch deleted successfully', branch: branchName });
    } catch (gitError) {
      res.status(400).json({ error: 'Failed to delete branch', message: gitError.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Git operation failed', message: error.message });
  }
});

app.post('/api/projects/:id/repository/merge', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const { sourceBranch, targetBranch, message } = req.body;
  if (!sourceBranch || !targetBranch) {
    return res.status(400).json({ error: 'Source and target branches required' });
  }
  
  try {
    const { execSync } = require('child_process');
    const gitCmds = [
      `cd "${project.fileSystem.rootPath}"`,
      `git checkout "${targetBranch}"`,
      `git merge "${sourceBranch}" -m "${message || `Merge ${sourceBranch} into ${targetBranch}`}"`
    ];
    
    try {
      execSync(gitCmds.join(' && '), { encoding: 'utf8' });
      
      const mergeCommit = {
        hash: Math.random().toString(36).substring(2, 8),
        message: message || `Merge ${sourceBranch} into ${targetBranch}`,
        author: 'ShellCompany Bot',
        timestamp: new Date()
      };
      
      project.repository.lastCommit = mergeCommit;
      broadcast({ type: 'BRANCHES_MERGED', projectId: req.params.id, sourceBranch, targetBranch, commit: mergeCommit });
      res.json({ message: 'Branches merged successfully', commit: mergeCommit });
    } catch (gitError) {
      res.status(400).json({ error: 'Merge failed', message: gitError.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Git operation failed', message: error.message });
  }
});

app.get('/api/projects/:id/repository/commits', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  const limit = parseInt(req.query.limit) || 10;
  const branch = req.query.branch || project.repository.branch;
  
  try {
    const { execSync } = require('child_process');
    const gitCmd = `cd "${project.fileSystem.rootPath}" && git log --oneline -n ${limit} ${branch}`;
    
    try {
      const output = execSync(gitCmd, { encoding: 'utf8' });
      const commits = output.trim().split('\n').map(line => {
        const [hash, ...messageParts] = line.split(' ');
        return {
          hash: hash.substring(0, 7),
          message: messageParts.join(' '),
          author: 'Various',
          timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
        };
      });
      
      res.json({ commits, branch });
    } catch (gitError) {
      // Fallback to mock data if git fails
      res.json({
        commits: [
          { hash: 'a1b2c3d', message: 'Add comprehensive worker management system', author: 'Alex', timestamp: new Date() },
          { hash: 'e4f5g6h', message: 'Implement DevOps pipeline visualization', author: 'Sentinel', timestamp: new Date(Date.now() - 3600000) },
          { hash: 'i7j8k9l', message: 'Add file system browser functionality', author: 'Nova', timestamp: new Date(Date.now() - 7200000) },
          { hash: 'm0n1o2p', message: 'Enhance security scanning and monitoring', author: 'Cipher', timestamp: new Date(Date.now() - 10800000) }
        ],
        branch,
        isGitRepo: false
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to get commits', message: error.message });
  }
});

// Metrics and Analytics APIs
app.get('/api/projects/:id/metrics', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project.metrics);
});

app.put('/api/projects/:id/metrics', (req, res) => {
  const project = projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  
  Object.assign(project.metrics, req.body);
  broadcast({ type: 'METRICS_UPDATED', projectId: req.params.id, metrics: project.metrics });
  res.json(project.metrics);
});

// Add autonomous agent routes
app.use('/api/autonomous', autonomousRouter);

// WebSocket Server
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

// Initialize autonomous agent WebSocket (includes WebSocket server)
initializeWebSocket(server);

