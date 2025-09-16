import React, { useState, useEffect } from 'react';
import './AIProject.css';

const AIProject = () => {
  const [projectInfo, setProjectInfo] = useState(null);
  const [agents, setAgents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjectInfo();
    fetchAgents();
    fetchTasks();
  }, []);

  const fetchProjectInfo = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/ai-project');
      const data = await response.json();
      setProjectInfo(data);
    } catch (error) {
      console.error('Failed to fetch AI project info:', error);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/agents');
      const data = await response.json();
      setAgents(data.agents || []);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    }
  };

  const fetchTasks = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/ai-tasks');
      const data = await response.json();
      setTasks(data.tasks || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return '#28a745';
      case 'busy': return '#17a2b8';
      case 'idle': return '#ffc107';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  };

  if (loading) {
    return (
      <div className="ai-project-loading">
        <div className="spinner"></div>
        <p>Loading AI Project Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="ai-project-container">
      <div className="ai-project-header">
        <h1>🤖 AI Project Dashboard</h1>
        <p>Autonomous AI-driven development platform</p>
      </div>

      {projectInfo?.project && (
        <div className="project-overview">
          <h2>{projectInfo.project.name}</h2>
          <p className="project-description">{projectInfo.project.description}</p>

          <div className="project-stats">
            <div className="stat-card">
              <span className="stat-number">{projectInfo.workers}</span>
              <span className="stat-label">Total Workers</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{projectInfo.activeWorkers}</span>
              <span className="stat-label">Active Workers</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{projectInfo.project.estimatedDays}</span>
              <span className="stat-label">Estimated Days</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{projectInfo.project.complexity}</span>
              <span className="stat-label">Complexity</span>
            </div>
          </div>

          {projectInfo.project.technologies && (
            <div className="technologies">
              <h3>Technologies</h3>
              <div className="tech-tags">
                {projectInfo.project.technologies.map((tech, idx) => (
                  <span key={`${tech}-${idx}`} className="tech-tag">{tech}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="agents-overview">
        <h2>AI Agents Team</h2>
        <div className="agents-grid">
          {agents.map((agent, idx) => (
            <div key={agent.id || agent.name || idx} className="agent-card">
              <div className="agent-header">
                <div className="agent-avatar">{agent.avatar}</div>
                <div className="agent-info">
                  <h3>{agent.name}</h3>
                  <p>{agent.role}</p>
                </div>
                <div
                  className="agent-status-indicator"
                  style={{ backgroundColor: getStatusColor(agent.status) }}
                  title={agent.status}
                />
              </div>

              <div className="agent-details">
                <div className="current-task">
                  <strong>Current Task:</strong>
                  <p>{agent.currentTask || 'No active task'}</p>
                </div>

                <div className="specialties">
                  <strong>Specialties:</strong>
                  <div className="specialty-tags">
                    {(agent.specialties || []).map((specialty, idx) => (
                      <span key={`${specialty}-${idx}`} className="specialty-tag">{specialty}</span>
                    ))}
                  </div>
                </div>

                <div className="responsibilities">
                  <strong>Key Responsibilities:</strong>
                  <ul>
                    {(agent.responsibilities || []).slice(0, 3).map((responsibility, index) => (
                      <li key={index}>{responsibility}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {projectInfo?.team && (
        <div className="team-structure">
          <h2>Team Structure</h2>
          <div className="team-info">
            <div className="team-detail">
              <strong>Manager:</strong> {projectInfo.team.manager}
            </div>
            <div className="team-detail">
              <strong>Coordination Method:</strong> {projectInfo.team.coordination_method}
            </div>
            <div className="team-detail">
              <strong>Update Frequency:</strong> {projectInfo.team.update_frequency}
            </div>
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="tasks-section">
          <h2>Recent Tasks</h2>
          <div className="tasks-list">
            {tasks.slice(0, 10).map((task, index) => (
              <div key={index} className="task-item">
                <div className="task-header">
                  <span className="task-title">{task.title || `Task ${index + 1}`}</span>
                  <span className={`task-status ${task.status}`}>{task.status || 'pending'}</span>
                </div>
                {task.description && (
                  <p className="task-description">{task.description}</p>
                )}
                {task.assignee && (
                  <div className="task-assignee">Assigned to: {task.assignee}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIProject;