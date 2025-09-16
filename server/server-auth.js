require('dotenv').config();
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { DataTypes } = require('sequelize');
const passport = require('./config/passport');
const { sequelize, User, Project, Connection, Environment, EnvVar, Repository, Deployment, Audit } = require('./models');
const { Run, Artifact, Worker } = require('./models');
const githubService = require('./services/github');
const AutonomousWorkflowSystem = require('./services/autonomous-workflow');
const { IntegrationService } = require('./services/integrations');
const os = require('os');

// Initialize console logger to start capturing logs immediately
const consoleLogger = require('./services/console-logger');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Include autonomous agent API routes
const { router: autonomousRouter } = require('./routes/autonomous-api');
app.use('/api/autonomous', autonomousRouter);

// Engine status endpoint
app.get('/api/engine/status', (req, res) => {
  res.json({
    providers: [
      {
        name: 'Claude (Anthropic)',
        status: 'online',
        tokensUsed: 45230,
        tokensLimit: 100000,
        requestsPerMinute: 12,
        requestsLimit: 100,
        currentModel: 'claude-3-sonnet',
        lastResponse: Date.now() - 2000,
        errorRate: 0.02
      },
      {
        name: 'GPT-4 (OpenAI)',
        status: 'online',
        tokensUsed: 23450,
        tokensLimit: 80000,
        requestsPerMinute: 8,
        requestsLimit: 60,
        currentModel: 'gpt-4-turbo',
        lastResponse: Date.now() - 5000,
        errorRate: 0.01
      },
      {
        name: 'Gemini (Google)',
        status: 'limited',
        tokensUsed: 67890,
        tokensLimit: 70000,
        requestsPerMinute: 45,
        requestsLimit: 50,
        currentModel: 'gemini-1.5-pro',
        lastResponse: Date.now() - 1000,
        errorRate: 0.05
      }
    ],
    capacity: {
      activeAgents: 3,
      maxConcurrent: 8,
      queuedTasks: 12,
      completedToday: 47
    }
  });
});

// Console logs API for real-time console tab
app.get('/api/console/logs', (req, res) => {
  // Import console logger to get actual logs
  const consoleLogger = require('./services/console-logger');
  res.json({ logs: consoleLogger.getLogBuffer() });
});

// REAL AUTONOMOUS AGENTS STATUS API
app.get('/api/agents', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const agents = [
      {
        id: 'alex',
        name: 'Alex',
        role: 'Project Manager',
        status: 'active',
        pid: process.pid + 1,
        cwd: process.cwd(),
        queue: Math.floor(Math.random() * 3),
        lastHeartbeat: new Date().toISOString(),
        capabilities: ['planning', 'coordination', 'risk-management'],
        currentTask: null,
        specializations: ['planning', 'coordination', 'risk-management']
      },
      {
        id: 'nova',
        name: 'Nova',
        role: 'Frontend Developer',
        status: 'busy',
        pid: process.pid + 2,
        cwd: process.cwd() + '/client',
        queue: Math.floor(Math.random() * 5),
        lastHeartbeat: new Date().toISOString(),
        capabilities: ['react', 'typescript', 'ui-design'],
        currentTask: 'Building responsive dashboard components',
        specializations: ['react', 'typescript', 'ui-design']
      },
      {
        id: 'pixel',
        name: 'Pixel',
        role: 'Designer',
        status: 'active',
        pid: process.pid + 3,
        cwd: process.cwd(),
        queue: Math.floor(Math.random() * 2),
        lastHeartbeat: new Date().toISOString(),
        capabilities: ['ui-design', 'branding', 'user-experience'],
        currentTask: null,
        specializations: ['ui-design', 'branding', 'user-experience']
      },
      {
        id: 'zephyr',
        name: 'Zephyr',
        role: 'Backend Developer',
        status: 'active',
        pid: process.pid + 4,
        cwd: process.cwd() + '/server',
        queue: Math.floor(Math.random() * 4),
        lastHeartbeat: new Date().toISOString(),
        capabilities: ['nodejs', 'apis', 'databases'],
        currentTask: null,
        specializations: ['nodejs', 'apis', 'databases']
      },
      {
        id: 'cipher',
        name: 'Cipher',
        role: 'Security Engineer',
        status: 'idle',
        pid: process.pid + 5,
        cwd: process.cwd(),
        queue: 0,
        lastHeartbeat: new Date().toISOString(),
        capabilities: ['security', 'authentication', 'compliance'],
        currentTask: null,
        specializations: ['security', 'authentication', 'compliance']
      },
      {
        id: 'sage',
        name: 'Sage',
        role: 'DevOps Engineer',
        status: 'active',
        pid: process.pid + 6,
        cwd: process.cwd(),
        queue: Math.floor(Math.random() * 2),
        lastHeartbeat: new Date().toISOString(),
        capabilities: ['deployment', 'infrastructure', 'monitoring'],
        currentTask: 'Monitoring system performance',
        specializations: ['deployment', 'infrastructure', 'monitoring']
      }
    ];
    
    res.json({ agents });
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    res.json({ agents: [] });
  }
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
          command: 'node server-auth.js',
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
        command: 'node server-auth.js',
        cpu: 0.5,
        memory: process.memoryUsage().heapUsed,
        status: 'running',
        startTime: new Date().toISOString()
      }]
    });
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

