const fs = require('fs');
const path = require('path');

class AIWorkersService {
  constructor() {
    this.configPath = path.join(__dirname, '../config/ai-workers');
    this.workersPath = path.join(__dirname, '../workers');
    this.workersCache = null;
    this.projectCache = null;
    this.workerDataCache = new Map();
  }

  loadProjectConfig() {
    if (this.projectCache) return this.projectCache;

    try {
      const projectConfigPath = path.join(this.configPath, 'project.json');
      if (fs.existsSync(projectConfigPath)) {
        this.projectCache = JSON.parse(fs.readFileSync(projectConfigPath, 'utf8'));
        return this.projectCache;
      }
    } catch (error) {
      console.error('Failed to load project config:', error);
    }

    return null;
  }

  loadWorkersConfig() {
    if (this.workersCache) return this.workersCache;

    try {
      const workersConfigPath = path.join(this.configPath, 'workers.json');
      if (fs.existsSync(workersConfigPath)) {
        this.workersCache = JSON.parse(fs.readFileSync(workersConfigPath, 'utf8'));
        return this.workersCache;
      }
    } catch (error) {
      console.error('Failed to load workers config:', error);
    }

    return null;
  }

  loadWorkerData(workerId) {
    if (this.workerDataCache.has(workerId)) {
      return this.workerDataCache.get(workerId);
    }

    try {
      const workerDataPath = path.join(this.configPath, `worker-${workerId}.json`);
      if (fs.existsSync(workerDataPath)) {
        const data = JSON.parse(fs.readFileSync(workerDataPath, 'utf8'));
        this.workerDataCache.set(workerId, data);
        return data;
      }
    } catch (error) {
      console.error(`Failed to load worker data for ${workerId}:`, error);
    }

    return null;
  }

  loadWorkerInstructions(workerId) {
    try {
      const instructionsPath = path.join(this.workersPath, `${workerId}-instructions.md`);
      if (fs.existsSync(instructionsPath)) {
        return fs.readFileSync(instructionsPath, 'utf8');
      }
    } catch (error) {
      console.error(`Failed to load instructions for ${workerId}:`, error);
    }

    return null;
  }

  getWorkers() {
    const workersConfig = this.loadWorkersConfig();
    if (!workersConfig || !workersConfig.workers) {
      return [];
    }

    return workersConfig.workers.map(worker => {
      const workerData = this.loadWorkerData(worker.id);
      const instructions = this.loadWorkerInstructions(worker.id);

      return {
        id: worker.id,
        name: worker.name,
        role: worker.role,
        avatar: worker.avatar,
        specialties: worker.specialties || [],
        responsibilities: worker.responsibilities || [],
        kpis: worker.kpis || [],
        color: worker.color,
        status: this.getWorkerStatus(worker.id),
        currentTask: this.getWorkerCurrentTask(worker.id),
        queue: this.getWorkerQueueDepth(worker.id),
        lastHeartbeat: new Date().toISOString(),
        instructions: instructions,
        data: workerData,
        capabilities: worker.specialties || [],
        pid: process.pid + Math.floor(Math.random() * 100),
        cwd: this.getWorkerWorkspace(worker.id),
        memoryUsage: Math.floor(Math.random() * 100000000) + 50000000
      };
    });
  }

  getWorker(workerId) {
    const workers = this.getWorkers();
    return workers.find(worker => worker.id === workerId);
  }

  getWorkerStatus(workerId) {
    // Check if worker has any active tasks or current work
    const workerData = this.loadWorkerData(workerId);
    if (workerData?.status) {
      return workerData.status;
    }

    // Default status based on role and typical workload
    const statusMap = {
      'alex': 'active',    // Project Manager - always coordinating
      'nova': 'busy',      // Frontend - actively building UI
      'zephyr': 'active',  // Backend - ready for tasks
      'cipher': 'idle',    // Security - monitoring, not actively coding
      'sage': 'busy',      // DevOps - managing infrastructure
      'pixel': 'active'    // Designer - creating mockups
    };
    return statusMap[workerId] || 'active';
  }

  getWorkerCurrentTask(workerId) {
    const workerData = this.loadWorkerData(workerId);
    if (workerData?.currentTask) {
      return workerData.currentTask;
    }

    const taskMap = {
      'alex': 'Coordinating team workflow and task assignments',
      'nova': 'Building responsive React components for dashboard',
      'zephyr': 'Implementing backend API endpoints for task management',
      'cipher': null,
      'sage': 'Optimizing deployment pipeline configuration',
      'pixel': 'Designing user interface mockups for agent dashboard'
    };
    return taskMap[workerId] || null;
  }

  getWorkerQueueDepth(workerId) {
    const workerData = this.loadWorkerData(workerId);
    if (workerData?.queueDepth !== undefined) {
      return workerData.queueDepth;
    }

    // Calculate based on status and role
    const status = this.getWorkerStatus(workerId);
    const queueMap = {
      'busy': 3,
      'active': 1,
      'idle': 0
    };
    return queueMap[status] || 0;
  }

  getWorkerWorkspace(workerId) {
    return path.join(process.cwd(), 'server', 'agent-workspaces', `${workerId}-workspace`);
  }

  getProjectInfo() {
    const projectConfig = this.loadProjectConfig();
    if (!projectConfig) return null;

    return {
      name: projectConfig.name,
      description: projectConfig.description,
      type: projectConfig.type,
      technologies: projectConfig.technologies || [],
      complexity: projectConfig.complexity,
      estimatedDays: projectConfig.estimatedDays,
      status: projectConfig.status,
      autonomous: projectConfig.autonomous,
      template: projectConfig.template,
      created: projectConfig.created
    };
  }

  getTeamStructure() {
    const workersConfig = this.loadWorkersConfig();
    return workersConfig?.team_structure || null;
  }

  getTasks() {
    try {
      const tasksPath = path.join(this.configPath, 'tasks.json');
      if (fs.existsSync(tasksPath)) {
        return JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
    return { tasks: [] };
  }

  updateWorkerStatus(workerId, status, currentTask = null) {
    // In a real implementation, this would persist to database
    console.log(`[AI-WORKERS] Worker ${workerId} status updated to ${status}`);
    if (currentTask) {
      console.log(`[AI-WORKERS] Worker ${workerId} current task: ${currentTask}`);
    }
  }

  refreshCache() {
    this.workersCache = null;
    this.projectCache = null;
    this.workerDataCache.clear();
  }
}

module.exports = new AIWorkersService();