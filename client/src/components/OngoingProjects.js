import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './OngoingProjects.css';

const OngoingProjects = () => {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [filter, setFilter] = useState('all');
  const [artifacts, setArtifacts] = useState([]);

  useEffect(() => {
    // Connect to WebSocket for real-time workflow updates
    const newSocket = io('http://localhost:3001', {
      withCredentials: true,
      transports: ['polling', 'websocket'], // Fallback to polling first
      upgrade: true,
      rememberUpgrade: true
    });

    newSocket.on('connect', () => {
      console.log('Connected to workflow system');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from workflow system');
      setIsConnected(false);
    });

    // Listen for workflow updates with deduplication
    newSocket.on('workflow-created', (workflow) => {
      console.log('New workflow created:', workflow);
      setWorkflows(prev => {
        // Check if workflow already exists to prevent duplicates
        const existingIndex = prev.findIndex(w => w.id === workflow.workflowId);
        
        const newWorkflow = {
          id: workflow.workflowId,
          directive: workflow.directive,
          status: 'running',
          tasks: workflow.tasks || [],
          estimates: workflow.estimates,
          createdAt: new Date().toISOString(),
          progress: { completed: 0, total: workflow.tasks?.length || 0, percentage: 0 },
          artifacts: []
        };
        
        if (existingIndex >= 0) {
          // Update existing workflow
          const updated = [...prev];
          updated[existingIndex] = { ...updated[existingIndex], ...newWorkflow };
          return updated;
        } else {
          // Add new workflow
          return [...prev, newWorkflow];
        }
      });
    });

    newSocket.on('workflow-progress', (progress) => {
      console.log('Workflow progress update:', progress);
      setWorkflows(prev => prev.map(w => 
        w.id === progress.workflowId 
          ? { ...w, progress: progress.progress, status: progress.status, tasks: progress.tasks }
          : w
      ));
    });

    setSocket(newSocket);

    // Fetch initial workflow history
    fetchWorkflows();

    return () => {
      newSocket.close();
    };
  }, []);

  const fetchWorkflows = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/autonomous/workflows');
      const data = await response.json();
      console.log('Workflows API response:', data); // Debug log
      
      const apiWorkflows = data.workflows || data || [];
      
      // COMPREHENSIVE DEDUPLICATION: Use Map to ensure unique workflow IDs
      const workflowMap = new Map();
      
      // First, add existing workflows from Socket.IO to preserve real-time updates
      workflows.forEach(existing => {
        workflowMap.set(existing.id, existing);
      });
      
      // Then add/update with API data, ensuring no duplicates
      apiWorkflows.forEach(apiWorkflow => {
        const existing = workflowMap.get(apiWorkflow.id);
        if (existing) {
          // Merge existing with API data, preserving real-time updates
          workflowMap.set(apiWorkflow.id, { ...existing, ...apiWorkflow });
        } else {
          // Add new workflow from API
          workflowMap.set(apiWorkflow.id, apiWorkflow);
        }
      });
      
      // Convert map back to array, ensuring no duplicates
      const uniqueWorkflows = Array.from(workflowMap.values());
      
      console.log(`[DEDUP] Final workflow count: ${uniqueWorkflows.length} (from ${apiWorkflows.length} API + ${workflows.length} existing)`);
      
      setWorkflows(uniqueWorkflows);
      
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
      // Mock data for demo if API fails
      setWorkflows([
        {
          id: 'demo-workflow-1',
          directive: 'Create a monitoring dashboard',
          status: 'completed',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          progress: { completed: 4, total: 4, percentage: 100 },
          tasks: [
            { id: '1', title: 'Setup project structure', status: 'completed', assignedAgent: 'Alex' },
            { id: '2', title: 'Design dashboard layout', status: 'completed', assignedAgent: 'Pixel' },
            { id: '3', title: 'Implement React components', status: 'completed', assignedAgent: 'Nova' },
            { id: '4', title: 'Deploy to production', status: 'completed', assignedAgent: 'Sage' }
          ],
          artifacts: [
            { id: '1', name: 'dashboard-project', type: 'folder', size: '2.3 MB', agent: 'Nova' },
            { id: '2', name: 'README.md', type: 'file', size: '1.2 KB', agent: 'Alex' }
          ]
        },
        {
          id: 'demo-workflow-2',
          directive: 'Build landing page for AI service',
          status: 'running',
          createdAt: new Date(Date.now() - 1800000).toISOString(),
          progress: { completed: 2, total: 3, percentage: 67 },
          tasks: [
            { id: '1', title: 'Create HTML structure', status: 'completed', assignedAgent: 'Nova' },
            { id: '2', title: 'Apply modern CSS styling', status: 'completed', assignedAgent: 'Pixel' },
            { id: '3', title: 'Add interactive features', status: 'running', assignedAgent: 'Nova' }
          ],
          artifacts: [
            { id: '3', name: 'index.html', type: 'file', size: '5.4 KB', agent: 'Nova' },
            { id: '4', name: 'styles.css', type: 'file', size: '3.2 KB', agent: 'Pixel' }
          ]
        }
      ]);
    }
  };

  const fetchArtifacts = async (workflowId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/autonomous/workflows/${workflowId}/artifacts`);
      const data = await response.json();
      setArtifacts(data.artifacts || []);
    } catch (error) {
      console.error('Failed to fetch artifacts:', error);
    }
  };

  const downloadArtifact = async (workflowId, artifactId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/autonomous/workflows/${workflowId}/artifacts/${artifactId}/download`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = artifactId;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download artifact:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#22c55e';
      case 'running': return '#3b82f6';
      case 'failed': return '#ef4444';
      case 'paused': return '#f59e0b';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✅';
      case 'running': return '🔄';
      case 'failed': return '❌';
      case 'paused': return '⏸️';
      default: return '⏳';
    }
  };

  const filteredWorkflows = workflows.filter(workflow => {
    if (filter === 'all') return true;
    return workflow.status === filter;
  });

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getDuration = (createdAt) => {
    const start = new Date(createdAt);
    const now = new Date();
    const diff = now - start;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  return (
    <div className="ongoing-projects">
      <div className="projects-header">
        <div className="projects-title">
          <h2>📂 Ongoing Projects</h2>
          <div className="projects-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '🟢 Live Updates' : '🔴 Offline'}
            </span>
            <span className="projects-count">{filteredWorkflows.length} projects</span>
          </div>
        </div>

        <div className="projects-controls">
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Projects</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="paused">Paused</option>
          </select>
          
          <button onClick={fetchWorkflows} className="refresh-btn">
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="projects-content">
        {filteredWorkflows.length === 0 ? (
          <div className="projects-empty">
            <div className="empty-icon">📂</div>
            <h3>No Projects Found</h3>
            <p>
              {filter === 'all' 
                ? 'No autonomous workflows have been executed yet. Start by creating a directive in the Board Room.'
                : `No ${filter} projects found. Try adjusting the filter.`
              }
            </p>
          </div>
        ) : (
          <div className="projects-grid">
            {filteredWorkflows.map(workflow => (
              <div 
                key={workflow.id} 
                className={`project-card ${workflow.status} ${selectedWorkflow?.id === workflow.id ? 'selected' : ''}`}
                onClick={() => setSelectedWorkflow(selectedWorkflow?.id === workflow.id ? null : workflow)}
              >
                <div className="project-header">
                  <div className="project-status">
                    <span className="status-icon">{getStatusIcon(workflow.status)}</span>
                    <span className="status-text">{workflow.status}</span>
                  </div>
                  <div className="project-id">
                    <code>{workflow.id.split('-').slice(-1)[0]}</code>
                  </div>
                </div>

                <div className="project-content">
                  <h3 className="project-directive">{workflow.directive}</h3>
                  
                  <div className="project-progress">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ 
                          width: `${workflow.progress?.percentage || 0}%`,
                          backgroundColor: getStatusColor(workflow.status)
                        }}
                      />
                    </div>
                    <div className="progress-text">
                      {workflow.progress?.completed || 0} of {workflow.progress?.total || 0} tasks
                      ({workflow.progress?.percentage || 0}%)
                    </div>
                  </div>

                  <div className="project-meta">
                    <div className="meta-item">
                      <span className="meta-label">Created:</span>
                      <span className="meta-value">{formatDate(workflow.createdAt)}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Duration:</span>
                      <span className="meta-value">{getDuration(workflow.createdAt)}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Artifacts:</span>
                      <span className="meta-value">{workflow.artifacts?.length || 0} files</span>
                    </div>
                  </div>
                </div>

                <div className="project-footer">
                  <div className="task-agents">
                    {workflow.tasks?.slice(0, 4).map(task => (
                      <div key={task.id} className="agent-chip" title={`${task.assignedAgent}: ${task.title}`}>
                        {task.assignedAgent?.charAt(0) || '?'}
                      </div>
                    ))}
                    {workflow.tasks?.length > 4 && (
                      <div className="agent-chip more">+{workflow.tasks.length - 4}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedWorkflow && (
        <div className="project-details">
          <div className="details-header">
            <div className="details-title">
              <h3>Project Details</h3>
              <div className="project-actions">
                <button 
                  onClick={() => fetchArtifacts(selectedWorkflow.id)}
                  className="action-btn"
                >
                  📁 View Artifacts
                </button>
                <button 
                  onClick={() => setSelectedWorkflow(null)}
                  className="close-btn"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="workflow-id-display">
              <label>Workflow ID:</label>
              <code>{selectedWorkflow.id}</code>
              <button 
                onClick={() => navigator.clipboard?.writeText(selectedWorkflow.id)}
                className="copy-id-btn"
              >
                📋
              </button>
            </div>
          </div>

          <div className="details-content">
            <div className="details-section">
              <h4>Tasks ({selectedWorkflow.tasks?.length || 0})</h4>
              <div className="tasks-list">
                {selectedWorkflow.tasks?.map((task, idx) => (
                  <div key={task.id} className={`task-row ${task.status}`}>
                    <div className="task-index">{idx + 1}</div>
                    <div className="task-info">
                      <div className="task-title">{task.title}</div>
                      <div className="task-agent">
                        <span className="agent-avatar">
                          {task.assignedAgent === 'Alex' ? '👨‍💼' : 
                           task.assignedAgent === 'Nova' ? '⚛️' : 
                           task.assignedAgent === 'Pixel' ? '🎨' : 
                           task.assignedAgent === 'Sage' ? '🚀' : 
                           task.assignedAgent === 'Cipher' ? '🔒' : '🤖'}
                        </span>
                        {task.assignedAgent}
                      </div>
                    </div>
                    <div className={`task-status ${task.status}`}>
                      {getStatusIcon(task.status)} {task.status}
                    </div>
                  </div>
                )) || <p>No tasks available</p>}
              </div>
            </div>

            <div className="details-section">
              <h4>Artifacts ({selectedWorkflow.artifacts?.length || 0})</h4>
              <div className="artifacts-list">
                {selectedWorkflow.artifacts?.length > 0 ? (
                  selectedWorkflow.artifacts.map(artifact => (
                    <div key={artifact.id} className="artifact-row">
                      <div className="artifact-icon">
                        {artifact.type === 'folder' ? '📁' : '📄'}
                      </div>
                      <div className="artifact-info">
                        <div className="artifact-name">{artifact.name}</div>
                        <div className="artifact-meta">
                          <span className="artifact-size">{artifact.size}</span>
                          <span className="artifact-agent">by {artifact.agent}</span>
                        </div>
                      </div>
                      <div className="artifact-actions">
                        <button 
                          onClick={() => downloadArtifact(selectedWorkflow.id, artifact.id)}
                          className="download-btn"
                        >
                          ⬇️ Download
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p>No artifacts generated yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OngoingProjects;