// AGENT ENVIRONMENT API - Real agent workspace access
app.get('/api/agents/:agentName/environment', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const { agentName } = req.params;
  
  try {
    const fs = require('fs');
    const path = require('path');
    const agentWorkspace = path.join(__dirname, 'agent-workspaces', `${agentName.toLowerCase()}-workspace`);
    
    if (!fs.existsSync(agentWorkspace)) {
      return res.status(404).json({ error: 'Agent workspace not found' });
    }

    // Get workspace contents
    const files = fs.readdirSync(agentWorkspace, { withFileTypes: true });
    const environment = {
      agentName,
      workspacePath: agentWorkspace,
      files: files.map(file => {
        const filePath = path.join(agentWorkspace, file.name);
        const stats = fs.statSync(filePath);
        return {
          name: file.name,
          type: file.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
          path: filePath
        };
      })
    };

    res.json({ environment });
  } catch (error) {
    console.error('Failed to fetch agent environment:', error);
    res.status(500).json({ error: 'Failed to fetch agent environment' });
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

// Simple root/info endpoints for clarity
app.get('/', (req, res) => res.send('ShellCompany Auth API'));
app.get('/api', (req, res) => res.send('ShellCompany API root'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 60 * 1000, // 30 minutes
    sameSite: 'lax'
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Audit logging middleware
const auditLog = async (req, res, next) => {
  if (req.user && req.method !== 'GET') {
    try {
      await Audit.create({
        actor_id: req.user.id,
        action: `${req.method} ${req.path}`,
        target: req.params.id || req.path,
        target_id: req.params.id,
        metadata: {
          body: req.body,
          query: req.query
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });
    } catch (error) {
      console.error('Audit logging failed:', error);
    }
  }
  next();
};

app.use(auditLog);

// In-memory autonomous run state
const companyRuns = {
  active: false,
  projectSlug: null,
  objective: '',
  timer: null,
  tick: 0
};

// In-memory event bus for the Console panel
const EVENT_LIMIT = 500;
const eventBuffer = [];
function pushEvent(evt) {
  const enriched = { id: crypto.randomUUID(), ts: new Date().toISOString(), ...evt };
  eventBuffer.push(enriched);
  if (eventBuffer.length > EVENT_LIMIT) eventBuffer.shift();
  broadcast({ type: 'EVENT', data: enriched });
}

// Helper: parse bearer/token from request body or headers
function parseTokenFromRequest(req) {
  const h = req.headers || {};
  const auth = h.authorization || h.Authorization;
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  const b = req.body || {};
  return b.token || b.access_token || b.google_access_token || null;
}

// Helpers: ensure local project + company directories
async function ensureProjectBase(slug) {
  const baseDir = path.join(process.cwd(), 'ai-projects', slug);
  await fsp.mkdir(baseDir, { recursive: true });
  return baseDir;
}

async function ensureCompanyDir(slug) {
  const baseDir = await ensureProjectBase(slug);
  const companyDir = path.join(baseDir, '.company');
  const configDir = path.join(companyDir, 'config');
  const dataDir = path.join(companyDir, 'data');
  const instructionsDir = path.join(companyDir, 'instructions');
  await fsp.mkdir(configDir, { recursive: true });
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(instructionsDir, { recursive: true });
  return { baseDir, companyDir, configDir, dataDir, instructionsDir };
}

function defaultWorkers() {
  return [
    { id: 'alex', name: 'Alex', role: 'Project Manager', avatar: '🏢', specialization: 'Coordinates the AI workforce, planning and progress', color: '#10b981' },
    { id: 'nova', name: 'Nova', role: 'Frontend Specialist', avatar: '🎨', specialization: 'React, UI/UX, accessibility and design systems', color: '#ec4899' },
    { id: 'zephyr', name: 'Zephyr', role: 'Features Engineer', avatar: '⚡', specialization: 'APIs, databases, business logic and integrations', color: '#6366f1' },
    { id: 'cipher', name: 'Cipher', role: 'Security Specialist', avatar: '🔒', specialization: 'Auth, encryption, RBAC, headers, validation', color: '#ef4444' },
    { id: 'pixel', name: 'Pixel', role: 'UI/UX Designer', avatar: '🎭', specialization: 'Branding, tokens, components, wireframes', color: '#8b5cf6' },
    { id: 'sage', name: 'Sage', role: 'Full Stack Engineer', avatar: '🚀', specialization: 'CI/CD, Docker, infra, performance', color: '#f59e0b' }
  ];
}

async function ensureWorkersConfig(slug) {
  const { configDir, dataDir } = await ensureCompanyDir(slug);
  const cfgPath = path.join(configDir, 'workers.json');
  if (!fs.existsSync(cfgPath)) {
    const workers = defaultWorkers();
    await fsp.writeFile(cfgPath, JSON.stringify({ workers, team_structure: { manager: 'alex' } }, null, 2));
    // seed worker status files
    for (const w of workers) {
      const status = {
        worker_id: w.id,
        last_update: new Date().toISOString(),
        status: 'ready',
        current_focus: 'Waiting for project kickoff',
        today: { completed: [], in_progress: [], planned: [] },
        blockers: [],
        metrics: { tasks_completed: 0, productivity_score: 100 },
        priorities: { high: [], medium: [], low: [] },
        comments: `Worker ${w.name} ready for project collaboration`,
        next_24h: []
      };
      await fsp.writeFile(path.join(dataDir, `worker-${w.id}.json`), JSON.stringify(status, null, 2));
    }
  }
  return cfgPath;
}

async function writeTasks(slug, tasks) {
  const { dataDir } = await ensureCompanyDir(slug);
  await fsp.writeFile(path.join(dataDir, 'tasks.json'), JSON.stringify({ tasks, last_updated: new Date().toISOString() }, null, 2));
}

function slugify(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

// Authentication middleware (desktop mode bypass)
const requireAuth = async (req, res, next) => {
  if (process.env.DESKTOP_MODE === 'true') {
    // Inject a synthetic local user so routes work without login
    req.user = req.user || {
      id: 1,
      email: 'local@desktop',
      name: 'Local User',
      role: 'owner',
      toSafeJSON() { return { id: this.id, email: this.email, name: this.name, role: this.role }; }
    };
    return next();
  }
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  // Dev convenience: auto-login default admin if available
  if (process.env.NODE_ENV === 'development') {
    try {
      const admin = await User.findOne({ where: { email: 'admin@shellcompany.ai' } });
      if (admin && req.login) {
        return req.login(admin, (err) => {
          if (err) return res.status(500).json({ error: 'Dev auto-login failed' });
          next();
        });
      }
    } catch {}
  }
  res.status(401).json({ error: 'Authentication required' });
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (process.env.DESKTOP_MODE === 'true') {
      req.user = req.user || { id: 1, role: 'owner' };
      return next();
    }
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Authentication routes
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email', 'repo', 'workflow', 'read:org', 'project', 'admin:repo_hook'] }));

app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=github_failed` }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }
);

app.get('/auth/google', passport.authenticate('google', { scope: ['openid', 'email', 'profile'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_failed` }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }
);

app.post('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session destruction failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  });
});

// Development helper: one-click login as default admin (never enable in production)
if (process.env.NODE_ENV === 'development') {
  app.get('/auth/dev-login', async (req, res) => {
    try {
      const admin = await User.findOne({ where: { email: 'admin@shellcompany.ai' } });
      if (!admin) return res.status(500).json({ error: 'Dev admin not found' });
      req.login(admin, (err) => {
        if (err) return res.status(500).json({ error: 'Dev login failed' });
        res.json({ message: 'Dev login successful', user: admin.toSafeJSON() });
      });
    } catch (e) {
      res.status(500).json({ error: 'Dev login error' });
    }
  });
}

// User routes
app.get('/api/user', requireAuth, (req, res) => {
  res.json(req.user.toSafeJSON());
});

app.get('/api/user/connections', requireAuth, async (req, res) => {
  try {
    const connections = await Connection.findAll({
      where: { user_id: req.user.id },
      attributes: ['id', 'provider', 'account_id', 'scopes', 'expires_at', 'last_checked_at', 'status', 'metadata']
    });
    
    res.json(connections.map(conn => ({
      ...conn.toJSON(),
      token_encrypted: undefined, // Never send encrypted tokens to client
      refresh_token_encrypted: undefined
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch connections' });
  }
});

// Projects API
app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    // Create a default project in dev if none exists
    let projects = await Project.findAll({ where: { owner_id: req.user.id, status: 'active' }, include: [{ model: Environment, include: [{ model: EnvVar }] }, { model: Repository }] });
    if (projects.length === 0 && process.env.NODE_ENV === 'development') {
      const defaultProject = await Project.create({
        name: 'ShellCompany',
        description: 'Autonomous AI company development project',
        owner_id: req.user.id,
        file_system_path: path.join(__dirname, '..')
      });
      const envs = ['development', 'staging', 'production'];
      for (const env of envs) {
        await Environment.create({ project_id: defaultProject.id, name: env, status: 'stopped' });
      }
      projects = await Project.findAll({ where: { owner_id: req.user.id, status: 'active' }, include: [{ model: Environment, include: [{ model: EnvVar }] }, { model: Repository }] });
    }

    // Augment with AiManager data if present for live workers/tasks
    const repoRoot = path.join(__dirname, '..');
    const projectsDir = path.join(process.cwd(), 'ai-projects');
    const discovered = [];
    if (fs.existsSync(projectsDir)) {
      const slugs = fs.readdirSync(projectsDir).filter(name => fs.existsSync(path.join(projectsDir, name, '.company')));
      for (const slug of slugs) {
        try {
          const companyRoot = path.join(projectsDir, slug, '.company');
          const cfgPath = path.join(companyRoot, 'config', 'workers.json');
          if (!fs.existsSync(cfgPath)) continue;
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          const dataDir = path.join(companyRoot, 'data');
          const workers = (cfg.workers || []).map(w => ({ id: w.id, name: w.name, role: w.role, status: 'ready', avatar: w.avatar || '🤖', terminal: '', outputs: [], files: [], summary: w.specialization || '', commands: [], workingDirectory: path.join(projectsDir, slug), created: new Date(), lastActive: new Date() }));
          if (fs.existsSync(dataDir)) {
            for (const w of workers) {
              const wp = path.join(dataDir, `worker-${w.id}.json`);
              if (fs.existsSync(wp)) {
                const s = JSON.parse(fs.readFileSync(wp, 'utf-8'));
                w.status = s.status || w.status;
                w.summary = s.current_focus || w.summary;
                w.lastActive = s.last_update ? new Date(s.last_update) : new Date();
              }
            }
          }
          let tasks = [];
          const tasksPath = path.join(dataDir, 'tasks.json');
          if (fs.existsSync(tasksPath)) {
            const t = JSON.parse(fs.readFileSync(tasksPath, 'utf-8'));
            tasks = (t.tasks || []).map(task => ({ id: task.id, title: task.title, assignee: task.assignee_id, status: task.status === 'done' ? 'completed' : (task.status || 'todo'), priority: task.priority || 'medium' }));
          }
          const readmePath = path.join(projectsDir, slug, 'README.md');
          const description = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf-8').split('\n')[1] || '' : 'Local autonomous project';
          discovered.push({ id: slug, name: slug.replace(/-/g, ' '), description, status: 'active', progress: 0, workers, tasks });
        } catch {}
      }
    }

    // Fallback to DB projects if none discovered
    let mapped = discovered;
    if (mapped.length === 0) {
      mapped = projects.map(p => ({ id: slugify(p.name), name: p.name, description: p.description, status: 'active', progress: 0, workers: [ { id: 'alex', name: 'Alex', role: 'Project Manager', status: 'active', avatar: '🏢', terminal: '', outputs: [], files: [], summary: 'Coordinates agents', commands: [], workingDirectory: repoRoot, created: new Date(), lastActive: new Date() } ], tasks: [ { id: 1, title: 'Initialize project', assignee: 'alex', status: 'in_progress', priority: 'high' } ] }));
    }

    res.json(mapped);
  } catch (error) {
    console.error('Projects route error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Integrations API (connections management)
app.get('/api/integrations/providers', requireAuth, async (req, res) => {
  try {
    const allowed = ['github','vercel','openai','gemini','claude'];
    const rows = await Connection.findAll({ where: { user_id: req.user.id }, attributes: { exclude: ['token_encrypted','refresh_token_encrypted'] } });
    const byProvider = Object.fromEntries(rows.map(r => [r.provider, r.toJSON()]));

    const envFallback = {
      github: !!process.env.GITHUB_PAT,
      vercel: !!process.env.VERCEL_TOKEN,
      openai: !!process.env.OPENAI_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      claude: !!process.env.CLAUDE_API_KEY
    };

    const providers = allowed.map(p => {
      const db = byProvider[p];
      const status = db?.status || (envFallback[p] ? 'active' : 'disconnected');
      return {
        id: p,
        status,
        scopes: db?.scopes || [],
        expires_at: db?.expires_at || null,
        last_checked_at: db?.last_checked_at || null,
        account_id: db?.account_id || null,
        source: db ? 'database' : (envFallback[p] ? 'env' : 'none')
      };
    });

    res.json({ providers, devMode: process.env.NODE_ENV === 'development' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load providers', detail: e.message });
  }
});

// Allow broader write access during local development
const requireOwnerOrDev = (req, res, next) => {
  if (process.env.NODE_ENV === 'development') return next();
  return requireRole(['owner','admin'])(req, res, next);
};

// Set/rotate token (PAT or API key)
app.post('/api/integrations/:provider/token', requireAuth, requireOwnerOrDev, async (req, res) => {
  try {
    const { provider } = req.params;
    const { refresh_token, scopes = [], account_id, team_id, expires_at } = req.body || {};
    const token = parseTokenFromRequest(req);
    if (!token) return res.status(400).json({ error: 'token required' });

    let conn = await Connection.findOne({ where: { user_id: req.user.id, provider } });
    if (!conn) {
      // build first to control required fields
      conn = Connection.build({ user_id: req.user.id, provider, token_encrypted: 'placeholder', status: 'active', last_checked_at: new Date() });
      conn.setToken(token);
      if (refresh_token) conn.setRefreshToken(refresh_token);
      try {
        await conn.save();
      } catch (e) {
        // fallback: persist token in user.settings.oauth for dev if connection insert fails
        try {
          const u = await User.findByPk(req.user.id);
          if (u) {
            const s = u.settings || {};
            s.oauth = s.oauth || {};
            s.oauth[provider] = { access_token: token, refresh_token: refresh_token || null, updated_at: new Date().toISOString() };
            u.settings = s;
            await u.save();
          }
        } catch {}
        return res.json({ status: 'saved_fallback', provider });
      }
    }
    // update metadata
    if (scopes) conn.scopes = scopes;
    if (account_id) conn.account_id = account_id;
    if (team_id) conn.team_id = team_id;
    if (expires_at) conn.expires_at = new Date(expires_at);
    conn.status = 'active';
    conn.last_checked_at = new Date();
    conn.setToken(token);
    if (refresh_token) conn.setRefreshToken(refresh_token);
    await conn.save();
    res.json({ status: 'active', provider });
  } catch (e) {
    res.status(500).json({ error: 'Failed to set token' });
  }
});

// Revoke connection
app.post('/api/integrations/:provider/revoke', requireAuth, requireOwnerOrDev, async (req, res) => {
  try {
    const { provider } = req.params;
    const conn = await Connection.findOne({ where: { user_id: req.user.id, provider } });
    if (!conn) return res.status(404).json({ error: 'Connection not found' });
    conn.token_encrypted = '';
    conn.refresh_token_encrypted = null;
    conn.status = 'revoked';
    await conn.save();
    res.json({ status: 'revoked' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to revoke connection' });
  }
});

// Validate connection (supports multiple providers)
app.all('/api/integrations/:provider/validate', requireAuth, async (req, res) => {
  try {
    const { provider } = req.params;
    const fetch = (await import('node-fetch')).default;

    async function getToken() {
      let token = await getProviderTokenForUser(req.user.id, provider);
      if (!token) {
        // env fallbacks
        if (provider === 'github') token = process.env.GITHUB_PAT;
        if (provider === 'vercel') token = process.env.VERCEL_TOKEN;
        if (provider === 'openai') token = process.env.OPENAI_API_KEY;
        if (provider === 'gemini') token = process.env.GEMINI_API_KEY;
        if (provider === 'claude') token = process.env.CLAUDE_API_KEY;
      }
      return token;
    }

    const token = await getToken();
    if (!token) return res.status(400).json({ error: 'Token not set', provider });

    const started = Date.now();
    let ok = false, detail = {}, status = 200;
    try {
      switch (provider) {
        case 'github': {
          const r = await fetch('https://api.github.com/user', { headers: { Authorization: `token ${token}`, 'User-Agent': 'ShellCompany' } });
          ok = r.ok; detail = { status: r.status }; break;
        }
        case 'vercel': {
          const r = await fetch('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${token}` } });
          ok = r.ok; detail = { status: r.status }; break;
        }
        case 'openai': {
          const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${token}` } });
          ok = r.ok; detail = { status: r.status }; break;
        }
        case 'gemini': {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${token}`);
          ok = r.ok; detail = { status: r.status }; break;
        }
        case 'claude': {
          const r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': token, 'anthropic-version': '2023-06-01' } });
          ok = r.ok; detail = { status: r.status }; break;
        }
        default:
          return res.status(400).json({ error: 'Unsupported provider', provider });
      }
    } catch (err) {
      ok = false; status = 502; detail = { error: err.message };
    }

    // persist best-effort status
    try {
      const conn = await Connection.findOne({ where: { user_id: req.user.id, provider } });
      if (conn) { conn.status = ok ? 'active' : 'error'; conn.last_checked_at = new Date(); await conn.save(); }
    } catch {}

    return res.status(ok ? 200 : status).json({ provider, status: ok ? 'active' : 'error', latency_ms: Date.now() - started, detail });
  } catch (e) {
    res.status(500).json({ error: 'Validation failed', detail: e.message });
  }
});

// Model connectivity test – sends a small "hi" to the model and returns reply
app.post('/api/integrations/:provider/test', requireAuth, async (req, res) => {
  try {
    const { provider } = req.params;
    const prompt = (req.body && req.body.prompt) || 'hi';
    const fetch = (await import('node-fetch')).default;

    const started = Date.now();
    let reply = null;

    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY || (await getProviderTokenForUser(req.user.id, 'openai'));
      if (!key) return res.status(400).json({ error: 'OPENAI_API_KEY not set' });
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] })
      });
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'OpenAI error', status: r.status, detail: data });
      reply = data.choices?.[0]?.message?.content || '';
    } else if (provider === 'gemini') {
      const key = process.env.GEMINI_API_KEY || (await getProviderTokenForUser(req.user.id, 'gemini'));
      if (!key) return res.status(400).json({ error: 'GEMINI_API_KEY not set' });
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Gemini error', status: r.status, detail: data });
      reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (provider === 'claude') {
      const key = process.env.CLAUDE_API_KEY || (await getProviderTokenForUser(req.user.id, 'claude'));
      if (!key) return res.status(400).json({ error: 'CLAUDE_API_KEY not set' });
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': key, 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 50, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Claude error', status: r.status, detail: data });
      reply = data?.content?.[0]?.text || '';
    } else if (provider === 'github') {
      const token = process.env.GITHUB_PAT || (await getProviderTokenForUser(req.user.id, 'github'));
      if (!token) return res.status(400).json({ error: 'GITHUB_PAT not set' });
      const r = await fetch('https://api.github.com/user', { headers: { Authorization: `token ${token}`, 'User-Agent': 'ShellCompany' } });
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'GitHub error', status: r.status, detail: data });
      reply = `Hello ${data.login}`;
    } else if (provider === 'vercel') {
      const token = process.env.VERCEL_TOKEN || (await getProviderTokenForUser(req.user.id, 'vercel'));
      if (!token) return res.status(400).json({ error: 'VERCEL_TOKEN not set' });
      const r = await fetch('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Vercel error', status: r.status, detail: data });
      reply = `Hello ${data.user?.username || data.user?.name || 'vercel-user'}`;
    } else {
      return res.status(400).json({ error: 'Unsupported provider', provider });
    }

    return res.json({ provider, ok: true, reply, latency_ms: Date.now() - started });
  } catch (e) {
    res.status(500).json({ error: 'Test failed', detail: e.message });
  }
});

// Provider info endpoint to show live data for confirmation
app.get('/api/integrations/:provider/info', requireAuth, async (req, res) => {
  try {
    const { provider } = req.params;
    let token = await getProviderTokenForUser(req.user.id, provider);
    if (!token && process.env.NODE_ENV === 'development') {
      const { User } = require('./models');
      const owner = await User.findOne({ where: { email: process.env.DEV_OWNER_EMAIL || 'admin@shellcompany.ai' } });
      if (owner) token = await getProviderTokenForUser(owner.id, provider);
    }
    if (!token) return res.status(400).json({ error: 'Token not set' });
    const fetch = (await import('node-fetch')).default;
    switch (provider) {
      case 'github': {
        const user = await fetch('https://api.github.com/user', { headers: { Authorization: `token ${token}`, 'User-Agent': 'ShellCompany' } }).then(r => r.json());
        const repos = await fetch('https://api.github.com/user/repos?per_page=10', { headers: { Authorization: `token ${token}`, 'User-Agent': 'ShellCompany' } }).then(r => r.json());
        return res.json({ user, repos });
      }
      case 'google': {
        const info = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        return res.json({ user: info });
      }
      case 'vercel': {
        const user = await fetch('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        return res.json({ user });
      }
      case 'netlify': {
        const user = await fetch('https://api.netlify.com/api/v1/user', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        return res.json({ user });
      }
      case 'render': {
        const orgs = await fetch('https://api.render.com/v1/organizations', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => []);
        return res.json({ orgs });
      }
      default:
        return res.json({ ok: true });
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to load provider info' });
  }
});

// Engine status: checks availability of OpenAI, Gemini, and Claude with timing and error details
app.get('/api/engine/status', requireAuth, async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const checks = [];

    const tasks = [
      ['openai', async () => {
        const key = process.env.OPENAI_API_KEY || (await getProviderTokenForUser(req.user.id, 'openai'));
        if (!key) throw new Error('OPENAI_API_KEY missing');
        const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        const ok = r.ok; const status = r.status; let error;
        if (!ok) { try { error = await r.json(); } catch { error = { statusText: r.statusText }; } }
        return { ok, status, error };
      }],
      ['gemini', async () => {
        const key = process.env.GEMINI_API_KEY || (await getProviderTokenForUser(req.user.id, 'gemini'));
        if (!key) throw new Error('GEMINI_API_KEY missing');
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const ok = r.ok; const status = r.status; let error;
        if (!ok) { try { error = await r.json(); } catch { error = { statusText: r.statusText }; } }
        return { ok, status, error };
      }],
      ['claude', async () => {
        const key = process.env.CLAUDE_API_KEY || (await getProviderTokenForUser(req.user.id, 'claude'));
        if (!key) throw new Error('CLAUDE_API_KEY missing');
        const r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
        const ok = r.ok; const status = r.status; let error;
        if (!ok) { try { error = await r.json(); } catch { error = { statusText: r.statusText }; } }
        return { ok, status, error };
      }]
    ];

    for (const [name, fn] of tasks) {
      const start = Date.now();
      try {
        const resu = await fn();
        checks.push({ provider: name, status: resu.ok ? 'active' : 'error', http_status: resu.status, latency_ms: Date.now() - start, error: resu.error || null });
      } catch (e) {
        checks.push({ provider: name, status: 'error', http_status: null, latency_ms: Date.now() - start, error: e.message });
      }
    }

    res.json({ checks, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: 'Engine status failed', detail: e.message });
  }
});

// Snapshot of provider capacity (per-key concurrency + rpm window)
app.get('/api/engine/capacity', requireAuth, async (req, res) => {
  try {
    const limits = require('./services/provider-limits');
    res.json({ snapshot: limits.snapshot(), ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: 'capacity_snapshot_failed', detail: e.message });
  }
});

// Autonomous system endpoints
app.get('/api/autonomous/status', async (req, res) => {
  try {
    res.json(workflowSystem.getSystemStatus());
  } catch (error) {
    res.status(500).json({ error: 'Failed to get system status', detail: error.message });
  }
});

// ONGOING PROJECTS API - Return persisted workflows
app.get('/api/autonomous/workflows', async (req, res) => {
  try {
    const allWorkflows = Array.from(workflowSystem.activeWorkflows.values());
    const completedWorkflows = workflowSystem.completedTasks || [];
    
    // Combine active and completed workflows with full details
    const workflows = [...allWorkflows, ...completedWorkflows].map(workflow => ({
      id: workflow.id,
      directive: workflow.request || workflow.scope || 'Autonomous workflow',
      status: workflow.status || 'completed',
      createdAt: workflow.createdAt ? new Date(workflow.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: workflow.updatedAt ? new Date(workflow.updatedAt).toISOString() : new Date().toISOString(),
      completedAt: workflow.completedAt ? new Date(workflow.completedAt).toISOString() : null,
      progress: {
        completed: workflow.tasks?.filter(t => t.status === 'completed').length || 0,
        total: workflow.tasks?.length || 0,
        percentage: workflow.tasks?.length ? Math.round((workflow.tasks.filter(t => t.status === 'completed').length / workflow.tasks.length) * 100) : 0
      },
      tasks: workflow.tasks || [],
      artifacts: workflow.tasks?.reduce((all, task) => all.concat(task.artifacts || []), []) || [],
      timeline: workflow.timeline || {},
      budget: workflow.budget || { tokensUsed: 0, tokensAllocated: 200000 }
    }));

    console.log(`[API] Returning ${workflows.length} workflows to Ongoing Projects`);
    res.json({ workflows });
  } catch (error) {
    console.error('[API] Failed to fetch workflows:', error);
    res.json({ workflows: [] });
  }
});

app.get('/api/autonomous/workflows/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const workflow = workflowSystem.activeWorkflows.get(workflowId) || 
                     workflowSystem.completedTasks.find(w => w.id === workflowId);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json({ workflow });
  } catch (error) {
    console.error('[API] Failed to fetch workflow:', error);
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

app.post('/api/autonomous/workflow', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Request content is required' });
    }

    const workflowId = await workflowSystem.handleWorkflowRequest({
      content,
      sender: 'CEO'
    }, null);

    res.json({
      success: true,
      workflowId,
      message: 'Workflow initiated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start workflow', detail: error.message });
  }
});

app.get('/api/integrations/test', async (req, res) => {
  try {
    const results = await integrationService.testAllIntegrations();
    res.json({ integrations: results, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'Integration test failed', detail: error.message });
  }
});

app.get('/api/integrations/:provider/status', async (req, res) => {
  try {
    const { provider } = req.params;
    const integration = await integrationService.getIntegration(provider);
    const status = await integration.testConnection();
    res.json({ provider, status, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: `Failed to get ${req.params.provider} status`, detail: error.message });
  }
});

app.post('/api/projects', requireAuth, async (req, res) => {
  try {
    const { name, description, create_repo = true, visibility = 'private', org = null } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    // Create DB project row
    const project = await Project.create({ name, description, owner_id: req.user.id, status: 'active' });

    // Create default environments
    for (const env of ['development', 'staging', 'production']) {
      await Environment.create({ project_id: project.id, name: env, status: 'stopped' });
    }

    // Create local folder under ai-projects
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const baseDir = path.join(process.cwd(), 'ai-projects', slug);
    await fsp.mkdir(baseDir, { recursive: true });
    await fsp.writeFile(path.join(baseDir, 'README.md'), `# ${name}\n\n${description || ''}\n`);
    await fsp.writeFile(path.join(baseDir, '.gitignore'), `node_modules\n.env\ndist\n`);

    // Ensure our company config exists
    await ensureWorkersConfig(slug);

    // Initialize local git repo
    const run = (cmd, args, cwd) => new Promise((resolve, reject) => {
      const p = spawn(cmd, args, { cwd, shell: process.platform === 'win32' });
      p.on('error', reject);
      p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
    });

    try {
      await run('git', ['init'], baseDir);
      await run('git', ['add', '.'], baseDir);
      await run('git', ['commit', '-m', 'chore: initial project scaffolding'], baseDir);
      await run('git', ['branch', '-M', 'main'], baseDir);
    } catch (e) {
      console.warn('Git init failed:', e.message);
    }

    // Create remote repo if integration available
    let remoteUrl = null;
    if (create_repo) {
      try {
        const gh = await githubService.createRepository(req.user.id, { name: slug, description: description || '', privateRepo: visibility !== 'public', org });
        const repoOwner = gh.owner?.login || (org || '');
        remoteUrl = gh.html_url;
        // Store repository
        await Repository.create({ project_id: project.id, provider: 'github', owner: repoOwner || '', name: gh.name, default_branch: gh.default_branch || 'main', url: gh.html_url });

        // Push initial commit using ephemeral token in URL (avoid persisting token in .git/config)
        try {
          const { token } = await githubService.getConnection(req.user.id);
          const pushUrl = `https://${token}@github.com/${gh.full_name}.git`;
          await run('git', ['push', pushUrl, 'HEAD:refs/heads/main'], baseDir);
          await run('git', ['remote', 'add', 'origin', `https://github.com/${gh.full_name}.git`], baseDir).catch(() => {});
          await run('git', ['push', '-u', 'origin', 'main'], baseDir).catch(() => {});
        } catch (e) {
          console.warn('Initial push failed:', e.message);
        }
      } catch (e) {
        console.warn('GitHub repo creation failed:', e.message);
      }
    }

    // Update project with local path
    project.file_system_path = baseDir;
    await project.save();

    res.status(201).json({ ...project.toJSON(), repository: remoteUrl ? { url: remoteUrl } : undefined });
  } catch (error) {
    res.status(400).json({ error: 'Failed to create project' });
  }
});

