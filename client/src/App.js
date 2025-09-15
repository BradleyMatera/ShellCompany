import React, { useState } from 'react';
import './App.css';
import './components/BoardRoom.css';
import BoardRoom from './components/BoardRoom';
import EngineStatus from './components/EngineStatus';
//import SplashPage from './components/SplashPage';
import Console from './components/Console';
import Workers from './components/Workers';
import OngoingProjects from './components/OngoingProjects';
import AgentEnvironment from './components/AgentEnvironment';

function App() {
  const [activeTab, setActiveTab] = useState('splash');
  const [selectedAgent, setSelectedAgent] = useState(null); // For agent environment view
  const [boardRoomState, setBoardRoomState] = useState({
    messages: [],
    projectBrief: null,
    decisions: [],
    risks: [],
    milestones: []
  });

  // Persistent console logs across tab switches
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [consoleConnected, setConsoleConnected] = useState(false);

  // Handle agent avatar clicks
  const handleAgentClick = (agent) => {
    setSelectedAgent(agent);
    setActiveTab('agent-environment');
  };

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

  return (
    <div className="App">
      <nav className="app-nav">
        <div className="nav-brand">
          <h1>ShellCompany</h1>
          <span className="nav-subtitle">Autonomous Agent Platform</span>
        </div>
        <div className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'boardroom' ? 'active' : ''}`}
            onClick={() => setActiveTab('boardroom')}
          >
            📋 Board Room
          </button>
          <button
            className={`nav-tab ${activeTab === 'engine' ? 'active' : ''}`}
            onClick={() => setActiveTab('engine')}
          >
            ⚡ Engine Status
          </button>
          <button
            className={`nav-tab ${activeTab === 'console' ? 'active' : ''}`}
            onClick={() => setActiveTab('console')}
          >
            🖥️ Console
          </button>
          <button
            className={`nav-tab ${activeTab === 'workers' ? 'active' : ''}`}
            onClick={() => setActiveTab('workers')}
          >
            ⚙️ Workers
          </button>
          <button
            className={`nav-tab ${activeTab === 'projects' ? 'active' : ''}`}
            onClick={() => setActiveTab('projects')}
          >
            📂 Ongoing Projects
          </button>
        </div>
        <div className="agent-status">
          {agents.map(agent => (
            <div 
              key={agent.name} 
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
      </nav>

      <main className="app-main">
        {/* {activeTab === 'splash' && <SplashPage />} */}
        {activeTab === 'boardroom' && (
          <BoardRoom
            state={boardRoomState}
            setState={setBoardRoomState}
          />
        )}
        {activeTab === 'engine' && <EngineStatus />}
        {activeTab === 'console' && (
          <Console 
            logs={consoleLogs}
            setLogs={setConsoleLogs}
            isConnected={consoleConnected}
            setIsConnected={setConsoleConnected}
          />
        )}
        {activeTab === 'workers' && <Workers />}
        {activeTab === 'projects' && <OngoingProjects />}
        {activeTab === 'agent-environment' && selectedAgent && (
          <AgentEnvironment 
            agent={selectedAgent}
            onBack={() => setActiveTab('workers')}
          />
        )}
      </main>
    </div>
  );
}

export default App;
