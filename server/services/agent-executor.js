const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AgentExecutor {
  constructor(agentName, workspaceDir, socketio) {
    this.agentName = agentName;
    this.workspaceDir = workspaceDir;
    this.socketio = socketio;
    this.status = 'idle';
    this.currentTask = null;
    this.processHistory = [];
    this.artifacts = [];
    this.startTime = null;
  }

  async executeTask(taskId, taskDescription, commands) {
    this.status = 'busy';
    this.currentTask = { id: taskId, description: taskDescription, startTime: Date.now() };
    this.startTime = Date.now();

    this.emitStatus('started', { taskId, description: taskDescription });
    this.streamToConsole(`[${this.agentName}] Starting task: ${taskDescription}`);

    const executionResults = {
      taskId,
      agentName: this.agentName,
      startTime: this.startTime,
      steps: [],
      artifacts: [],
      status: 'running'
    };

    try {
      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        const stepResult = await this.executeCommand(command, i + 1, commands.length);
        executionResults.steps.push(stepResult);
        
        if (!stepResult.success) {
          throw new Error(`Step ${i + 1} failed: ${stepResult.error}`);
        }
      }

      executionResults.status = 'completed';
      executionResults.endTime = Date.now();
      executionResults.duration = executionResults.endTime - executionResults.startTime;

      this.status = 'idle';
      this.currentTask = null;
      
      this.emitStatus('completed', executionResults);
      this.streamToConsole(`[${this.agentName}] Task completed successfully in ${Math.round(executionResults.duration / 1000)}s`);

      return executionResults;

    } catch (error) {
      executionResults.status = 'failed';
      executionResults.error = error.message;
      executionResults.endTime = Date.now();
      executionResults.duration = executionResults.endTime - executionResults.startTime;

      this.status = 'error';
      this.currentTask = null;

      this.emitStatus('failed', executionResults);
      this.streamToConsole(`[${this.agentName}] Task failed: ${error.message}`);

      return executionResults;
    }
  }

  async executeCommand(command, stepNumber, totalSteps) {
    const commandId = uuidv4();
    const stepStart = Date.now();

    this.streamToConsole(`[${this.agentName}] Step ${stepNumber}/${totalSteps}: ${command}`);

    return new Promise((resolve) => {
      const process = spawn('sh', ['-c', command], {
        cwd: this.workspaceDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        this.streamToConsole(output, 'stdout');
      });

      process.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        this.streamToConsole(output, 'stderr');
      });

      process.on('close', (code) => {
        const stepEnd = Date.now();
        const stepDuration = stepEnd - stepStart;

        const stepResult = {
          commandId,
          step: stepNumber,
          command,
          exitCode: code,
          success: code === 0,
          stdout,
          stderr,
          startTime: stepStart,
          endTime: stepEnd,
          duration: stepDuration
        };

        if (code !== 0) {
          stepResult.error = `Command exited with code ${code}`;
        }

        this.processHistory.push(stepResult);
        this.streamToConsole(`[${this.agentName}] Step ${stepNumber} ${code === 0 ? 'completed' : 'failed'} (${Math.round(stepDuration / 1000)}s)`);

        resolve(stepResult);
      });

      process.on('error', (error) => {
        const stepResult = {
          commandId,
          step: stepNumber,
          command,
          success: false,
          error: error.message,
          startTime: stepStart,
          endTime: Date.now(),
          duration: Date.now() - stepStart
        };

        this.processHistory.push(stepResult);
        this.streamToConsole(`[${this.agentName}] Step ${stepNumber} error: ${error.message}`);

        resolve(stepResult);
      });
    });
  }

  async createFile(filePath, content) {
    const fullPath = path.join(this.workspaceDir, filePath);
    const dirPath = path.dirname(fullPath);

    try {
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf8');

      // Compute SHA-256 checksum for integrity and lineage
      const crypto = require('crypto');
      const buf = Buffer.from(content, 'utf8');
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

      const artifact = {
        id: uuidv4(),
        type: 'file',
        path: filePath,
        fullPath,
        absolutePath: fullPath,
        size: buf.length,
        sha256,
        createdAt: new Date().toISOString(),
        agentName: this.agentName
      };

      this.artifacts.push(artifact);
      this.streamToConsole(`[${this.agentName}] Created file: ${filePath} (${artifact.size} bytes)`);

      return artifact;
    } catch (error) {
      this.streamToConsole(`[${this.agentName}] Failed to create file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  async readFile(filePath) {
    const fullPath = path.join(this.workspaceDir, filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      this.streamToConsole(`[${this.agentName}] Read file: ${filePath} (${Buffer.byteLength(content, 'utf8')} bytes)`);
      return content;
    } catch (error) {
      this.streamToConsole(`[${this.agentName}] Failed to read file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  streamToConsole(message, type = 'info') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      agent: this.agentName,
      type,
      message: message.toString().trim(),
      taskId: this.currentTask?.id || null
    };

    // Emit to Console tab via Socket.IO
    if (this.socketio) {
      this.socketio.emit('console-log', logEntry);
    }

    // Also log to server console for debugging
    console.log(`[AGENT:${this.agentName}] ${logEntry.message}`);
  }

  emitStatus(eventType, data) {
    const statusUpdate = {
      agentName: this.agentName,
      status: this.status,
      eventType,
      timestamp: new Date().toISOString(),
      data
    };

    if (this.socketio) {
      this.socketio.emit('agent-status', statusUpdate);
      this.socketio.emit('worker-update', {
        agentName: this.agentName,
        status: this.status,
        currentTask: this.currentTask,
        artifacts: this.artifacts.length
      });
    }
  }

  getStatus() {
    return {
      agentName: this.agentName,
      status: this.status,
      currentTask: this.currentTask,
      processHistory: this.processHistory.slice(-10), // Last 10 processes
      artifacts: this.artifacts,
      uptime: Date.now() - (this.startTime || Date.now())
    };
  }

  getArtifacts() {
    return this.artifacts;
  }

  async downloadArtifact(artifactId) {
    const artifact = this.artifacts.find(a => a.id === artifactId);
    if (!artifact) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    try {
      const content = await fs.readFile(artifact.fullPath, 'utf8');
      // Ensure checksum present
      if (!artifact.sha256) {
        const crypto = require('crypto');
        artifact.sha256 = crypto.createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex');
      }

      // Ensure absolutePath present
      if (!artifact.absolutePath) artifact.absolutePath = artifact.fullPath;

      return {
        ...artifact,
        content
      };
    } catch (error) {
      throw new Error(`Failed to read artifact: ${error.message}`);
    }
  }
}

module.exports = AgentExecutor;