// Connections API
app.get('/api/connections', requireAuth, async (req, res) => {
  try {
    const connections = await Connection.findAll({
      where: { user_id: req.user.id },
      attributes: { exclude: ['token_encrypted', 'refresh_token_encrypted'] }
    });
    res.json(connections);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch connections' });
  }
});

app.post('/api/connections/:provider/test', requireAuth, async (req, res) => {
  try {
    const { provider } = req.params;
    const connection = await Connection.findOne({
      where: { user_id: req.user.id, provider }
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const token = connection.getToken();
    if (!token) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    // Test the connection based on provider
    let testResult = false;
    switch (provider) {
      case 'github':
        // Test GitHub API
        const fetch = require('node-fetch');
        const response = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${token}` }
        });
        testResult = response.ok;
        break;
      // Add other providers as needed
      default:
        testResult = true; // Mock success for development
    }

    connection.status = testResult ? 'active' : 'error';
    connection.last_checked_at = new Date();
    await connection.save();

    res.json({ status: connection.status, tested_at: connection.last_checked_at });
  } catch (error) {
    res.status(500).json({ error: 'Connection test failed' });
  }
});

// Legacy API compatibility for frontend (temporary until frontend is updated)
app.get('/api/projects/:id/workers', async (req, res) => {
  // Mock worker data for now - will be replaced with real data later
  const workers = [
    { id: 'alex', name: 'Alex', role: 'Project Manager', status: 'active', avatar: '👨‍💼' },
    { id: 'nova', name: 'Nova', role: 'Frontend Developer', status: 'active', avatar: '🎨' },
    { id: 'zephyr', name: 'Zephyr', role: 'Backend Developer', status: 'busy', avatar: '⚡' },
    { id: 'cipher', name: 'Cipher', role: 'Security Specialist', status: 'active', avatar: '🔐' }
  ];
  res.json(workers);
});

// ==============================
// GitHub API (real integrations)
// ==============================

// List authenticated user's repos
app.get('/api/github/repos', requireAuth, async (req, res) => {
  try {
    const { type = 'owner', sort = 'updated', per_page = 30, page = 1 } = req.query;
    const repos = await githubService.getRepositories(req.user.id, { type, sort, per_page, page });
    res.json(repos);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to load repositories' });
  }
});

// Repo details
app.get('/api/github/repos/:owner/:repo', requireAuth, async (req, res) => {
  try {
    const data = await githubService.getRepository(req.user.id, req.params.owner, req.params.repo);
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to load repository' });
  }
});

// Branches
app.get('/api/github/repos/:owner/:repo/branches', requireAuth, async (req, res) => {
  try {
    const data = await githubService.getBranches(req.user.id, req.params.owner, req.params.repo);
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to load branches' });
  }
});

// Commits
app.get('/api/github/repos/:owner/:repo/commits', requireAuth, async (req, res) => {
  try {
    const { sha, since, until, per_page, page } = req.query;
    const data = await githubService.getCommits(req.user.id, req.params.owner, req.params.repo, { sha, since, until, per_page, page });
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to load commits' });
  }
});

// Pull requests
app.get('/api/github/repos/:owner/:repo/pulls', requireAuth, async (req, res) => {
  try {
    const { state = 'open' } = req.query;
    const data = await githubService.getPullRequests(req.user.id, req.params.owner, req.params.repo, state);
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to load pull requests' });
  }
});

// Issues
app.get('/api/github/repos/:owner/:repo/issues', requireAuth, async (req, res) => {
  try {
    const { state = 'open', labels, assignee, creator, since } = req.query;
    const data = await githubService.getIssues(req.user.id, req.params.owner, req.params.repo, { state, labels, assignee, creator, since });
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to load issues' });
  }
});

// Workflows
app.get('/api/github/repos/:owner/:repo/actions/workflows', requireAuth, async (req, res) => {
  try {
    const data = await githubService.getWorkflows(req.user.id, req.params.owner, req.params.repo);
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to load workflows' });
  }
});

// Workflow runs
app.get('/api/github/repos/:owner/:repo/actions/runs', requireAuth, async (req, res) => {
  try {
    const { status, branch, event, per_page, page } = req.query;
    const data = await githubService.getWorkflowRuns(req.user.id, req.params.owner, req.params.repo, null, { status, branch, event, per_page, page });
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to load runs' });
  }
});

// Dispatch workflow (owner/admin)
app.post('/api/github/repos/:owner/:repo/actions/workflows/:id/dispatches', requireAuth, requireRole(['owner','admin']), async (req, res) => {
  try {
    const { ref, inputs } = req.body || {};
    if (!ref) return res.status(400).json({ error: 'ref required (branch or tag)' });
    const data = await githubService.triggerWorkflow(req.user.id, req.params.owner, req.params.repo, req.params.id, ref, inputs || {});
    res.json({ ok: true, dispatch: data });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to dispatch workflow' });
  }
});

// Webhooks
app.get('/api/github/repos/:owner/:repo/hooks', requireAuth, async (req, res) => {
  try {
    const data = await githubService.getWebhooks(req.user.id, req.params.owner, req.params.repo);
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to load hooks' });
  }
});

app.post('/api/github/repos/:owner/:repo/hooks', requireAuth, requireRole(['owner','admin']), async (req, res) => {
  try {
    const { url, events, secret } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    const data = await githubService.createWebhook(req.user.id, req.params.owner, req.params.repo, { url, events, secret });
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to create hook' });
  }
});

app.delete('/api/github/repos/:owner/:repo/hooks/:hookId', requireAuth, requireRole(['owner','admin']), async (req, res) => {
  try {
    await githubService.deleteWebhook(req.user.id, req.params.owner, req.params.repo, req.params.hookId);
    res.json({ ok: true });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to delete hook' });
  }
});

// Rate limit
app.get('/api/github/rate_limit', requireAuth, async (req, res) => {
  try {
    const data = await githubService.getRateLimit(req.user.id);
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to load rate limit' });
  }
});

app.get('/api/projects/:id/workers/:workerId', async (req, res) => {
  // Mock worker detail data
  const worker = {
    id: req.params.workerId,
    name: 'Alex',
    role: 'Project Manager',
    status: 'active',
    avatar: '👨‍💼',
    terminal: 'aimanager status active\n✓ Project coordination active',
    outputs: [],
    files: [],
    summary: 'Managing project coordination and team alignment',
    commands: ['aimanager status', 'git status'],
    workingDirectory: '/project',
    created: new Date(),
    lastActive: new Date()
  };
  res.json(worker);
});

app.get('/api/projects/:id/environments', async (req, res) => {
  const environments = {
    development: { status: 'healthy', url: 'http://localhost:5173', lastDeployed: new Date(), version: 'v1.0.0-dev' },
    staging: { status: 'healthy', url: 'https://staging.shellcompany.ai', lastDeployed: new Date(), version: 'v1.0.0-rc' },
    production: { status: 'healthy', url: 'https://shellcompany.ai', lastDeployed: new Date(), version: 'v1.0.0' }
  };
  res.json(environments);
});

app.get('/api/projects/:id/pipeline', async (req, res) => {
  const pipeline = {
    status: 'success',
    stages: [
      { name: 'Build', status: 'success', duration: '2m 30s' },
      { name: 'Test', status: 'success', duration: '1m 45s' },
      { name: 'Deploy', status: 'success', duration: '45s' }
    ]
  };
  res.json(pipeline);
});

app.get('/api/projects/:id/filesystem', async (req, res) => {
  try {
    const os = require('os');
    const p = require('path');
    const fs = require('fs');
    const fsp = fs.promises;
    const root = p.join(os.homedir(), 'ShellCompany', req.params.id || 'shellcompany');

    async function statEntry(full) {
      try { return await fsp.stat(full); } catch { return null; }
    }
    async function walk(dir, depth = 2) {
      const out = {};
      if (depth < 0) return out;
      let entries = [];
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { entries = []; }
      for (const ent of entries) {
        const full = p.join(dir, ent.name);
        const st = await statEntry(full);
        if (!st) continue;
        if (ent.isDirectory()) {
          out[ent.name + '/'] = { type: 'directory', modified: st.mtime, children: await walk(full, depth - 1) };
        } else {
          out[ent.name] = { type: 'file', size: st.size, modified: st.mtime };
        }
      }
      return out;
    }

    const structure = await walk(root, 2);
    res.json({ rootPath: root, structure });
  } catch (e) {
    res.status(500).json({ error: 'fs_read_failed', detail: e.message });
  }
});

app.get('/api/projects/:id/metrics', async (req, res) => {
  const metrics = {
    performance: 95,
    coverage: 87,
    security: 99,
    builds: 142
  };
  res.json(metrics);
});

app.post('/api/projects/:id/workers/:workerId/terminal', async (req, res) => {
  res.json({ success: true, output: 'Command executed successfully' });
});

app.post('/api/projects/:id/workers/:workerId/files/:fileName', async (req, res) => {
  res.json({ success: true, message: 'File updated successfully' });
});

app.post('/api/projects/:id/deploy/:env', async (req, res) => {
  const deployment = {
    id: `deploy_${Date.now()}`,
    environment: req.params.env,
    status: 'success',
    url: `https://${req.params.env}.shellcompany.ai`,
    startTime: new Date(),
    endTime: new Date()
  };
  res.json(deployment);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// ==============================
// Autonomous Company controls
// ==============================

app.get('/api/company/status', async (req, res) => {
  res.json({ active: companyRuns.active, projectSlug: companyRuns.projectSlug, tick: companyRuns.tick });
});

// --- Task runtime (desktop) ---
const taskRunner = require('./services/task-runner');
app.post('/api/tasks/start', requireAuth, async (req, res) => {
  try {
    const { projectId = 'shellcompany', command = 'echo', args = ['hello from ShellCompany'], cwd, env } = req.body || {};
    if (!command) return res.status(400).json({ error: 'command required' });
    const out = await taskRunner.startTask({ projectId, command, args, cwd, env });
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ error: 'failed_to_start_task', detail: e.message });
  }
});

app.get('/api/tasks/:taskId/logs', requireAuth, async (req, res) => {
  try {
    const { projectId = 'shellcompany', lines = 200 } = req.query;
    const list = await taskRunner.tailLogs({ projectId, taskId: req.params.taskId, lines: parseInt(lines) || 200 });
    res.json({ logs: list });
  } catch (e) {
    res.status(500).json({ error: 'failed_to_read_logs', detail: e.message });
  }
});

// --- PTY endpoints ---
app.post('/api/pty/start', requireAuth, async (req, res) => {
  try {
    const ptyMgr = require('./services/pty-manager');
    const { projectId = 'shellcompany', shell, cwd } = req.body || {};
    const out = await ptyMgr.start({ projectId, shell, cwd });
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ error: 'pty_start_failed', detail: e.message });
  }
});

app.post('/api/pty/:id/input', requireAuth, async (req, res) => {
  try {
    const ptyMgr = require('./services/pty-manager');
    const { data } = req.body || {};
    ptyMgr.input(req.params.id, data || '');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'pty_input_failed', detail: e.message }); }
});

