import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './BoardRoom.css';

const BoardRoom = ({ state, setState }) => {
  const [inputValue, setInputValue] = useState('');
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef(null);

  // New state for real workflow tracking
  const [currentWorkflow, setCurrentWorkflow] = useState(null);
  const [workflowTasks, setWorkflowTasks] = useState([]);

  const messages = state.messages;
  const projectBrief = state.projectBrief;
  const decisions = state.decisions;
  const risks = state.risks;
  const milestones = state.milestones;

  const agents = [
    {
      name: 'Alex',
      role: 'Project Manager',
      avatar: '👨‍💼',
      status: 'available',
      specialty: ['planning', 'coordination', 'risk-management']
    },
    {
      name: 'Ivy',
      role: 'Tech Writer',
      avatar: '✍️',
      status: 'available',
      specialty: ['documentation', 'content', 'communication']
    },
    {
      name: 'Pixel',
      role: 'Designer',
      avatar: '🎨',
      status: 'available',
      specialty: ['ui-design', 'branding', 'user-experience']
    },
    {
      name: 'Nova',
      role: 'Frontend Developer',
      avatar: '⚛️',
      status: 'busy',
      specialty: ['react', 'typescript', 'frontend']
    },
    {
      name: 'Zephyr',
      role: 'Backend Developer',
      avatar: '🔧',
      status: 'available',
      specialty: ['apis', 'databases', 'backend']
    },
    {
      name: 'Cipher',
      role: 'Security Engineer',
      avatar: '🔒',
      status: 'available',
      specialty: ['security', 'authentication', 'compliance']
    },
    {
      name: 'Sage',
      role: 'DevOps Engineer',
      avatar: '🚀',
      status: 'available',
      specialty: ['deployment', 'infrastructure', 'monitoring']
    }
  ];

  useEffect(() => {
    // Connect to the autonomous workflow system
    const newSocket = io('http://localhost:3001', {
      withCredentials: true,
      transports: ['polling', 'websocket'], // Fallback to polling first
      upgrade: true,
      rememberUpgrade: true
    });

    newSocket.on('connect', () => {
      console.log('Connected to autonomous workflow system');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from autonomous workflow system');
      setIsConnected(false);
    });

    // Listen for REAL workflow creation from backend
    newSocket.on('workflow-created', (workflow) => {
      console.log('Real workflow created:', workflow);
      setCurrentWorkflow(workflow);
      setWorkflowTasks(workflow.tasks || []);

      // Update project brief with real data
      setState(prev => ({
        ...prev,
        projectBrief: {
          scope: `Execute: "${workflow.directive}"`,
          constraints: [`Budget: ${workflow.estimates?.explanation || 'Calculating...'}`],
          successCriteria: ['Real autonomous execution', 'Live agent collaboration', 'Verifiable artifacts'],
          deadline: 'Real-time execution',
          budget: { 
            tokens: 200000, 
            deployMinutes: 120,
            workflowId: workflow.workflowId,
            tasksCount: workflow.tasks?.length || 0,
            availableAgents: workflow.estimates?.availableAgents || 0
          }
        }
      }));
    });

    // Listen for REAL workflow progress updates
    newSocket.on('workflow-progress', (progress) => {
      console.log('Real workflow progress:', progress);
      setWorkflowTasks(progress.tasks || []);
      
      // Update progress in project brief
      setState(prev => ({
        ...prev,
        projectBrief: prev.projectBrief ? {
          ...prev.projectBrief,
          progress: progress.progress,
          artifactsCount: progress.artifacts || 0
        } : null
      }));
    });

    // Listen for board room messages from the autonomous system (keep for legacy support)
    newSocket.on('boardroom-message', (message) => {
      console.log('Received board room message:', message);
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, message]
      }));
    });

    // Listen for system status updates
    newSocket.on('system-status', (status) => {
      console.log('System status:', status);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      sender: 'CEO',
      senderRole: 'Chief Executive Officer',
      content: inputValue,
      timestamp: Date.now()
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage]
    }));

    console.log('🚀 Sending workflow request:', inputValue);

    // Send to autonomous workflow system via API
    try {
      console.log('📡 Making fetch request to http://localhost:3001/api/autonomous/workflow');
      const response = await fetch('http://localhost:3001/api/autonomous/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          directive: inputValue
        })
      });

      console.log('📥 Response received:', response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Workflow initiated successfully:', result);

      if (result.success) {
        // Add success message
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, {
            id: Date.now().toString() + '_success',
            sender: 'System',
            senderRole: 'Workflow Manager',
            content: `✅ **Workflow Created:** ${result.workflowId}\n\n${result.message}\n\n**Tasks:** ${result.tasks} | **Agents:** ${result.agents}\n**ETA:** ${result.estimatedCompletion}`,
            timestamp: Date.now()
          }]
        }));
      } else {
        // Add error message
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, {
            id: Date.now().toString() + '_error',
            sender: 'System',
            senderRole: 'Workflow Manager',
            content: `❌ **Error:** ${result.error || 'Failed to initiate workflow'}`,
            timestamp: Date.now()
          }]
        }));
      }

    } catch (error) {
      console.error('❌ Failed to send workflow request:', error);
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, {
          id: Date.now().toString() + '_error',
          sender: 'System',
          senderRole: 'Workflow Manager',
          content: `❌ **Connection Error:** ${error.message}\n\nUnable to reach autonomous workflow system. Please ensure the server is running on port 3001.`,
          timestamp: Date.now()
        }]
      }));
    }

    setInputValue('');
  };

  const handleApprove = () => {
    const approvalMessage = {
      id: Date.now().toString(),
      sender: 'CEO',
      senderRole: 'Chief Executive Officer',
      content: '✅ **APPROVED** - Proceed with execution. Great work team!',
      timestamp: Date.now()
    };
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, approvalMessage]
    }));

    // Notify the workflow system of approval
    if (socket) {
      socket.emit('workflow-approval', { approved: true });
    }
  };

  const handleRequestChanges = () => {
    const changesMessage = {
      id: Date.now().toString(),
      sender: 'CEO',
      senderRole: 'Chief Executive Officer',
      content: '🔄 **CHANGES REQUESTED** - Please revise approach before proceeding.',
      timestamp: Date.now()
    };
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, changesMessage]
    }));

    // Notify the workflow system of requested changes
    if (socket) {
      socket.emit('workflow-approval', { approved: false, requestChanges: true });
    }
  };

  const renderArtifact = (artifact) => {
    const iconMap = {
      link: '🔗',
      file: '📄',
      image: '🖼️',
      report: '📊'
    };

    return (
      <div key={artifact.id} className="artifact">
        <span className="artifact-icon">{iconMap[artifact.type]}</span>
        <div className="artifact-content">
          <div className="artifact-title">{artifact.title}</div>
          {artifact.preview && (
            <div className="artifact-preview">{artifact.preview}</div>
          )}
          {artifact.url && (
            <a href={artifact.url} target="_blank" rel="noopener noreferrer" className="artifact-link">
              Open {artifact.type}
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="boardroom">
      <div className="boardroom-header">
        <h2>Board Room</h2>
        <div className="connection-status">
          {isConnected ? (
            <span className="status-connected">🟢 Connected to Autonomous System</span>
          ) : (
            <span className="status-disconnected">🔴 Disconnected</span>
          )}
        </div>
      </div>

      <div className="boardroom-main">
        <div className="conversation-area">
          {projectBrief && (
            <div className="project-brief">
              <h4>Project Brief</h4>
              <div className="brief-content">
                <p><strong>Scope:</strong> {projectBrief.scope}</p>
                <p><strong>Deadline:</strong> {projectBrief.deadline}</p>
                <div className="brief-tags">
                  {projectBrief.constraints.map((constraint, idx) => (
                    <span key={idx} className="brief-tag">{constraint}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ENHANCED REAL WORKFLOW DETAILS DISPLAY */}
          {currentWorkflow && (
            <div className="workflow-panel">
              <div className="workflow-header">
                <div className="workflow-title">
                  <h4>🔄 Live Autonomous Execution</h4>
                  <div className="workflow-status">
                    {projectBrief?.progress?.percentage === 100 ? '✅ Complete' : 
                     projectBrief?.progress?.percentage > 0 ? '🔄 Running' : '⏳ Initializing'}
                  </div>
                </div>
                <div className="workflow-meta">
                  <div className="workflow-id-section">
                    <label>Workflow ID:</label>
                    <div className="workflow-id-container">
                      <code className="workflow-id-display" title="Click to copy">
                        {currentWorkflow.workflowId}
                      </code>
                      <button 
                        className="copy-workflow-id"
                        onClick={(event) => {
                          navigator.clipboard?.writeText(currentWorkflow.workflowId);
                          // Show temporary feedback
                          const btn = event.target;
                          btn.textContent = '✓';
                          setTimeout(() => btn.textContent = '📋', 1000);
                        }}
                        title="Copy Workflow ID"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                  <div className="workflow-estimate">
                    <span>ETA: {currentWorkflow.estimates?.explanation || 'Calculating...'}</span>
                  </div>
                </div>
              </div>

              {workflowTasks.length > 0 && (
                <div className="execution-pipeline">
                  <div className="pipeline-header">
                    <h5>Execution Pipeline</h5>
                    <div className="pipeline-stats">
                      <span className="stat-item">
                        <span className="stat-value">{workflowTasks.length}</span>
                        <span className="stat-label">Tasks</span>
                      </span>
                      <span className="stat-item">
                        <span className="stat-value">{currentWorkflow.estimates?.availableAgents || 6}</span>
                        <span className="stat-label">Agents</span>
                      </span>
                      {projectBrief?.artifactsCount > 0 && (
                        <span className="stat-item">
                          <span className="stat-value">{projectBrief.artifactsCount}</span>
                          <span className="stat-label">Artifacts</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pipeline-visualization">
                    {workflowTasks.map((task, idx) => {
                      const isActive = task.status === 'running';
                      const isCompleted = task.status === 'completed';
                      const isFailed = task.status === 'failed';
                      const isNext = !isCompleted && !isFailed && !isActive && 
                        idx === workflowTasks.findIndex(t => !['completed', 'failed'].includes(t.status));

                      return (
                        <div key={task.id || idx} className={`pipeline-task ${task.status || 'pending'} ${isNext ? 'next' : ''}`}>
                          <div className="task-indicator">
                            <div className="task-step">{idx + 1}</div>
                            {isActive && <div className="active-pulse"></div>}
                          </div>
                          
                          <div className="task-details">
                            <div className="task-header-row">
                              <h6 className="task-name">{task.title}</h6>
                              <div className="task-status-badge">
                                {isCompleted ? '✅ Done' : 
                                 isActive ? '🔄 Running' : 
                                 isFailed ? '❌ Failed' : 
                                 isNext ? '⚡ Next' : '⏳ Queued'}
                              </div>
                            </div>
                            
                            <div className="task-assignment-row">
                              <div className="assigned-agent">
                                <div className="agent-avatar">
                                  {agents.find(a => a.name === task.assignedAgent)?.avatar || '🤖'}
                                </div>
                                <span className="agent-info">
                                  <span className="agent-name">{task.assignedAgent}</span>
                                  <span className="agent-role">
                                    {agents.find(a => a.name === task.assignedAgent)?.role || 'Agent'}
                                  </span>
                                </span>
                              </div>
                              
                              {task.actualDuration && (
                                <div className="task-duration">
                                  <span className="duration-value">
                                    {Math.round(task.actualDuration / 1000)}s
                                  </span>
                                </div>
                              )}
                              
                              {task.estimatedDuration && !task.actualDuration && (
                                <div className="task-estimate">
                                  <span className="estimate-value">
                                    ~{Math.round(task.estimatedDuration / 1000)}s
                                  </span>
                                </div>
                              )}
                            </div>
                            
                            {idx < workflowTasks.length - 1 && (
                              <div className={`task-connector ${isCompleted ? 'completed' : ''}`}></div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {projectBrief?.progress && (
                    <div className="execution-progress">
                      <div className="progress-header">
                        <span className="progress-title">Overall Progress</span>
                        <span className="progress-percentage">{projectBrief.progress.percentage}%</span>
                      </div>
                      <div className="progress-track">
                        <div 
                          className="progress-indicator" 
                          style={{ width: `${projectBrief.progress.percentage}%` }}
                        ></div>
                      </div>
                      <div className="progress-details">
                        <span>{projectBrief.progress.completed} of {projectBrief.progress.total} tasks completed</span>
                        {projectBrief.progress.failed > 0 && (
                          <span className="failed-tasks">, {projectBrief.progress.failed} failed</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="messages">
            {messages.map(message => (
              <div key={message.id} className={`message ${message.sender.toLowerCase()}`}>
                <div className="message-header">
                  <span className="message-sender">{message.sender}</span>
                  <span className="message-role">{message.senderRole}</span>
                  <span className="message-time">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="message-content">
                  {message.content}
                </div>
                {message.artifacts && message.artifacts.length > 0 && (
                  <div className="message-artifacts">
                    {message.artifacts.map(renderArtifact)}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type your request to the company..."
              className="message-input"
              disabled={false}
            />
            <button
              onClick={handleSendMessage}
              className="send-button"
              disabled={false}
            >
              Send
            </button>
          </div>

          <div className="action-buttons">
            <button onClick={handleApprove} className="approve-btn" disabled={!isConnected}>
              ✅ Approve
            </button>
            <button onClick={handleRequestChanges} className="changes-btn" disabled={!isConnected}>
              🔄 Request Changes
            </button>
            <button className="escalate-btn" disabled={!isConnected}>
              🚨 Escalate
            </button>
          </div>
        </div>

        <div className="sidebar">
          <div className="sidebar-section">
            <h4>Decisions</h4>
            <div className="decisions-list">
              {decisions.length === 0 ? (
                <p className="empty-state">No pending decisions</p>
              ) : (
                decisions.map(decision => (
                  <div key={decision.id} className="decision-item">
                    <div className="decision-title">{decision.title}</div>
                    <div className="decision-status">{decision.status}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <h4>Open Risks</h4>
            <div className="risks-list">
              {risks.length === 0 ? (
                <p className="empty-state">No identified risks</p>
              ) : (
                risks.map(risk => (
                  <div key={risk.id} className={`risk-item ${risk.severity}`}>
                    <div className="risk-title">{risk.title}</div>
                    <div className="risk-owner">{risk.owner}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <h4>Budget/Quota</h4>
            <div className="budget-info">
              {projectBrief && (
                <>
                  <div className="budget-item">
                    <span>Tokens:</span>
                    <span>{projectBrief.budget.tokens.toLocaleString()}</span>
                  </div>
                  <div className="budget-item">
                    <span>Deploy Minutes:</span>
                    <span>{projectBrief.budget.deployMinutes}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <h4>Next Milestones</h4>
            <div className="milestones-list">
              <div className="milestone-item">
                <div className="milestone-title">Content Strategy</div>
                <div className="milestone-eta">2 hours</div>
              </div>
              <div className="milestone-item">
                <div className="milestone-title">Design Approval</div>
                <div className="milestone-eta">4 hours</div>
              </div>
              <div className="milestone-item">
                <div className="milestone-title">MVP Deploy</div>
                <div className="milestone-eta">1 day</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BoardRoom;
