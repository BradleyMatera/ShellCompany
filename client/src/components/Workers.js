import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import AgentEnvironment from './AgentEnvironment';
import './Workers.css';

const Workers = () => {
  const [workers, setWorkers] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [agents, setAgents] = useState([]); // NEW: Real autonomous agents
  const [, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [systemInfo, setSystemInfo] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null); // For agent environment

  useEffect(() => {
    // Connect to WebSocket for real-time worker updates
    const newSocket = io('http://localhost:3001', {
      withCredentials: true,
      transports: ['polling', 'websocket'], // Fallback to polling first
      upgrade: true,
      rememberUpgrade: true
    });

    newSocket.on('connect', () => {
      console.log('Connected to server WebSocket for workers');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server WebSocket');
      setIsConnected(false);
    });

    // Listen for worker updates
    newSocket.on('worker_update', (data) => {
      setWorkers(data.workers || []);
      setProcesses(data.processes || []);
      setSystemInfo(data.system || null);
    });

    // Listen for REAL agent status updates
    newSocket.on('worker-update', (data) => {
      if (data.agentName) {
        setAgents(prev => prev.map(agent => 
          agent.name === data.agentName 
            ? { ...agent, status: data.status, currentTask: data.currentTask, artifacts: data.artifacts }
            : agent
        ));
      }
    });

    setSocket(newSocket);

    // Fetch initial data
    fetchWorkers();
    fetchProcesses();
    fetchSystemInfo();
    fetchAgents(); // NEW: Fetch real autonomous agents

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchWorkers();
      fetchProcesses();
      fetchAgents(); // NEW: Poll agent status
    }, 2000);

    return () => {
      newSocket.close();
      clearInterval(interval);
    };
  }, []);

  const fetchWorkers = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/workers');
      const data = await response.json();
      setWorkers(data.workers || []);
    } catch (error) {
      console.error('Failed to fetch workers:', error);
    }
  };

  const fetchProcesses = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/system/processes');
      const data = await response.json();
      setProcesses(data.processes || []);
    } catch (error) {
      console.error('Failed to fetch processes:', error);
    }
  };

  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/system/info');
      const data = await response.json();
      setSystemInfo(data);
    } catch (error) {
      console.error('Failed to fetch system info:', error);
    }
  };

  // NEW: Fetch real autonomous agents
  const fetchAgents = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/agents');
      const data = await response.json();
      
      const agentsArray = data.agents || [];
      console.log(`Loaded ${agentsArray.length} agents:`, agentsArray.map(a => `${a.name}(${a.status})`));
      
      setAgents(agentsArray);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      setAgents([]); // Set empty array on error
    }
  };

  const formatMemory = (bytes) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'running': return '#28a745';
      case 'idle': return '#ffc107';
      case 'busy': return '#17a2b8';
      case 'error': return '#dc3545';
      case 'stopped': return '#6c757d';
      default: return '#6c757d';
    }
  };

  const killProcess = async (pid) => {
    try {
      const response = await fetch(`http://localhost:3001/api/system/processes/${pid}/kill`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchProcesses();
      }
    } catch (error) {
      console.error('Failed to kill process:', error);
    }
  };

  return (
    <div className="workers">
      <div className="workers-header">
        <div className="workers-title">
          <h2>⚙️ Workers & Processes</h2>
          <div className="workers-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
            <span className="workers-count">{workers.length} workers, {processes.length} processes</span>
          </div>
        </div>
        
        <div className="workers-controls">
          <button onClick={fetchWorkers} className="refresh-btn">
            🔄 Refresh
          </button>
          <button onClick={fetchSystemInfo} className="system-info-btn">
            📊 System Info
          </button>
        </div>
      </div>

      {systemInfo && (
        <div className="system-overview">
          <div className="system-card">
            <h4>System Overview</h4>
            <div className="system-stats">
              <div className="stat">
                <span className="stat-label">CPU Usage:</span>
                <span className="stat-value">{systemInfo.cpu?.usage || 'N/A'}%</span>
              </div>
              <div className="stat">
                <span className="stat-label">Memory:</span>
                <span className="stat-value">
                  {formatMemory(systemInfo.memory?.used)} / {formatMemory(systemInfo.memory?.total)}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Uptime:</span>
                <span className="stat-value">{formatUptime(systemInfo.uptime)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Load:</span>
                <span className="stat-value">{systemInfo.loadavg?.join(', ') || 'N/A'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="workers-content">
        {/* REAL AUTONOMOUS AGENTS SECTION */}
        <div className="agents-section">
          <h3>🤖 Autonomous Agents</h3>
          {agents.length === 0 ? (
            <div className="agents-empty">
              <p>No autonomous agents found</p>
              <p className="agents-help">
                Autonomous agents (Alex, Nova, Pixel, Zephyr, Cipher, Sage) will appear here with their
                current status, assigned tasks, and specializations.
              </p>
            </div>
          ) : (
            <div className="agents-grid">
              {agents.map((agent, idx) => (
                <div
                  key={agent.id || agent.name || idx}
                  className={`agent-card ${agent.status}`}
                  onClick={() => setSelectedAgent(agent)}
                >
                  <div className="agent-header">
                    <div className="agent-avatar">
                      {agent.avatar || '🤖'}
                    </div>
                  <div className="agent-info">
                    <div className="agent-name" style={{color: '#fff', fontSize: '16px', fontWeight: 'bold'}}>
                      {agent.name || 'Unknown Agent'}
                    </div>
                    <div className="agent-role" style={{color: '#9ca3af', fontSize: '12px'}}>
                      {agent.role || 'No Role Assigned'}
                    </div>
                  </div>
                    <div className={`agent-status-badge ${agent.status}`} style={{color: '#fff'}}>
                      {agent.status === 'idle' ? '💤' : 
                       agent.status === 'busy' ? '🔄' : 
                       agent.status === 'error' ? '❌' : '✅'} 
                      {agent.status || 'unknown'}
                    </div>
                  </div>
                  
                  <div className="agent-details">
                    <div className="agent-task">
                      <span className="detail-label" style={{color: '#9ca3af'}}>Current Task:</span>
                      <span className="detail-value" style={{color: '#fff'}}>
                        {agent.currentTask || 'No active task'}
                      </span>
                    </div>
                    
                    <div className="agent-queue">
                      <span className="detail-label" style={{color: '#9ca3af'}}>Queue Depth:</span>
                      <span className="detail-value" style={{color: '#fff'}}>{agent.queue || 0}</span>
                    </div>
                    
                    <div className="agent-artifacts">
                      <span className="detail-label" style={{color: '#9ca3af'}}>Last Seen:</span>
                      <span className="detail-value" style={{color: '#fff'}}>
                        {agent.lastHeartbeat ? new Date(agent.lastHeartbeat).toLocaleTimeString() : 'Never'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="agent-specializations">
                    <div className="detail-label">Specializations:</div>
                    <div className="specialization-tags">
                      {(agent.specialties || agent.specializations || []).map((spec, idx) => (
                        <span key={`${spec}-${idx}`} className="spec-tag">{spec}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="workers-section">
          <h3>System Workers</h3>
          {workers.length === 0 ? (
            <div className="workers-empty">
              <p>No active workers</p>
              <p className="workers-help">
                Workers will appear here when tasks are running. Each worker shows its PID, 
                current working directory, queue depth, and last heartbeat.
              </p>
            </div>
          ) : (
            <div className="workers-table">
              <div className="table-header">
                <div className="col">ID</div>
                <div className="col">PID</div>
                <div className="col">Status</div>
                <div className="col">CWD</div>
                <div className="col">Queue</div>
                <div className="col">Memory</div>
                <div className="col">Last Heartbeat</div>
                <div className="col">Actions</div>
              </div>
              {workers.map(worker => (
                <div key={worker.id} className="table-row">
                  <div className="col">{worker.id}</div>
                  <div className="col">{worker.pid}</div>
                  <div className="col">
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(worker.status) }}
                    >
                      {worker.status}
                    </span>
                  </div>
                  <div className="col" title={worker.cwd}>{worker.cwd?.split('/').pop() || 'N/A'}</div>
                  <div className="col">{worker.queueDepth || 0}</div>
                  <div className="col">{formatMemory(worker.memoryUsage)}</div>
                  <div className="col">
                    {worker.lastHeartbeat ? new Date(worker.lastHeartbeat).toLocaleTimeString() : 'Never'}
                  </div>
                  <div className="col">
                    <button 
                      onClick={() => killProcess(worker.pid)}
                      className="kill-btn"
                      disabled={worker.status === 'stopped'}
                    >
                      Kill
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="processes-section">
          <h3>System Processes</h3>
          <div className="processes-table">
            <div className="table-header">
              <div className="col">PID</div>
              <div className="col">Command</div>
              <div className="col">CPU%</div>
              <div className="col">Memory</div>
              <div className="col">Status</div>
              <div className="col">Started</div>
              <div className="col">Actions</div>
            </div>
            {processes.slice(0, 20).map(process => (
              <div key={process.pid} className="table-row">
                <div className="col">{process.pid}</div>
                <div className="col" title={process.command}>
                  {process.command?.length > 30 ? 
                    `${process.command.substring(0, 30)}...` : 
                    process.command || 'N/A'
                  }
                </div>
                <div className="col">{process.cpu || 0}%</div>
                <div className="col">{formatMemory(process.memory)}</div>
                <div className="col">
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(process.status) }}
                  >
                    {process.status || 'running'}
                  </span>
                </div>
                <div className="col">
                  {process.startTime ? new Date(process.startTime).toLocaleTimeString() : 'N/A'}
                </div>
                <div className="col">
                  <button 
                    onClick={() => killProcess(process.pid)}
                    className="kill-btn"
                    disabled={process.status === 'stopped' || process.pid < 1000}
                  >
                    Kill
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="workers-info">
        <p>
          This view shows real system processes and workers with live PIDs, memory usage, 
          CPU consumption, and heartbeat status. All data is pulled directly from the server 
          using system calls and process monitoring.
        </p>
      </div>

      {/* Agent Environment Modal */}
      {selectedAgent && (
        <AgentEnvironment 
          agent={selectedAgent}
          onBack={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
};

export default Workers;