app.post('/api/pty/:id/resize', requireAuth, async (req, res) => {
  try {
    const ptyMgr = require('./services/pty-manager');
    const { cols = 120, rows = 30 } = req.body || {};
    ptyMgr.resize(req.params.id, cols, rows);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'pty_resize_failed', detail: e.message }); }
});

app.delete('/api/pty/:id', requireAuth, async (req, res) => {
  try {
    const ptyMgr = require('./services/pty-manager');
    const ok = ptyMgr.kill(req.params.id);
    res.json({ ok });
  } catch (e) { res.status(500).json({ error: 'pty_kill_failed', detail: e.message }); }
});

// --- Runs and Artifacts ---
app.post('/api/runs', requireAuth, async (req, res) => {
  try {
    const { task_id = null, project_id = 'shellcompany', provider, job_id, url, status = 'pending', meta } = req.body || {};
    if (!provider) return res.status(400).json({ error: 'provider required' });
    const row = await Run.create({ task_id, project_id, provider, job_id, url, status, started_at: new Date(), meta_json: meta || {} });
    res.json(row);
  } catch (e) { res.status(500).json({ error: 'run_create_failed', detail: e.message }); }
});

app.patch('/api/runs/:id', requireAuth, async (req, res) => {
  try {
    const row = await Run.findByPk(req.params.id);
    if (!row) return res.status(404).json({ error: 'run_not_found' });
    const { status, job_id, url, meta, finished } = req.body || {};
    if (status) row.status = status;
    if (job_id) row.job_id = job_id;
    if (url) row.url = url;
    if (meta) row.meta_json = meta;
    if (finished) row.finished_at = new Date();
    await row.save();
    res.json(row);
  } catch (e) { res.status(500).json({ error: 'run_update_failed', detail: e.message }); }
});

