const AgentExecutor = require('./agent-executor');
const ArtifactLineage = require('./artifact-lineage');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
// Import models properly
const { Workflow } = require('../models/index');

class WorkflowOrchestrator {
  constructor(workspaceRoot, socketio) {
    this.workspaceRoot = workspaceRoot;
    this.socketio = socketio;
    this.agents = new Map();
    this.workflows = new Map();
    this.taskQueue = [];
    this.completedWorkflows = [];
    
    // Initialize artifact lineage system
    this.artifactLineage = new ArtifactLineage();
    
    // Initialize autonomous agents with specialized capabilities
    this.initializeAgents();
    
    // Start workflow processor
    this.startWorkflowProcessor();
    
    console.log('✅ Workflow Orchestrator initialized with artifact lineage tracking');
  }

  initializeAgents() {
    const agentConfigs = [
      {
        name: 'Alex',
        role: 'Project Manager', 
        specializations: ['planning', 'coordination', 'task-breakdown', 'project-management'],
        workspaceDir: path.join(this.workspaceRoot, 'alex-workspace')
      },
      {
        name: 'Nova',
        role: 'Frontend Developer',
        specializations: ['react', 'typescript', 'html', 'css', 'frontend', 'ui-components'],
        workspaceDir: path.join(this.workspaceRoot, 'nova-workspace')
      },
      {
        name: 'Zephyr', 
        role: 'Backend Developer',
        specializations: ['nodejs', 'apis', 'databases', 'backend', 'server-infrastructure'],
        workspaceDir: path.join(this.workspaceRoot, 'zephyr-workspace')
      },
      {
        name: 'Pixel',
        role: 'Designer',
        specializations: ['ui-design', 'css', 'styling', 'branding', 'visual-design'],
        workspaceDir: path.join(this.workspaceRoot, 'pixel-workspace')
      },
      {
        name: 'Cipher',
        role: 'Security Engineer', 
        specializations: ['security', 'authentication', 'validation', 'compliance'],
        workspaceDir: path.join(this.workspaceRoot, 'cipher-workspace')
      },
      {
        name: 'Sage',
        role: 'DevOps Engineer',
        specializations: ['deployment', 'infrastructure', 'monitoring', 'ci-cd'],
        workspaceDir: path.join(this.workspaceRoot, 'sage-workspace')
      }
    ];

    for (const config of agentConfigs) {
      const executor = new AgentExecutor(config.name, config.workspaceDir, this.socketio);
      this.agents.set(config.name, {
        executor,
        config,
        queueDepth: 0,
        averageTaskTime: this.getHistoricalAverage(config.name),
        availability: 'available'
      });
    }

    console.log(`✅ Initialized ${this.agents.size} autonomous agents`);
  }

