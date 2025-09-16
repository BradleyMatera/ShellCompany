import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import './Console.css';

const Console = ({ logs, setLogs, isConnected, setIsConnected }) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [agents, setAgents] = useState([]);
  const logsEndRef = useRef(null);
  const consoleRef = useRef(null);

  const fetchLogHistory = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/console/logs');
      const data = await response.json();
      console.log('Console logs API response:', data); // Debug log
      
      // Handle different response formats
      let logData = [];
      if (data.logs && Array.isArray(data.logs)) {
        logData = data.logs;
      } else if (Array.isArray(data)) {
        logData = data;
      }
      
      // Ensure logs have required properties
      const validLogs = logData.filter(log => log && log.timestamp && log.message);
      setLogs(validLogs);
    } catch (error) {
      console.error('Failed to fetch log history:', error);
      // Add some test logs to verify the UI works
      setLogs([
        {
          id: 'test1',
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Console component loaded successfully',
          source: 'client'
        },
        {
          id: 'test2', 
          timestamp: new Date().toISOString(),
          level: 'log',
          message: 'Waiting for server logs...',
          source: 'system'
        }
      ]);
    }
  }, [setLogs]);

  // Fetch agents for filtering
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/agents', {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setAgents(data.agents || []);
        }
      } catch (error) {
        console.error('Failed to fetch agents for Console:', error);
      }
    };
    fetchAgents();
  }, []);

  useEffect(() => {
    // Connect to WebSocket for real-time logs
    const newSocket = io('http://localhost:3001', {
      withCredentials: true,
      transports: ['polling', 'websocket'], // Fallback to polling first
      upgrade: true,
      rememberUpgrade: true
    });

    newSocket.on('connect', () => {
      console.log('Connected to server WebSocket');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server WebSocket');
      setIsConnected(false);
    });

    // Listen for console logs
    newSocket.on('console_log', (data) => {
      console.log('Received console_log via Socket.IO:', data); // Debug
      
      const logEntry = data.data || data;
      if (logEntry && logEntry.timestamp && logEntry.message) {
        setLogs(prevLogs => {
          const newLogs = [...prevLogs, logEntry];
          // Keep only last 1000 logs
          if (newLogs.length > 1000) {
            return newLogs.slice(-1000);
          }
          return newLogs;
        });
      }
    });

    // Fetch initial log history
    fetchLogHistory().catch(() => {});

    return () => {
      newSocket.close();
    };
  }, [fetchLogHistory, setIsConnected, setLogs]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // fetchLogHistory is defined above as a stable useCallback

  const handleScroll = () => {
    if (!consoleRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = consoleRef.current;
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 10;
    
    setAutoScroll(isAtBottom);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const exportLogs = () => {
    const logsText = logs.map(log => 
      `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shellcompany-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getLogLevelColor = (level) => {
    switch (level) {
      case 'error': return '#ff6b6b';
      case 'warn': return '#feca57';
      case 'info': return '#48dbfb';
      case 'log': return '#ddd';
      case 'stdout': return '#54a0ff';
      case 'stderr': return '#ff6b6b';
      default: return '#ddd';
    }
  };

  const filteredLogs = logs.filter(log => {
    // Level filter
    let levelMatch = true;
    if (filter !== 'all') {
      if (filter === 'errors') {
        levelMatch = log.level === 'error' || log.level === 'stderr';
      } else if (filter === 'warnings') {
        levelMatch = log.level === 'warn';
      } else {
        levelMatch = log.level === filter;
      }
    }

    // Agent filter
    let agentMatch = true;
    if (agentFilter !== 'all') {
      agentMatch = log.agent === agentFilter || log.source === agentFilter;
    }

    // Department filter
    let departmentMatch = true;
    if (departmentFilter !== 'all') {
      const agent = agents.find(a => a.name === (log.agent || log.source));
      departmentMatch = agent?.department === departmentFilter;
    }

    return levelMatch && agentMatch && departmentMatch;
  });

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getAgentInfo = (agentName) => {
    return agents.find(a => a.name === agentName);
  };

  const getRoleColor = (agent) => {
    if (!agent) return '#666';
    if (agent.canManage) return '#3b82f6'; // Blue for managers
    switch (agent.department) {
      case 'Engineering': return '#10b981'; // Green
      case 'Design': return '#8b5cf6'; // Purple
      case 'Data & AI': return '#f59e0b'; // Orange
      case 'Product': return '#06b6d4'; // Cyan
      case 'Business': return '#ef4444'; // Red
      case 'Quality': return '#84cc16'; // Lime
      default: return '#6b7280'; // Gray
    }
  };

  return (
    <div className="console">
      <div className="console-header">
        <div className="console-title">
          <h2>🖥️ System Console</h2>
          <div className="console-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
            <span className="log-count">{filteredLogs.length} logs</span>
          </div>
        </div>
        
        <div className="console-controls">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Levels</option>
            <option value="log">Console Logs</option>
            <option value="info">Info</option>
            <option value="warn">Warnings</option>
            <option value="errors">Errors</option>
            <option value="stdout">Stdout</option>
            <option value="stderr">Stderr</option>
          </select>

          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="filter-select agent-filter"
          >
            <option value="all">All Agents</option>
            {agents.map(agent => (
              <option key={agent.name} value={agent.name}>
                {agent.icon} {agent.name}
              </option>
            ))}
          </select>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="filter-select department-filter"
          >
            <option value="all">All Departments</option>
            {[...new Set(agents.map(a => a.department))].filter(Boolean).map(dept => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
          
          <label className="auto-scroll-toggle">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
          
          <button onClick={clearLogs} className="clear-btn">
            Clear
          </button>
          
          <button onClick={exportLogs} className="export-btn">
            Export
          </button>
        </div>
      </div>

      <div 
        className="console-output" 
        ref={consoleRef}
        onScroll={handleScroll}
      >
        {filteredLogs.length === 0 ? (
          <div className="console-empty">
            <p>No logs available</p>
            <p className="console-help">
              Server logs will appear here in real-time. Server activity: HTTP requests, 
              agent executions, database queries, and system operations are all logged here.
            </p>
            <div style={{ marginTop: '20px', padding: '10px', background: '#333', borderRadius: '4px', fontSize: '12px' }}>
              <div>🔍 Troubleshooting:</div>
              <div>• WebSocket Status: {isConnected ? '✅ Connected' : '❌ Disconnected'}</div>
              <div>• Log Buffer Size: {logs.length}</div>
              <div>• Active Filter: {filter}</div>
            </div>
          </div>
        ) : (
          filteredLogs.map(log => {
            const agentInfo = getAgentInfo(log.agent || log.source);
            const roleColor = getRoleColor(agentInfo);

            return (
              <div key={log.id} className={`console-line ${log.level}`}>
                <span className="console-timestamp">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span
                  className="console-level"
                  style={{ color: getLogLevelColor(log.level) }}
                >
                  [{log.level.toUpperCase()}]
                </span>

                {agentInfo && (
                  <span className="console-agent-tag" style={{ color: roleColor }}>
                    <span className="agent-icon">{agentInfo.icon}</span>
                    <span className="agent-name">{agentInfo.name}</span>
                    {agentInfo.department && (
                      <span className="agent-department">({agentInfo.department})</span>
                    )}
                    {agentInfo.canManage && (
                      <span className="manager-badge">👑</span>
                    )}
                  </span>
                )}

                <span className="console-source">
                  {log.source}
                </span>
                <span className="console-message">
                  {log.message}
                </span>
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
      </div>

      <div className="console-info">
        <p>
          This console shows real-time server logs including console.log(), stdout, stderr, 
          and all command executions. Every action performed by agents is logged here.
        </p>
      </div>
    </div>
  );
};

export default Console;