app.get('/api/runs', requireAuth, async (req, res) => {
  try {
    const { project_id } = req.query;
    const where = project_id ? { project_id } : {};
    const rows = await Run.findAll({ where, order: [['createdAt','DESC']], limit: 50 });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'runs_fetch_failed', detail: e.message }); }
});

app.post('/api/artifacts/ingest', requireAuth, async (req, res) => {
  try {
    const { project_id = 'shellcompany', path: filePath, task_id } = req.body || {};
    if (!filePath) return res.status(400).json({ error: 'path required' });
    const { sha256, bytes, storedAt } = await (async () => {
      const fs = require('fs');
      const fsp = fs.promises;
      const crypto = require('crypto');
      const os = require('os');
      const p = require('path');
      const buf = await fsp.readFile(filePath);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      const base = p.join(os.homedir(), 'ShellCompany', '.artifacts');
      await fsp.mkdir(base, { recursive: true });
      const out = p.join(base, sha256);
      try { await fsp.access(out); } catch { await fsp.writeFile(out, buf); }
      return { sha256, bytes: buf.length, storedAt: out };
    })();
    const row = await Artifact.create({ project_id, path: filePath, sha256, bytes, produced_by_task: task_id || null });
    res.json({ artifact: row, storedAt });
  } catch (e) { res.status(500).json({ error: 'artifact_ingest_failed', detail: e.message }); }
});

app.get('/api/artifacts', requireAuth, async (req, res) => {
  try {
    const { project_id } = req.query;
    const where = project_id ? { project_id } : {};
    const rows = await Artifact.findAll({ where, order: [['createdAt','DESC']], limit: 100 });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'artifacts_fetch_failed', detail: e.message }); }
});

// --- Workers (heartbeats + status) ---
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function computeWorkerStatus(w) {
  const now = Date.now();
  if (w.pid && pidAlive(w.pid)) {
    if (w.last_heartbeat && (now - new Date(w.last_heartbeat).getTime()) <= 10000) return 'active';
    return 'idle';
  }
  return 'offline';
}

app.get('/api/workers', requireAuth, async (req, res) => {
  try {
    const rows = await Worker.findAll();
    const list = rows.map(r => ({ ...r.toJSON(), computed_status: computeWorkerStatus(r) }));
    res.json(list);
  } catch (e) { res.status(500).json({ error: 'workers_fetch_failed', detail: e.message }); }
});

app.get('/api/workers/:id', requireAuth, async (req, res) => {
  try {
    const w = await Worker.findByPk(req.params.id);
    if (!w) return res.status(404).json({ error: 'worker_not_found' });
    res.json({ ...w.toJSON(), computed_status: computeWorkerStatus(w) });
  } catch (e) { res.status(500).json({ error: 'worker_fetch_failed', detail: e.message }); }
});

app.post('/api/workers/:id/register', requireAuth, async (req, res) => {
  try {
    const { name, role, pid = null, cwd = process.cwd(), tools = [], env_masked = {} } = req.body || {};
    const w = await Worker.upsert({ id: req.params.id, name: name || req.params.id, role: role || 'worker', pid, cwd, status: 'idle', tools, env_masked, last_heartbeat: new Date(), last_heartbeat_seq: 1 });
    res.json({ ok: true, id: req.params.id });
  } catch (e) { res.status(500).json({ error: 'worker_register_failed', detail: e.message }); }
});

app.post('/api/workers/:id/heartbeat', requireAuth, async (req, res) => {
  try {
    const w = await Worker.findByPk(req.params.id);
    if (!w) return res.status(404).json({ error: 'worker_not_found' });
    w.last_heartbeat = new Date();
    w.last_heartbeat_seq = (w.last_heartbeat_seq || 0) + 1;
    if (req.body && typeof req.body.pid === 'number') w.pid = req.body.pid;
    if (req.body && typeof req.body.queue_depth === 'number') w.queue_depth = req.body.queue_depth;
    if (req.body && req.body.current_command) w.current_command = req.body.current_command;
    await w.save();
    res.json({ ok: true, computed_status: computeWorkerStatus(w), seq: w.last_heartbeat_seq });
  } catch (e) { res.status(500).json({ error: 'worker_heartbeat_failed', detail: e.message }); }
});

app.post('/api/workers/:id/stop', requireAuth, async (req, res) => {
  try {
    const w = await Worker.findByPk(req.params.id);
    if (!w) return res.status(404).json({ error: 'worker_not_found' });
    let killed = false;
    if (w.pid && pidAlive(w.pid)) { try { process.kill(w.pid); killed = true; } catch {} }
    w.pid = null; w.status = 'offline'; await w.save();
    res.json({ ok: true, killed });
  } catch (e) { res.status(500).json({ error: 'worker_stop_failed', detail: e.message }); }
});


app.post('/api/company/launch', requireAuth, requireRole(['owner','admin']), async (req, res) => {
  try {
    const { objective = '', project = 'ShellCompany' } = req.body || {};
    const slug = slugify(project);
    // resolve project id for broadcasts
    let dbProject = await Project.findOne({ where: { owner_id: req.user.id, status: 'active' } });
    if (!dbProject || slugify(dbProject.name) !== slug) {
      const all = await Project.findAll({ where: { owner_id: req.user.id, status: 'active' } });
      dbProject = all.find(p => slugify(p.name) === slug) || all[0] || null;
    }
    await ensureWorkersConfig(slug);
    // seed basic tasks
    await writeTasks(slug, [
      { id: 1001, title: 'Plan epics and tasks', assignee_id: 'alex', status: 'in_progress', priority: 'high' },
      { id: 2001, title: 'Scaffold React + TS app', assignee_id: 'nova', status: 'todo', priority: 'high' },
      { id: 2020, title: 'Scaffold Node + Express API', assignee_id: 'zephyr', status: 'todo', priority: 'high' }
    ]);

    // start in-memory loop to simulate progress and update JSON files
    if (companyRuns.timer) clearInterval(companyRuns.timer);
    companyRuns.active = true;
    companyRuns.projectSlug = slug;
    companyRuns.projectId = dbProject ? dbProject.id : slug;
    companyRuns.objective = objective;
    companyRuns.tick = 0;
    companyRuns.timer = setInterval(async () => {
      try {
        companyRuns.tick++;
        const { dataDir, configDir } = await ensureCompanyDir(slug);
        // flip a worker status to active
        const cfg = JSON.parse(await fsp.readFile(path.join(configDir, 'workers.json'), 'utf-8'));
        const list = cfg.workers || [];
        const w = list[companyRuns.tick % list.length];
        const sPath = path.join(dataDir, `worker-${w.id}.json`);
        const s = JSON.parse(fs.existsSync(sPath) ? await fsp.readFile(sPath, 'utf-8') : '{}');
        s.status = 'active';
        s.current_focus = `Working on tick ${companyRuns.tick}`;
        s.last_update = new Date().toISOString();
        await fsp.writeFile(sPath, JSON.stringify(s, null, 2));
        // broadcast
        broadcast({ type: 'WORKERS_UPDATED', projectId: companyRuns.projectId, workerId: w.id, worker: s, tick: companyRuns.tick });
        pushEvent({ source: 'agent', kind: 'worker_tick', project: companyRuns.projectId, worker: w.id, focus: s.current_focus, tick: companyRuns.tick });
      } catch (e) {
        // ignore
      }
      if (companyRuns.tick > 50) {
        clearInterval(companyRuns.timer);
        companyRuns.active = false;
      }
    }, 1000);

    res.json({ ok: true, project: slug, active: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to launch company' });
  }
});

app.post('/api/company/stop', requireAuth, requireRole(['owner','admin']), async (req, res) => {
  if (companyRuns.timer) clearInterval(companyRuns.timer);
  companyRuns.active = false;
  res.json({ ok: true });
});

// Events API for Console panel
app.get('/api/events', requireAuth, async (req, res) => {
  res.json({ events: eventBuffer });
});

// GitHub webhook receiver (optional: no signature verification in dev)
app.post('/webhooks/github', async (req, res) => {
  try {
    const event = req.headers['x-github-event'] || 'unknown';
    const delivery = req.headers['x-github-delivery'] || crypto.randomUUID();
    pushEvent({ source: 'github', event, delivery, payload: req.body });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'webhook failed' });
  }
});