  async createWorkflow(userDirective, briefContext = null) {
    const workflowId = uuidv4();
    const startTime = Date.now();

    console.log(`[WORKFLOW:${workflowId}] Creating workflow for directive: "${userDirective}"`);
    
    if (briefContext) {
      console.log(`[WORKFLOW:${workflowId}] Using brief context: ${briefContext.projectType} - ${briefContext.scope} - ${briefContext.timeline}`);
    }

    // Enhanced task decomposition with brief context
    const tasks = await this.decomposeDirective(userDirective, briefContext);
    
    // Calculate realistic time estimates
    const estimates = this.calculateTimeEstimates(tasks);
    
    const workflow = {
      id: workflowId,
      directive: userDirective,
      status: 'planned',
      tasks,
      estimates,
      startTime,
      progress: {
        completed: 0,
        total: tasks.length,
        percentage: 0
      },
      artifacts: []
    };

    // Save to both memory and database
    this.workflows.set(workflowId, workflow);
    
    try {
      // Persist to database
      await Workflow.create({
        id: workflowId,
        directive: userDirective,
        status: 'planned',
        start_time: new Date(startTime),
        tasks: tasks,
        estimates: estimates,
        progress: workflow.progress,
        artifacts: []
      });
      
      console.log(`[WORKFLOW:${workflowId}] Persisted to database`);
    } catch (error) {
      console.error(`[WORKFLOW:${workflowId}] Failed to persist to database:`, error);
    }
    
    // Emit workflow creation to Board Room
    this.socketio.emit('workflow-created', {
      workflowId,
      directive: userDirective,
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        assignedAgent: t.assignedAgent,
        status: t.status,
        estimatedDuration: t.estimatedDuration
      })),
      estimates
    });

    // Add tasks to execution queue
    this.queueTasks(tasks, workflowId);

    return { workflowId, workflow };
  }

  async decomposeDirective(directive, briefContext = null) {
    const tasks = [];
    
    // Enhanced AI-driven task decomposition with brief context
    let projectType = 'general';
    let scope = 'basic';
    let timeline = 'standard';
    let keyFeatures = [];
    let targetUsers = 'general';
    let suggestedAgents = ['Alex', 'Nova'];
    
    if (briefContext) {
      projectType = briefContext.projectType || 'general';
      scope = briefContext.scope || 'basic';
      timeline = briefContext.timeline || 'standard';
      keyFeatures = briefContext.keyFeatures || [];
      targetUsers = briefContext.targetUsers || 'general';
      suggestedAgents = briefContext.suggestedAgents || ['Alex', 'Nova'];
      
      console.log(`[WORKFLOW] Brief context applied: ${projectType}, ${scope}, ${timeline}`);
      console.log(`[WORKFLOW] Key features: ${keyFeatures.join(', ')}`);
      console.log(`[WORKFLOW] Suggested agents: ${suggestedAgents.join(', ')}`);
    }
    
    // Intelligent task decomposition based on project type and brief context
    if (projectType === 'website' || directive.toLowerCase().includes('landing page') || directive.toLowerCase().includes('website')) {
      return this.createWebsiteWorkflow(directive, briefContext);
    } else if (projectType === 'dashboard' || directive.toLowerCase().includes('dashboard') || directive.toLowerCase().includes('monitoring')) {
      return this.createDashboardWorkflow(directive, briefContext);
    } else if (projectType === 'fullstack' || directive.toLowerCase().includes('app') || directive.toLowerCase().includes('application')) {
      return this.createFullstackWorkflow(directive, briefContext);
    } else if (directive.toLowerCase().includes('dashboard') || directive.toLowerCase().includes('monitoring')) {
      const task1 = {
        id: uuidv4(),
        title: 'Create project structure and setup',
        description: 'Initialize workspace, create directory structure, and setup package.json',
        assignedAgent: 'Alex',
        commands: [
          'mkdir -p dashboard-project/src/components dashboard-project/public',
          'cd dashboard-project && npm init -y',
          'cd dashboard-project && npm install react react-dom @types/react @types/react-dom typescript',
          'echo "# AI Agent Dashboard\\n\\nReal-time monitoring dashboard for autonomous AI agents." > dashboard-project/README.md'
        ],
        dependencies: [],
        status: 'pending',
        estimatedDuration: 45000 // 45 seconds
      };

      const task2 = {
        id: uuidv4(), 
        title: 'Design dashboard layout and components',
        description: 'Create responsive dashboard layout with metrics cards and charts',
        assignedAgent: 'Pixel',
        commands: [
          'cd dashboard-project && mkdir -p src/styles',
          'cat > dashboard-project/src/styles/dashboard.css << EOF\n.dashboard {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));\n  gap: 20px;\n  padding: 20px;\n}\n\n.metric-card {\n  background: white;\n  border-radius: 8px;\n  padding: 24px;\n  box-shadow: 0 2px 4px rgba(0,0,0,0.1);\n}\nEOF'
        ],
        dependencies: [task1.id],
        status: 'pending',
        estimatedDuration: 60000 // 60 seconds
      };

      const task3 = {
        id: uuidv4(),
        title: 'Implement React dashboard components',
        description: 'Build responsive dashboard with real-time metrics display',
        assignedAgent: 'Nova',
        commands: [
          'cd dashboard-project/src && cat > App.js << EOF\nimport React, { useState, useEffect } from "react";\nimport "./styles/dashboard.css";\n\nfunction App() {\n  const [metrics, setMetrics] = useState({\n    activeAgents: 0,\n    tasksCompleted: 0,\n    avgResponseTime: 0\n  });\n\n  useEffect(() => {\n    // Simulate real-time data updates\n    const interval = setInterval(() => {\n      setMetrics({\n        activeAgents: Math.floor(Math.random() * 6) + 1,\n        tasksCompleted: Math.floor(Math.random() * 100) + 50,\n        avgResponseTime: Math.floor(Math.random() * 500) + 100\n      });\n    }, 2000);\n    return () => clearInterval(interval);\n  }, []);\n\n  return (\n    <div className="dashboard">\n      <div className="metric-card">\n        <h3>Active Agents</h3>\n        <p className="metric-value">{metrics.activeAgents}</p>\n      </div>\n      <div className="metric-card">\n        <h3>Tasks Completed</h3>\n        <p className="metric-value">{metrics.tasksCompleted}</p>\n      </div>\n      <div className="metric-card">\n        <h3>Avg Response Time</h3>\n        <p className="metric-value">{metrics.avgResponseTime}ms</p>\n      </div>\n    </div>\n  );\n}\n\nexport default App;\nEOF'
        ],
        dependencies: [task2.id],
        status: 'pending',
        estimatedDuration: 120000 // 120 seconds
      };

      const task4 = {
        id: uuidv4(),
        title: 'Setup build and deployment',
        description: 'Configure build process and prepare for deployment',
        assignedAgent: 'Sage',
        commands: [
          'cd dashboard-project && npm run build',
          'cd dashboard-project && echo "Dashboard build completed successfully" > build-log.txt'
        ],
        dependencies: [task3.id],
        status: 'pending',
        estimatedDuration: 30000 // 30 seconds
      };

      tasks.push(task1, task2, task3, task4);

    } else if (directive.toLowerCase().includes('landing page') || directive.toLowerCase().includes('website')) {
      // Landing page workflow
      const task1 = {
        id: uuidv4(),
        title: 'Create landing page structure',
        description: 'Setup HTML structure and basic styling for landing page',
        assignedAgent: 'Nova',
        commands: [
          'mkdir -p landing-page/assets/css landing-page/assets/js',
          'cd landing-page && cat > index.html << EOF\n<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>AI Service Landing Page</title>\n    <link rel="stylesheet" href="assets/css/styles.css">\n</head>\n<body>\n    <header>\n        <h1>Advanced AI Service</h1>\n        <p>Transforming business with autonomous intelligence</p>\n    </header>\n    <main>\n        <section id="features">\n            <h2>Key Features</h2>\n            <div class="feature-grid">\n                <div class="feature">Real-time Processing</div>\n                <div class="feature">24/7 Availability</div>\n                <div class="feature">Scalable Infrastructure</div>\n            </div>\n        </section>\n        <section id="contact">\n            <h2>Contact Us</h2>\n            <form id="contact-form">\n                <input type="email" placeholder="Email" required>\n                <textarea placeholder="Message" required></textarea>\n                <button type="submit">Send Message</button>\n            </form>\n        </section>\n    </main>\n</body>\n</html>\nEOF'
        ],
        dependencies: [],
        status: 'pending',
        estimatedDuration: 60000
      };

      const task2 = {
        id: uuidv4(),
        title: 'Style landing page with modern design',
        description: 'Apply responsive CSS styling with modern design patterns',
        assignedAgent: 'Pixel',
        commands: [
          'cd landing-page/assets/css && cat > styles.css << EOF\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; }\nheader { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 80px 20px; text-align: center; }\nheader h1 { font-size: 3em; margin-bottom: 20px; }\nheader p { font-size: 1.2em; opacity: 0.9; }\n.feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; padding: 60px 20px; }\n.feature { background: white; padding: 30px; border-radius: 10px; text-align: center; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }\n#contact { background: #f8f9fa; padding: 60px 20px; }\n#contact-form { max-width: 500px; margin: 0 auto; }\n#contact-form input, #contact-form textarea { width: 100%; padding: 15px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }\n#contact-form button { background: #667eea; color: white; padding: 15px 30px; border: none; border-radius: 5px; cursor: pointer; }\nEOF'
        ],
        dependencies: [task1.id],
        status: 'pending',
        estimatedDuration: 45000
      };

      tasks.push(task1, task2);

    } else {
      // Generic workflow for other directives
      const task1 = {
        id: uuidv4(),
        title: 'Analyze and plan directive',
        description: `Create execution plan for: "${directive}"`,
        assignedAgent: 'Alex',
        commands: [
          'mkdir -p general-project',
          `echo "Project Plan\\n=============\\n\\nDirective: ${directive}\\n\\nThis project will be executed according to the specified requirements." > general-project/project-plan.md`,
          'echo "Directive analysis completed successfully"'
        ],
        dependencies: [],
        status: 'pending',
        estimatedDuration: 30000
      };

      const task2 = {
        id: uuidv4(),
        title: 'Execute directive requirements',
        description: 'Implement the core functionality as specified',
        assignedAgent: 'Nova',
        commands: [
          'cd ../alex-workspace/general-project && echo "Implementation started" > execution.log',
          'cd ../alex-workspace/general-project && sleep 5', // Simulate work  
          'cd ../alex-workspace/general-project && echo "Core functionality implemented" >> execution.log'
        ],
        dependencies: [task1.id], // Now this will have the correct ID
        status: 'pending',
        estimatedDuration: 60000
      };

      tasks.push(task1, task2);
    }

    return tasks;
  }

  // Specialized workflow creation methods for different project types
  createWebsiteWorkflow(directive, briefContext) {
    const tasks = [];
    const scope = briefContext?.scope || 'Basic prototype/MVP';
    const keyFeatures = briefContext?.keyFeatures || [];
    const targetUsers = briefContext?.targetUsers || 'General public';
    
    console.log(`[WORKFLOW] Creating website workflow - Scope: ${scope}, Features: ${keyFeatures.join(', ')}`);

    // Planning task
    const planningTask = {
      id: uuidv4(),
      title: 'Project planning and architecture',
      description: `Plan website for ${targetUsers} with scope: ${scope}`,
      assignedAgent: 'Alex',
      commands: [
        'mkdir -p kitten-rescue-website',
        `echo "# Kitten Rescue Website\\n\\nTarget Users: ${targetUsers}\\nScope: ${scope}\\nFeatures: ${keyFeatures.join(', ')}" > kitten-rescue-website/project-brief.md`
      ],
      dependencies: [],
      status: 'pending',
      estimatedDuration: scope.includes('Production') ? 60000 : 30000
    };

    // Design task  
    const designTask = {
      id: uuidv4(),
      title: 'Visual design and user experience',
      description: 'Create responsive design optimized for pet adoption',
      assignedAgent: 'Pixel',
      commands: [
        'cd kitten-rescue-website && mkdir -p assets/css assets/images',
        `echo "/* Kitten Rescue Styling - ${targetUsers} focused design */" > kitten-rescue-website/assets/css/styles.css`
      ],
      dependencies: [planningTask.id],
      status: 'pending',
      estimatedDuration: scope.includes('Full-featured') ? 90000 : 45000
    };

    // Frontend development
    const frontendTask = {
      id: uuidv4(),
      title: 'Frontend implementation',
      description: 'Build responsive HTML/CSS/JS website',
      assignedAgent: 'Nova',
      commands: [
        'cd kitten-rescue-website && cat > index.html << EOF\\n<!DOCTYPE html>\\n<html lang="en">\\n<head><meta charset="UTF-8"><title>Kitten Rescue</title></head>\\n<body><h1>Find Your Furry Friend</h1></body>\\n</html>\\nEOF'
      ],
      dependencies: [designTask.id],
      status: 'pending',
      estimatedDuration: scope.includes('Production') ? 120000 : 80000
    };

    tasks.push(planningTask, designTask, frontendTask);

    // Add conditional tasks based on features
    if (keyFeatures.includes('Donation system')) {
      const donationTask = {
        id: uuidv4(),
        title: 'Implement donation system',
        description: 'Add secure donation functionality',
        assignedAgent: 'Zephyr',
        dependencies: [frontendTask.id],
        status: 'pending',
        estimatedDuration: 90000
      };
      tasks.push(donationTask);
    }

    return tasks;
  }

  createDashboardWorkflow(directive, briefContext) {
    const tasks = [];
    const scope = briefContext?.scope || 'Basic prototype/MVP';
    
    console.log(`[WORKFLOW] Creating dashboard workflow - Scope: ${scope}`);

    // Planning
    const planningTask = {
      id: uuidv4(),
      title: 'Dashboard architecture planning',
      description: 'Design real-time dashboard architecture',
      assignedAgent: 'Alex',
      commands: [
        'mkdir -p dashboard-project/src/components dashboard-project/public',
        'cd dashboard-project && npm init -y'
      ],
      dependencies: [],
      status: 'pending',
      estimatedDuration: 45000
    };

    // Backend API
    const backendTask = {
      id: uuidv4(),
      title: 'Build dashboard API',
      description: 'Create metrics API and real-time data endpoints',
      assignedAgent: 'Zephyr',
      commands: [
        'cd dashboard-project && mkdir -p api',
        'cd dashboard-project/api && echo "const express = require(\'express\');" > server.js'
      ],
      dependencies: [planningTask.id],
      status: 'pending',
      estimatedDuration: scope.includes('Production') ? 150000 : 90000
    };

    // Frontend dashboard
    const frontendTask = {
      id: uuidv4(),
      title: 'Build React dashboard',
      description: 'Implement interactive dashboard with real-time updates',
      assignedAgent: 'Nova',
      dependencies: [backendTask.id],
      status: 'pending',
      estimatedDuration: scope.includes('Full-featured') ? 180000 : 120000
    };

    tasks.push(planningTask, backendTask, frontendTask);
    return tasks;
  }

  createFullstackWorkflow(directive, briefContext) {
    const tasks = [];
    const scope = briefContext?.scope || 'Basic prototype/MVP';
    const keyFeatures = briefContext?.keyFeatures || [];
    
    console.log(`[WORKFLOW] Creating fullstack workflow - Scope: ${scope}`);

    // All agents needed for fullstack
    const planningTask = {
      id: uuidv4(),
      title: 'Fullstack architecture planning',
      assignedAgent: 'Alex',
      dependencies: [],
      status: 'pending',
      estimatedDuration: 60000
    };

    const designTask = {
      id: uuidv4(),
      title: 'UI/UX design system',
      assignedAgent: 'Pixel',
      dependencies: [planningTask.id],
      status: 'pending',
      estimatedDuration: 90000
    };

    const backendTask = {
      id: uuidv4(),
      title: 'Backend API development',
      assignedAgent: 'Zephyr',
      dependencies: [planningTask.id],
      status: 'pending',
      estimatedDuration: 180000
    };

    const frontendTask = {
      id: uuidv4(),
      title: 'Frontend application',
      assignedAgent: 'Nova',
      dependencies: [designTask.id, backendTask.id],
      status: 'pending',
      estimatedDuration: 150000
    };

    const securityTask = {
      id: uuidv4(),
      title: 'Security implementation',
      assignedAgent: 'Cipher',
      dependencies: [backendTask.id],
      status: 'pending',
      estimatedDuration: 75000
    };

    const deploymentTask = {
      id: uuidv4(),
      title: 'Production deployment',
      assignedAgent: 'Sage',
      dependencies: [frontendTask.id, securityTask.id],
      status: 'pending',
      estimatedDuration: 90000
    };

    tasks.push(planningTask, designTask, backendTask, frontendTask, securityTask, deploymentTask);
    return tasks;
  }

  calculateTimeEstimates(tasks) {
    let totalEstimate = 0;
    let availableAgents = 0;
    const agentTasks = new Map();

    // Calculate per-agent workload
    for (const task of tasks) {
      const agent = this.agents.get(task.assignedAgent);
      if (agent && agent.availability === 'available') {
        if (!agentTasks.has(task.assignedAgent)) {
          agentTasks.set(task.assignedAgent, []);
          availableAgents++;
        }
        agentTasks.get(task.assignedAgent).push(task);
      }
    }

    // Calculate sequential vs parallel execution
    let maxAgentTime = 0;
    const agentEstimates = [];

    for (const [agentName, agentTaskList] of agentTasks) {
      const agent = this.agents.get(agentName);
      let agentTime = agent.queueDepth * agent.averageTaskTime; // Current queue
      
      for (const task of agentTaskList) {
        agentTime += task.estimatedDuration;
      }
      
      agentEstimates.push({
        agent: agentName,
        taskCount: agentTaskList.length,
        estimatedTime: agentTime,
        availability: agent.availability
      });

      maxAgentTime = Math.max(maxAgentTime, agentTime);
    }

    // Calculate total sequential estimate
    for (const task of tasks) {
      totalEstimate += task.estimatedDuration;
    }

    return {
      totalSequential: totalEstimate,
      estimatedParallel: maxAgentTime,
      availableAgents,
      agentBreakdown: agentEstimates,
      explanation: `Estimated ${Math.round(maxAgentTime / 1000 / 60)} minutes because ${availableAgents} agents are available and tasks can run in parallel. Longest chain: ${Math.round(maxAgentTime / 1000)}s.`
    };
  }

  queueTasks(tasks, workflowId) {
    for (const task of tasks) {
      task.workflowId = workflowId;
      this.taskQueue.push(task);
      
      const agent = this.agents.get(task.assignedAgent);
      if (agent) {
        agent.queueDepth++;
      }
    }

    console.log(`[WORKFLOW:${workflowId}] Queued ${tasks.length} tasks for execution`);
  }

  startWorkflowProcessor() {
    setInterval(async () => {
      await this.processNextTask();
    }, 1000); // Check every second

    console.log('✅ Workflow processor started');
  }

  async processNextTask() {
    if (this.taskQueue.length === 0) return;

    // Find next ready task (dependencies satisfied, agent available)
    const readyTaskIndex = this.taskQueue.findIndex(task => {
      const agent = this.agents.get(task.assignedAgent);
      if (!agent || agent.executor.status !== 'idle') return false;

      // Check dependencies
      if (task.dependencies && task.dependencies.length > 0) {
        const workflow = this.workflows.get(task.workflowId);
        const completedTaskIds = workflow.tasks
          .filter(t => t.status === 'completed')
          .map(t => t.id);

        return task.dependencies.every(depId => completedTaskIds.includes(depId));
      }

      return true;
    });

    if (readyTaskIndex === -1) return;

    // Execute the ready task
    const task = this.taskQueue.splice(readyTaskIndex, 1)[0];
    const agent = this.agents.get(task.assignedAgent);
    
    if (agent) {
      agent.queueDepth = Math.max(0, agent.queueDepth - 1);
      await this.executeTask(task, agent);
    }
  }

  async executeTask(task, agent) {
    const workflow = this.workflows.get(task.workflowId);
    
    // Update task status in workflow
    const workflowTask = workflow.tasks.find(t => t.id === task.id);
    if (workflowTask) {
      workflowTask.status = 'running';
      workflowTask.startTime = Date.now();
    }

    // Update workflow progress
    this.updateWorkflowProgress(task.workflowId);

    try {
      const results = await agent.executor.executeTask(
        task.id,
        task.description,
        task.commands
      );

      // Update task with results
      if (workflowTask) {
        workflowTask.status = results.status === 'completed' ? 'completed' : 'failed';
        workflowTask.endTime = Date.now();
        workflowTask.actualDuration = workflowTask.endTime - workflowTask.startTime;
        workflowTask.results = results;
      }

      // Collect and track artifacts with full lineage
      const artifacts = agent.executor.getArtifacts();
      await this.trackTaskArtifacts(task, artifacts, workflow);

      // Update workflow progress
      this.updateWorkflowProgress(task.workflowId);

      console.log(`[WORKFLOW:${task.workflowId}] Task ${task.title} ${results.status} by ${agent.config.name}`);

    } catch (error) {
      console.error(`[WORKFLOW:${task.workflowId}] Task ${task.title} failed:`, error);
      
      if (workflowTask) {
        workflowTask.status = 'failed';
        workflowTask.error = error.message;
      }

      this.updateWorkflowProgress(task.workflowId);
    }
  }

  async updateWorkflowProgress(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    const completed = workflow.tasks.filter(t => t.status === 'completed').length;
    const failed = workflow.tasks.filter(t => t.status === 'failed').length;
    const total = workflow.tasks.length;

    workflow.progress = {
      completed,
      failed,
      total,
      percentage: Math.round((completed / total) * 100)
    };

    // Check if workflow is complete
    if (completed + failed === total) {
      workflow.status = failed > 0 ? 'failed' : 'completed';
      workflow.endTime = Date.now();
      workflow.totalDuration = workflow.endTime - workflow.startTime;

      this.completedWorkflows.push(workflow);
      console.log(`[WORKFLOW:${workflowId}] Workflow ${workflow.status} in ${Math.round(workflow.totalDuration / 1000)}s`);
    }

    // Update database
    try {
      await Workflow.update({
        status: workflow.status,
        end_time: workflow.endTime ? new Date(workflow.endTime) : null,
        total_duration: workflow.totalDuration,
        tasks: workflow.tasks,
        progress: workflow.progress,
        artifacts: workflow.artifacts
      }, {
        where: { id: workflowId }
      });
      
      console.log(`[WORKFLOW:${workflowId}] Database updated - Progress: ${workflow.progress.percentage}%`);
    } catch (error) {
      console.error(`[WORKFLOW:${workflowId}] Failed to update database:`, error);
    }

    // Emit progress update
    this.socketio.emit('workflow-progress', {
      workflowId,
      progress: workflow.progress,
      status: workflow.status,
      tasks: workflow.tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        assignedAgent: t.assignedAgent,
        actualDuration: t.actualDuration
      })),
      artifacts: workflow.artifacts.length
    });
  }

  getHistoricalAverage(agentName) {
    // TODO: Load from database - for now return reasonable defaults
    const averages = {
      'Alex': 35000,    // 35 seconds for planning tasks
      'Nova': 90000,    // 90 seconds for frontend tasks  
      'Zephyr': 120000, // 120 seconds for backend tasks
      'Pixel': 60000,   // 60 seconds for design tasks
      'Cipher': 45000,  // 45 seconds for security tasks
      'Sage': 75000     // 75 seconds for deployment tasks
    };

    return averages[agentName] || 60000;
  }

  getAgentStatus() {
    const status = [];
    for (const [name, agent] of this.agents) {
      status.push({
        name,
        role: agent.config.role,
        status: agent.executor.status,
        queueDepth: agent.queueDepth,
        currentTask: agent.executor.currentTask,
        artifacts: agent.executor.artifacts.length,
        specializations: agent.config.specializations
      });
    }
    return status;
  }

  getWorkflowStatus(workflowId) {
    return this.workflows.get(workflowId);
  }

  async getAllWorkflows() {
    try {
      // Load from database
      const dbWorkflows = await Workflow.findAll({
        order: [['start_time', 'DESC']]
      });

      // Convert database records to workflow objects
      const workflows = dbWorkflows.map(dbWorkflow => ({
        id: dbWorkflow.id,
        directive: dbWorkflow.directive,
        status: dbWorkflow.status,
        startTime: dbWorkflow.start_time.getTime(),
        endTime: dbWorkflow.end_time ? dbWorkflow.end_time.getTime() : null,
        totalDuration: dbWorkflow.total_duration,
        tasks: dbWorkflow.tasks || [],
        estimates: dbWorkflow.estimates || {},
        progress: dbWorkflow.progress || { completed: 0, total: 0, percentage: 0 },
        artifacts: dbWorkflow.artifacts || []
      }));

      console.log(`[WORKFLOWS] Loaded ${workflows.length} workflows from database`);
      return workflows;
    } catch (error) {
      console.error('Failed to load workflows from database:', error);
      return Array.from(this.workflows.values());
    }
  }

  async downloadArtifact(agentName, artifactId) {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }

    return await agent.executor.downloadArtifact(artifactId);
  }

  // =====================================================
  // ARTIFACT LINEAGE TRACKING METHODS (PHASE 3)
  // =====================================================

  /**
   * Track artifacts created by task execution with full lineage
   */
  async trackTaskArtifacts(task, artifacts, workflow) {
    try {
      for (const artifact of artifacts) {
        const lineageData = {
          name: artifact.name,
          workflowId: workflow.id,
          taskId: task.id,
          agentName: task.assignedAgent,
          directive: workflow.directive,
          taskTitle: task.title,
          creationReason: `Task execution: ${task.description}`,
          fileSize: artifact.size || 0,
          fileType: artifact.type || this.getFileType(artifact.name),
          encoding: artifact.encoding || 'utf8',
          checksum: artifact.checksum,
          relativePath: artifact.relativePath,
          absolutePath: artifact.absolutePath,
          content: artifact.content || '',
          parentArtifacts: artifact.parentArtifacts || []
        };

        const trackedArtifact = await this.artifactLineage.recordArtifact(lineageData);
        
        // Add to workflow artifacts with lineage info
        workflow.artifacts.push({
          id: trackedArtifact.id,
          name: artifact.name,
          path: artifact.relativePath,
          agentName: task.assignedAgent,
          taskId: task.id,
          createdAt: trackedArtifact.createdAt,
          lineage: trackedArtifact.lineage
        });

        console.log(`[LINEAGE] Tracked artifact: ${artifact.name} from ${task.assignedAgent} in workflow ${workflow.id}`);
      }
    } catch (error) {
      console.error('[LINEAGE] Failed to track artifacts:', error);
    }
  }

  /**
   * Update artifact when modified through agent environment
   */
  async updateArtifactLineage(agentName, fileName, newContent, modificationContext) {
    try {
      // Find artifact by agent and filename
      const agentArtifacts = this.artifactLineage.getAgentArtifacts(agentName);
      const artifact = agentArtifacts.find(a => a.name === fileName);
      
      if (artifact) {
        await this.artifactLineage.updateArtifact(artifact.id, { content: newContent }, {
          action: 'manual_edit',
          agentName: 'user',
          details: `File edited via ${agentName} agent environment`,
          ...modificationContext
        });
        
        // Emit update to connected clients
        this.socketio.emit('artifact-updated', {
          artifactId: artifact.id,
          agentName,
          fileName,
          timestamp: new Date().toISOString(),
          action: 'edited'
        });

        console.log(`[LINEAGE] Updated artifact ${fileName} by user via ${agentName} environment`);
        return artifact.id;
      }
    } catch (error) {
      console.error('[LINEAGE] Failed to update artifact lineage:', error);
    }
    return null;
  }

  /**
   * Get artifact lineage for console/UI display
   */
  getArtifactLineage(artifactId) {
    return this.artifactLineage.getArtifactWithLineage(artifactId);
  }

  /**
   * Search artifacts across all workflows
   */
  searchArtifacts(criteria) {
    return this.artifactLineage.searchArtifacts(criteria);
  }

  /**
   * Get artifacts for a specific workflow with lineage
   */
  getWorkflowArtifactsWithLineage(workflowId) {
    const artifacts = this.artifactLineage.getWorkflowArtifacts(workflowId);
    return artifacts.map(artifact => this.artifactLineage.getArtifactWithLineage(artifact.id));
  }

  /**
   * Get artifacts for a specific agent with lineage
   */
  getAgentArtifactsWithLineage(agentName) {
    const artifacts = this.artifactLineage.getAgentArtifacts(agentName);
    return artifacts.map(artifact => this.artifactLineage.getArtifactWithLineage(artifact.id));
  }

  /**
   * Generate clickable lineage links for console display
   */
  generateArtifactLinks(artifactId) {
    return this.artifactLineage.generateLineageLinks(artifactId);
  }

  /**
   * Get comprehensive lineage report for debugging
   */
  getLineageReport() {
    return this.artifactLineage.getLineageReport();
  }

  /**
   * Determine file type from extension
   */
  getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const typeMap = {
      'js': 'javascript',
      'jsx': 'javascript', 
      'ts': 'typescript',
      'tsx': 'typescript',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown',
      'txt': 'text',
      'py': 'python',
      'yml': 'yaml',
      'yaml': 'yaml'
    };
    return typeMap[ext] || 'unknown';
  }
}

module.exports = WorkflowOrchestrator;
