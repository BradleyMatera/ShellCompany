const crypto = require('crypto');
const { User, Project, Audit } = require('../models');
const agentEngine = require('./agent-engine');

class TaskQueue {
  constructor() {
    this.queues = new Map(); // Priority queues by project
    this.runningTasks = new Map();
    this.completedTasks = new Map();
    this.scheduledTasks = new Map();
    this.isProcessing = false;
    this.maxConcurrentTasks = parseInt(process.env.MAX_CONCURRENT_TASKS) || 5;
    this.taskTimeout = parseInt(process.env.TASK_TIMEOUT) || 300000; // 5 minutes
    this.retryAttempts = 3;

    // Task persistence (in production, use Redis or database)
    this.persistentStorage = new Map();

    // Start processing
    this.startProcessing();

    // Periodic cleanup
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  // Add task to queue
  async addTask(taskData) {
    const task = {
      id: crypto.randomUUID(),
      userId: taskData.userId,
      projectId: taskData.projectId,
      type: taskData.type || 'general',
      priority: taskData.priority || 'normal',
      prompt: taskData.prompt,
      tools: taskData.tools || ['filesystem', 'git', 'command'],
      constraints: taskData.constraints || {},
      metadata: taskData.metadata || {},
      retryCount: 0,
      status: 'queued',
      createdAt: new Date(),
      queuedAt: new Date(),
      estimatedDuration: taskData.estimatedDuration || 60000, // 1 minute default
      dependencies: taskData.dependencies || [], // Task IDs this task depends on
      tags: taskData.tags || [],
      parentTaskId: taskData.parentTaskId, // For subtasks
      callback: taskData.callback // Webhook URL for completion notification
    };

    // Validate task
    await this.validateTask(task);

    // Add to appropriate queue
    const queueKey = `${task.projectId}-${task.priority}`;
    if (!this.queues.has(queueKey)) {
      this.queues.set(queueKey, []);
    }

    this.queues.get(queueKey).push(task);
    this.sortQueue(queueKey);

    // Persist task
    this.persistentStorage.set(task.id, task);

    // Log task creation
    await Audit.create({
      actor_id: task.userId,
      action: 'CREATE_TASK',
      target: 'task',
      target_id: task.id,
      metadata: {
        project_id: task.projectId,
        type: task.type,
        priority: task.priority,
        tools: task.tools,
        estimated_duration: task.estimatedDuration
      },
      ip_address: '127.0.0.1'
    });

    console.log(`Task ${task.id} added to queue (${task.type}, priority: ${task.priority})`);
    return task;
  }

  // Schedule task for future execution
  async scheduleTask(taskData, executeAt) {
    const task = await this.addTask({ ...taskData, status: 'scheduled' });

    const delay = new Date(executeAt).getTime() - Date.now();
    if (delay > 0) {
      const timeoutId = setTimeout(async () => {
        task.status = 'queued';
        task.queuedAt = new Date();
        this.scheduledTasks.delete(task.id);
        await this.processQueue();
      }, delay);

      this.scheduledTasks.set(task.id, { task, timeoutId });
    } else {
      // Execute immediately if scheduled time has passed
      task.status = 'queued';
    }

    return task;
  }

  // Create recurring task
  async createRecurringTask(taskData, schedule) {
    const baseTask = await this.addTask({
      ...taskData,
      type: 'recurring',
      metadata: {
        ...taskData.metadata,
        schedule,
        isRecurring: true
      }
    });

    // Schedule next execution based on cron-like schedule
    this.scheduleNextRecurrence(baseTask, schedule);
    return baseTask;
  }

  scheduleNextRecurrence(task, schedule) {
    // Simple schedule parsing (in production, use a proper cron library)
    let nextExecution;

    if (schedule.type === 'interval') {
      nextExecution = new Date(Date.now() + schedule.milliseconds);
    } else if (schedule.type === 'daily') {
      nextExecution = new Date();
      nextExecution.setDate(nextExecution.getDate() + 1);
      nextExecution.setHours(schedule.hour || 0, schedule.minute || 0, 0, 0);
    } else if (schedule.type === 'weekly') {
      nextExecution = new Date();
      nextExecution.setDate(nextExecution.getDate() + 7);
    }

    if (nextExecution) {
      this.scheduleTask({
        ...task,
        id: undefined // Create new task
      }, nextExecution);
    }
  }

  // Validate task before queuing
  async validateTask(task) {
    // Check user exists and has permission
    const user = await User.findByPk(task.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check project exists and user has access
    const project = await Project.findOne({
      where: { id: task.projectId, user_id: task.userId }
    });
    if (!project) {
      throw new Error('Project not found or access denied');
    }

    // Validate tools
    const allowedTools = ['filesystem', 'git', 'command', 'http', 'database'];
    for (const tool of task.tools) {
      if (!allowedTools.includes(tool)) {
        throw new Error(`Tool '${tool}' is not allowed`);
      }
    }

    // Check task size limits
    if (task.prompt.length > 50000) {
      throw new Error('Task prompt too large (max 50,000 characters)');
    }

    return true;
  }

  // Sort queue by priority and creation time
  sortQueue(queueKey) {
    const queue = this.queues.get(queueKey);
    if (!queue) return;

    const priorityOrder = { high: 3, normal: 2, low: 1 };

    queue.sort((a, b) => {
      // First by priority
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by creation time (FIFO within same priority)
      return a.createdAt - b.createdAt;
    });
  }

  // Main processing loop
  async startProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    console.log('Task queue processing started');

    while (this.isProcessing) {
      try {
        await this.processQueue();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second
      } catch (error) {
        console.error('Task queue processing error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Back off on error
      }
    }
  }

  async processQueue() {
    // Don't exceed concurrent task limit
    if (this.runningTasks.size >= this.maxConcurrentTasks) return;

    // Find next available task
    const task = this.getNextTask();
    if (!task) return;

    // Check dependencies
    if (!this.areDependenciesMet(task)) {
      console.log(`Task ${task.id} waiting for dependencies`);
      return;
    }

    // Execute task
    await this.executeTask(task);
  }

  getNextTask() {
    // Iterate through all queues in priority order
    const priorityOrder = ['high', 'normal', 'low'];

    for (const [queueKey, queue] of this.queues.entries()) {
      const [projectId, priority] = queueKey.split('-');

      if (queue.length > 0) {
        const task = queue.shift();
        if (task.status === 'queued') {
          return task;
        }
      }
    }

    return null;
  }

  areDependenciesMet(task) {
    if (!task.dependencies || task.dependencies.length === 0) return true;

    return task.dependencies.every(depId => {
      const completedTask = this.completedTasks.get(depId);
      return completedTask && completedTask.status === 'completed';
    });
  }

  async executeTask(task) {
    try {
      console.log(`Executing task ${task.id} (${task.type})`);

      task.status = 'running';
      task.startedAt = new Date();
      this.runningTasks.set(task.id, task);

      // Set timeout
      const timeoutId = setTimeout(() => {
        this.timeoutTask(task.id);
      }, this.taskTimeout);

      // Execute using agent engine
      const result = await agentEngine.executeTask({
        id: task.id,
        userId: task.userId,
        projectId: task.projectId,
        prompt: task.prompt,
        tools: task.tools,
        constraints: task.constraints,
        priority: task.priority
      });

      clearTimeout(timeoutId);

      // Task completed successfully
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;
      task.duration = task.completedAt - task.startedAt;

      this.runningTasks.delete(task.id);
      this.completedTasks.set(task.id, task);

      // Send completion notification
      await this.notifyTaskCompletion(task);

      // Handle subtasks
      await this.processSubtasks(task, result);

      // Log completion
      await Audit.create({
        actor_id: task.userId,
        action: 'COMPLETE_TASK',
        target: 'task',
        target_id: task.id,
        metadata: {
          project_id: task.projectId,
          duration: task.duration,
          cost: result.cost || 0,
          tokens: result.tokens || 0
        },
        ip_address: '127.0.0.1'
      });

      console.log(`Task ${task.id} completed successfully in ${task.duration}ms`);

    } catch (error) {
      await this.handleTaskError(task, error);
    }
  }

  async handleTaskError(task, error) {
    console.error(`Task ${task.id} failed:`, error.message);

    task.status = 'failed';
    task.error = error.message;
    task.failedAt = new Date();

    this.runningTasks.delete(task.id);

    // Retry logic
    if (task.retryCount < this.retryAttempts && this.shouldRetry(error)) {
      task.retryCount++;
      task.status = 'queued';
      task.queuedAt = new Date();

      // Add back to queue with exponential backoff
      const delay = Math.pow(2, task.retryCount) * 1000; // 2s, 4s, 8s
      setTimeout(() => {
        const queueKey = `${task.projectId}-${task.priority}`;
        if (!this.queues.has(queueKey)) {
          this.queues.set(queueKey, []);
        }
        this.queues.get(queueKey).push(task);
      }, delay);

      console.log(`Task ${task.id} scheduled for retry ${task.retryCount}/${this.retryAttempts} in ${delay}ms`);
    } else {
      // Max retries exceeded or non-retryable error
      this.completedTasks.set(task.id, task);
      await this.notifyTaskFailure(task);

      await Audit.create({
        actor_id: task.userId,
        action: 'FAIL_TASK',
        target: 'task',
        target_id: task.id,
        metadata: {
          project_id: task.projectId,
          error: error.message,
          retry_count: task.retryCount
        },
        ip_address: '127.0.0.1'
      });
    }
  }

  shouldRetry(error) {
    const nonRetryableErrors = [
      'Authentication failed',
      'Access denied',
      'Invalid input',
      'Tool not allowed'
    ];

    return !nonRetryableErrors.some(pattern =>
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  async timeoutTask(taskId) {
    const task = this.runningTasks.get(taskId);
    if (!task) return;

    console.log(`Task ${taskId} timed out after ${this.taskTimeout}ms`);

    const error = new Error(`Task timed out after ${this.taskTimeout}ms`);
    await this.handleTaskError(task, error);
  }

  async processSubtasks(parentTask, result) {
    // Check if the result suggests subtasks to create
    if (result.subtasks && Array.isArray(result.subtasks)) {
      for (const subtaskData of result.subtasks) {
        await this.addTask({
          ...subtaskData,
          userId: parentTask.userId,
          projectId: parentTask.projectId,
          parentTaskId: parentTask.id,
          priority: subtaskData.priority || parentTask.priority
        });
      }
    }
  }

  async notifyTaskCompletion(task) {
    if (task.callback) {
      try {
        await fetch(task.callback, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task.id,
            status: 'completed',
            result: task.result,
            duration: task.duration
          })
        });
      } catch (error) {
        console.error(`Failed to notify task completion for ${task.id}:`, error);
      }
    }
  }

  async notifyTaskFailure(task) {
    if (task.callback) {
      try {
        await fetch(task.callback, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: task.id,
            status: 'failed',
            error: task.error,
            retryCount: task.retryCount
          })
        });
      } catch (error) {
        console.error(`Failed to notify task failure for ${task.id}:`, error);
      }
    }
  }

  // Task management operations
  async cancelTask(taskId, userId) {
    const task = this.persistentStorage.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    if (task.userId !== userId) {
      throw new Error('Access denied');
    }

    if (task.status === 'running') {
      // Stop the running task
      task.status = 'cancelled';
      this.runningTasks.delete(taskId);
    } else if (task.status === 'queued') {
      // Remove from queue
      task.status = 'cancelled';
      for (const [queueKey, queue] of this.queues.entries()) {
        const index = queue.findIndex(t => t.id === taskId);
        if (index !== -1) {
          queue.splice(index, 1);
          break;
        }
      }
    } else if (task.status === 'scheduled') {
      // Clear scheduled timeout
      const scheduled = this.scheduledTasks.get(taskId);
      if (scheduled) {
        clearTimeout(scheduled.timeoutId);
        this.scheduledTasks.delete(taskId);
      }
      task.status = 'cancelled';
    }

    task.cancelledAt = new Date();
    this.completedTasks.set(taskId, task);

    await Audit.create({
      actor_id: userId,
      action: 'CANCEL_TASK',
      target: 'task',
      target_id: taskId,
      metadata: { project_id: task.projectId },
      ip_address: '127.0.0.1'
    });

    return task;
  }

  async getTask(taskId, userId) {
    const task = this.persistentStorage.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    if (task.userId !== userId) {
      throw new Error('Access denied');
    }

    return task;
  }

  async getTasks(userId, filters = {}) {
    const tasks = Array.from(this.persistentStorage.values())
      .filter(task => task.userId === userId);

    let filteredTasks = tasks;

    if (filters.projectId) {
      filteredTasks = filteredTasks.filter(task => task.projectId === filters.projectId);
    }

    if (filters.status) {
      filteredTasks = filteredTasks.filter(task => task.status === filters.status);
    }

    if (filters.type) {
      filteredTasks = filteredTasks.filter(task => task.type === filters.type);
    }

    if (filters.priority) {
      filteredTasks = filteredTasks.filter(task => task.priority === filters.priority);
    }

    if (filters.tags) {
      filteredTasks = filteredTasks.filter(task =>
        filters.tags.some(tag => task.tags.includes(tag))
      );
    }

    // Sort by creation time (newest first)
    filteredTasks.sort((a, b) => b.createdAt - a.createdAt);

    // Pagination
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    return {
      tasks: filteredTasks.slice(offset, offset + limit),
      total: filteredTasks.length,
      offset,
      limit
    };
  }

  // Queue statistics
  getStatistics() {
    const stats = {
      queued: 0,
      running: this.runningTasks.size,
      completed: this.completedTasks.size,
      scheduled: this.scheduledTasks.size,
      failed: 0,
      byPriority: { high: 0, normal: 0, low: 0 },
      byProject: {},
      averageDuration: 0,
      totalCost: 0
    };

    // Count queued tasks
    for (const queue of this.queues.values()) {
      stats.queued += queue.length;
    }

    // Analyze completed tasks
    const completedTasks = Array.from(this.completedTasks.values());
    let totalDuration = 0;
    let totalCost = 0;

    for (const task of completedTasks) {
      if (task.status === 'failed') stats.failed++;

      stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;
      stats.byProject[task.projectId] = (stats.byProject[task.projectId] || 0) + 1;

      if (task.duration) totalDuration += task.duration;
      if (task.result && task.result.cost) totalCost += task.result.cost;
    }

    if (completedTasks.length > 0) {
      stats.averageDuration = Math.round(totalDuration / completedTasks.length);
    }

    stats.totalCost = Math.round(totalCost * 100) / 100; // Round to 2 decimal places

    return stats;
  }

  // Cleanup old completed tasks
  cleanup() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

    for (const [taskId, task] of this.completedTasks.entries()) {
      if (task.completedAt && task.completedAt.getTime() < cutoff) {
        this.completedTasks.delete(taskId);
        this.persistentStorage.delete(taskId);
      }
    }

    console.log(`Cleanup completed. Removed old completed tasks.`);
  }

  // Graceful shutdown
  async shutdown() {
    console.log('Shutting down task queue...');
    this.isProcessing = false;

    // Cancel all scheduled tasks
    for (const [taskId, scheduled] of this.scheduledTasks.entries()) {
      clearTimeout(scheduled.timeoutId);
    }

    // Wait for running tasks to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const start = Date.now();

    while (this.runningTasks.size > 0 && (Date.now() - start) < shutdownTimeout) {
      console.log(`Waiting for ${this.runningTasks.size} running tasks to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Force cancel remaining tasks
    for (const [taskId, task] of this.runningTasks.entries()) {
      task.status = 'cancelled';
      task.cancelledAt = new Date();
      this.completedTasks.set(taskId, task);
    }

    this.runningTasks.clear();
    console.log('Task queue shut down');
  }
}

module.exports = new TaskQueue();