import React, { useState, useEffect, useCallback } from 'react';
import AppMVP from './AppMVP';
import './App.css';
import './components/BoardRoom.css';
import BoardRoom from './components/BoardRoom';
import EngineStatus from './components/EngineStatus';
import AdminNavbar from './components/AdminNavbar';
import ProvidersWrapper from './components/ProvidersWrapper';
import LocalEngineStatus from './components/LocalEngineStatus';
//import SplashPage from './components/SplashPage';
import Console from './components/Console';
import Workers from './components/Workers';
import OngoingProjects from './components/OngoingProjects';
import AgentEnvironment from './components/AgentEnvironment';
import AIProject from './components/AIProject';

function App() {
  const [activeTab, setActiveTab] = useState('ai-project');
  const [selectedAgent, setSelectedAgent] = useState(null); // For agent environment view
  const [agents, setAgents] = useState([]); // Real agents from API
  const [boardRoomState, setBoardRoomState] = useState({
    messages: [],
    projectBrief: null,
    decisions: [],
    risks: [],
    milestones: []
  });

  const handleBoardRoomStateChange = useCallback((newState) => {
    setBoardRoomState(newState);
  }, []);

  // Persistent console logs across tab switches
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [consoleConnected, setConsoleConnected] = useState(false);

  // Handle agent avatar clicks
  const handleAgentClick = (agent) => {
    setSelectedAgent(agent);
    setActiveTab('agent-environment');
  };

  // Fetch real agents from API
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/agents');
        const data = await response.json();
        setAgents(data.agents || []);
      } catch (error) {
        console.error('Failed to fetch agents:', error);
        setAgents([]);
      }
    };

    fetchAgents();
    // Refresh agents every 30 seconds
    const interval = setInterval(fetchAgents, 30000);
    return () => clearInterval(interval);
  }, []);

  const [dashboardMode, setDashboardMode] = useState('advanced');

  return (
    <div className="App">
      <nav className="app-nav">
        <div className="nav-brand">
          <h1>ShellCompany</h1>
          <span className="nav-subtitle">Autonomous Agent Platform</span>
        </div>
        <div className="nav-tabs">
          <button onClick={() => setDashboardMode('advanced')} className={`nav-tab ${dashboardMode === 'advanced' ? 'active' : ''}`}>Advanced Dashboard</button>
          <button onClick={() => setDashboardMode('mvp')} className={`nav-tab ${dashboardMode === 'mvp' ? 'active' : ''}`}>MVP Dashboard</button>
          {dashboardMode === 'advanced' && <>
            <button className={`nav-tab ${activeTab === 'boardroom' ? 'active' : ''}`} onClick={() => setActiveTab('boardroom')}>📋 Board Room</button>
            <button className={`nav-tab ${activeTab === 'engine' ? 'active' : ''}`} onClick={() => setActiveTab('engine')}>⚡ Engine Status</button>
            <button className={`nav-tab ${activeTab === 'console' ? 'active' : ''}`} onClick={() => setActiveTab('console')}>🖥️ Console</button>
            <button className={`nav-tab ${activeTab === 'workers' ? 'active' : ''}`} onClick={() => setActiveTab('workers')}>⚙️ Workers</button>
            <button className={`nav-tab ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => setActiveTab('projects')}>📂 Ongoing Projects</button>
            <button className={`nav-tab ${activeTab === 'ai-project' ? 'active' : ''}`} onClick={() => setActiveTab('ai-project')}>🤖 AI Project</button>
          </>}
        </div>
        {dashboardMode === 'advanced' && (
          <div className="agent-status">
            {agents.map((agent, idx) => (
              <div
                key={agent.id || agent.name || idx}
                className={`agent-indicator ${agent.status}`}
                onClick={() => handleAgentClick(agent)}
                style={{ cursor: 'pointer' }}
                title={`Click to open ${agent.name}'s environment - ${agent.role}`}
              >
                <span className="agent-avatar">{agent.avatar}</span>
                <span className="agent-name">{agent.name}</span>
              </div>
            ))}
          </div>
        )}
      </nav>

      <main className="app-main">
        {dashboardMode === 'advanced' ? (
          <>
            {activeTab === 'boardroom' && (
              <BoardRoom state={boardRoomState} setState={handleBoardRoomStateChange} />
            )}
            {activeTab === 'engine' && (
              <div>
                <ProvidersWrapper>
                  <AdminNavbar onRefresh={() => { fetch('/api/engine/status?ping=true').catch(()=>{}); }} />
                  <LocalEngineStatus />
                </ProvidersWrapper>

                {/* Keep the full EngineStatus view (rich dashboard) below the admin widgets */}
                <EngineStatus />
              </div>
            )}
            {activeTab === 'console' && (
              <Console logs={consoleLogs} setLogs={setConsoleLogs} isConnected={consoleConnected} setIsConnected={setConsoleConnected} />
            )}
            {activeTab === 'workers' && <Workers />}
            {activeTab === 'projects' && <OngoingProjects />}
            {activeTab === 'ai-project' && <AIProject />}
            {activeTab === 'agent-environment' && selectedAgent && (
              <AgentEnvironment agentName={selectedAgent.name} onClose={() => setActiveTab('workers')} />
            )}
          </>
        ) : (
          <AppMVP />
        )}
      </main>
    </div>
  );
}

export default App;