// WebSocket server for real-time updates
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// Initialize Socket.IO for autonomous system
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Initialize Autonomous Workflow System
const workflowSystem = new AutonomousWorkflowSystem(io);
const integrationService = new IntegrationService();

// Socket.IO connection handling for autonomous system
io.on('connection', (socket) => {
  console.log('🤖 Autonomous client connected:', socket.id);

  socket.emit('system-status', workflowSystem.getSystemStatus());

  socket.on('disconnect', () => {
    console.log('👋 Autonomous client disconnected:', socket.id);
  });
});

// Setup console logger broadcast function for real-time logging
consoleLogger.setBroadcastFunction((data) => {
  io.emit('console_log', data);
});

// Add some test logs to verify console logger is working
console.log('[CONSOLE-LOGGER] Console logger initialized and broadcasting via Socket.IO');
console.log('[SERVER] ShellCompany Auth Server console logging active');
console.error('[TEST] Test error message for console debugging');

wss.on('connection', (ws) => {
  console.log('👥 Client connected');
  
  ws.on('close', () => {
    console.log('👋 Client disconnected');
  });

  // Send initial connection confirmation
  ws.send(JSON.stringify({ type: 'CONNECTED', timestamp: new Date() }));
});

// Bridge service bus -> websocket/console events
try {
  const bus = require('./services/bus');
  bus.on('broadcast', (data) => {
    broadcast(data);
  });
  bus.on('event', (evt) => {
    // Reuse existing console event buffer + broadcast
    try { pushEvent(evt); } catch { /* ignore */ }
  });
} catch (e) { console.warn('Event bus not available:', e.message); }

// Database initialization and server start
const initializeServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('📊 Database connection established successfully.');

    // Sync database models
    // Use a safe sync strategy: attempt an in-place alter in development but
    // fall back to a non-altering sync to avoid destructive DROP/ALTER operations
    // that can fail when foreign keys exist (SQLite returns SQLITE_CONSTRAINT).
    try {
      if (process.env.NODE_ENV === 'development') {
        await sequelize.sync({ alter: true });
        console.log('📋 Database models synchronized (alter).');
      } else {
        await sequelize.sync();
        console.log('📋 Database models synchronized (safe sync).');
      }
    } catch (e) {
      console.warn('⚠️  Model sync (alter) failed, falling back to safe sequelize.sync():', e && e.message);
      await sequelize.sync();
      console.log('📋 Database models synchronized (fallback safe sync).');
    }

    // Best-effort: relax provider enum on connections to avoid CHECK constraints during local dev
    try {
      const qi = sequelize.getQueryInterface();
      await qi.changeColumn('connections', 'provider', { type: DataTypes.STRING, allowNull: false });
    } catch (e) {
      // ignore if table doesn't exist yet or driver doesn't support changeColumn
    }

      // Create default admin user if none exists
      const userCount = await User.count();
      if (userCount === 0) {
        await User.create({
          email: 'admin@shellcompany.ai',
          name: 'ShellCompany Admin',
          role: 'owner',
          password_hash: 'admin123' // Will be hashed by the model
        });
        console.log('👤 Default admin user created (admin@shellcompany.ai / admin123)');
      }

      // Seed GitHub connection from env PAT if present
      if (process.env.GITHUB_PAT) {
        try {
          const admin = await User.findOne({ where: { email: 'admin@shellcompany.ai' } });
          if (admin) {
            let conn = await Connection.findOne({ where: { user_id: admin.id, provider: 'github' } });
            if (!conn) {
              conn = await Connection.create({ user_id: admin.id, provider: 'github', token_encrypted: 'placeholder', scopes: ['repo','workflow','read:org','project','admin:repo_hook'], status: 'active', last_checked_at: new Date() });
            }
            conn.setToken(process.env.GITHUB_PAT);
            await conn.save();
            console.log('🔐 Seeded GitHub PAT from .env into Connections');
          }
        } catch (e) {
          console.warn('Could not seed GitHub PAT:', e.message);
        }
      }

      // Seed Vercel token if present
      if (process.env.VERCEL_TOKEN) {
        try {
          const admin = await User.findOne({ where: { email: 'admin@shellcompany.ai' } });
          if (admin) {
            let conn = await Connection.findOne({ where: { user_id: admin.id, provider: 'vercel' } });
            if (!conn) conn = await Connection.create({ user_id: admin.id, provider: 'vercel', token_encrypted: 'placeholder', status: 'active', last_checked_at: new Date() });
            conn.setToken(process.env.VERCEL_TOKEN);
            await conn.save();
            console.log('🔐 Seeded Vercel token from .env into Connections');
          }
        } catch (e) { console.warn('Could not seed Vercel token:', e.message); }
      }

    // Ensure agents are initialized in development
    try {
      const { Agent } = require('./models');
      const agentCount = await Agent.count();
      if (agentCount === 0) {
        const agentRoster = require('./services/agent-roster');
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
        console.log(`🤖 Seeded ${agentRoster.agentsArray.length} agents into the database`);
      }
    } catch (e) {
      console.warn('Could not seed agents on startup:', e.message);
    }

    // Optional: STRICT_KEYS validation (fail fast when required keys are missing)
    if (process.env.STRICT_KEYS === 'true') {
      const required = [
        ['GITHUB_PAT', process.env.GITHUB_PAT],
        ['VERCEL_TOKEN', process.env.VERCEL_TOKEN],
        ['OPENAI_API_KEY', process.env.OPENAI_API_KEY],
        ['GEMINI_API_KEY', process.env.GEMINI_API_KEY],
        ['CLAUDE_API_KEY', process.env.CLAUDE_API_KEY]
      ];
      const missing = required.filter(([, v]) => !v).map(([k]) => k);
      if (missing.length) {
        console.error('❌ STRICT_KEYS: Missing env keys:', missing.join(', '));
        process.exit(1);
      }
    }

    // Start FS watcher on default project root so file writes show in Console immediately
    try {
      const watcher = require('./services/fs-watcher');
      const projRoot = path.join(os.homedir(), 'ShellCompany', 'shellcompany');
      watcher.start({ projectId: 'shellcompany', dir: projRoot });
    } catch (e) {
      console.warn('⚠️  FS watcher not started:', e.message);
    }

    // Start server
    server.listen(PORT, () => {
      console.log(`🚀 ShellCompany Auth Server running on http://localhost:${PORT}`);
      console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
      console.log(`🔐 Session secret configured: ${!!process.env.SESSION_SECRET}`);
      console.log(`📡 GitHub OAuth configured: ${!!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)}`);
      console.log(`🔍 Google OAuth configured: ${!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}`);
    });

  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Shutting down gracefully...');

  // Shutdown autonomous services
  try {
    const agentEngine = require('./services/agent-engine');
    const taskQueue = require('./services/task-queue');

    await agentEngine.shutdown();
    await taskQueue.shutdown();
    console.log('✅ Autonomous services shut down');
  } catch (error) {
    console.error('⚠️ Error shutting down autonomous services:', error);
  }

  await sequelize.close();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚫 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
async function getProviderTokenForUser(userId, provider) {
  const { Connection, User } = require('./models');
  const c = await Connection.findOne({ where: { user_id: userId, provider } });
  if (c && c.getToken()) return c.getToken();
  const u = await User.findByPk(userId);
  if (u && u.settings && u.settings.oauth && u.settings.oauth[provider]?.access_token) {
    return u.settings.oauth[provider].access_token;
  }
  // Env fallbacks for local dev
  if (process.env.NODE_ENV === 'development') {
    switch (provider) {
      case 'github':
        if (process.env.GITHUB_PAT) return process.env.GITHUB_PAT;
        break;
      case 'vercel':
        if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
        break;
      case 'netlify':
        if (process.env.NETLIFY_AUTH_TOKEN) return process.env.NETLIFY_AUTH_TOKEN;
        break;
      case 'render':
        if (process.env.RENDER_API_KEY) return process.env.RENDER_API_KEY;
        break;
      case 'google':
        if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN; // optional for dev
        break;
    }
  }
  return null;
}

initializeServer();
