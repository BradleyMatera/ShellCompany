import React, { useState, useEffect } from 'react';
import './AgentEnvironment.css';

const AgentEnvironment = ({ agent, onBack }) => {
  const [environmentData, setEnvironmentData] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [agentDetails, setAgentDetails] = useState(null);

  useEffect(() => {
    if (agent) {
      loadAgentEnvironment();
      loadAgentDetails();
      initializeChat();
    }
  }, [agent]);

  const loadAgentDetails = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/agents/${agent.id || agent.name.toLowerCase()}`);
      if (response.ok) {
        const data = await response.json();
        setAgentDetails(data.agent);
      }
    } catch (error) {
      console.error('Failed to load agent details:', error);
    }
  };

  const loadAgentEnvironment = async () => {
    try {
      setLoading(true);
      const agentId = agent.id || agent.name.toLowerCase();
      const response = await fetch(`http://localhost:3001/api/agents/${agentId}/environment`);

      if (response.ok) {
        const data = await response.json();
        setEnvironmentData(data.environment);
      } else {
        // If environment doesn't exist, create initial structure
        await createAgentWorkspace(agentId);
      }
    } catch (error) {
      console.error('Failed to load agent environment:', error);
      // Create fallback environment
      await createAgentWorkspace(agent.id || agent.name.toLowerCase());
    } finally {
      setLoading(false);
    }
  };

  const createAgentWorkspace = async (agentId) => {
    try {
      // Create initial workspace structure
      const initialFiles = [
        { name: 'tasks', type: 'directory', size: 0 },
        { name: 'artifacts', type: 'directory', size: 0 },
        { name: 'notes.md', type: 'file', size: 0 },
        { name: 'config.json', type: 'file', size: 0 }
      ];

      setEnvironmentData({
        agentName: agentId,
        workspacePath: `/agent-workspaces/${agentId}-workspace`,
        files: initialFiles
      });
    } catch (error) {
      console.error('Failed to create agent workspace:', error);
    }
  };

  const initializeChat = () => {
    setChatMessages([
      {
        id: 1,
        type: 'agent',
        message: `Hi! I'm ${agent.name}, your ${agent.role}. I'm here to help with ${(agent.specialties || agent.capabilities || []).join(', ')}. How can I assist you today?`,
        timestamp: new Date().toISOString()
      }
    ]);
  };

  const handleFileClick = async (file, index) => {
    if (file.type === 'directory') {
      // Toggle directory expansion
      const dirKey = `${file.name}-${index}`;
      const newExpanded = new Set(expandedDirs);

      if (expandedDirs.has(dirKey)) {
        newExpanded.delete(dirKey);
        // Remove subdirectory files from view
        const updatedFiles = environmentData.files.filter(f =>
          !f.parentDir || f.parentDir !== file.name
        );
        setEnvironmentData({ ...environmentData, files: updatedFiles });
      } else {
        newExpanded.add(dirKey);
        await loadDirectoryContents(file.name, index);
      }

      setExpandedDirs(newExpanded);
    } else {
      // Load file content
      setSelectedFile(file);
      await loadFileContent(file.name, file.parentDir);
    }
  };

  const loadDirectoryContents = async (dirName, parentIndex) => {
    try {
      const agentId = agent.id || agent.name.toLowerCase();

      // For now, simulate directory contents
      const mockSubFiles = [
        { name: `${dirName}/example.txt`, type: 'file', size: 1024, parentDir: dirName },
        { name: `${dirName}/data.json`, type: 'file', size: 512, parentDir: dirName }
      ];

      // Insert subdirectory files after the parent directory
      const updatedFiles = [...environmentData.files];
      const insertIndex = parentIndex + 1;

      mockSubFiles.forEach((subFile, idx) => {
        updatedFiles.splice(insertIndex + idx, 0, subFile);
      });

      setEnvironmentData({ ...environmentData, files: updatedFiles });
    } catch (error) {
      console.error('Failed to load directory contents:', error);
    }
  };

  const loadFileContent = async (fileName, parentDir = null) => {
    try {
      const agentId = agent.id || agent.name.toLowerCase();
      const filePath = parentDir ? `${parentDir}/${fileName}` : fileName;

      const response = await fetch(`http://localhost:3001/api/agents/${agentId}/files/${encodeURIComponent(filePath)}`);

      if (response.ok) {
        const content = await response.text();
        setFileContent(content);
      } else {
        // Create default content based on file type
        const defaultContent = getDefaultFileContent(fileName);
        setFileContent(defaultContent);
      }
    } catch (error) {
      console.error('Failed to load file content:', error);
      setFileContent('// Error loading file content');
    }
  };

  const getDefaultFileContent = (fileName) => {
    if (fileName.endsWith('.md')) {
      return `# ${agent.name} - ${fileName}\n\n## Current Tasks\n- Task 1\n- Task 2\n\n## Notes\nAdd your notes here...`;
    } else if (fileName.endsWith('.json')) {
      return JSON.stringify({
        agent: agent.name,
        role: agent.role,
        status: agent.status,
        lastUpdated: new Date().toISOString()
      }, null, 2);
    } else if (fileName.endsWith('.js')) {
      return `// ${agent.name} - ${fileName}\n\n/**\n * Agent: ${agent.name}\n * Role: ${agent.role}\n */\n\nconsole.log('${agent.name} is working...');`;
    }
    return `File: ${fileName}\nAgent: ${agent.name}\nCreated: ${new Date().toISOString()}\n\nContent goes here...`;
  };

  const saveFileContent = async () => {
    if (!selectedFile) return;

    try {
      setSaving(true);
      const agentId = agent.id || agent.name.toLowerCase();
      const filePath = selectedFile.parentDir ?
        `${selectedFile.parentDir}/${selectedFile.name}` :
        selectedFile.name;

      const response = await fetch(`http://localhost:3001/api/agents/${agentId}/files/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: fileContent
      });

      if (response.ok) {
        setIsEditing(false);
        console.log('File saved successfully');
      } else {
        console.error('Failed to save file');
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setSaving(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      message: chatInput,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => [...prev, userMessage]);
    const currentInput = chatInput;
    setChatInput('');

    try {
      const agentId = agent.id || agent.name.toLowerCase();
      const response = await fetch(`http://localhost:3001/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput })
      });

      if (response.ok) {
        const data = await response.json();
        const agentMessage = {
          id: Date.now() + 1,
          type: 'agent',
          message: data.message,
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, agentMessage]);
      }
    } catch (error) {
      console.error('Failed to send chat message:', error);
      const errorMessage = {
        id: Date.now() + 1,
        type: 'agent',
        message: "Sorry, I'm having trouble responding right now. Please try again.",
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    }
  };

  const createNewFile = async () => {
    const fileName = prompt('Enter file name:');
    if (!fileName) return;

    const newFile = {
      name: fileName,
      type: 'file',
      size: 0,
      modified: new Date().toISOString()
    };

    const updatedFiles = [...environmentData.files, newFile];
    setEnvironmentData({ ...environmentData, files: updatedFiles });
    setSelectedFile(newFile);
    setFileContent(getDefaultFileContent(fileName));
    setIsEditing(true);
  };

  if (loading) {
    return (
      <div className="agent-environment">
        <div className="environment-header">
          <button onClick={onBack} className="back-button">← Back</button>
          <h2>Loading {agent.name}'s Environment...</h2>
        </div>
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  return (
    <div className="agent-environment">
      <div className="environment-header">
        <button onClick={onBack} className="back-button">← Back to Workers</button>
        <div className="agent-info">
          <span className="agent-avatar">{agent.avatar}</span>
          <div>
            <h2>{agent.name}</h2>
            <p>{agent.role}</p>
            <div className="agent-status">
              <span className={`status-indicator ${agent.status}`}></span>
              {agent.status} • Queue: {agent.queue || 0}
            </div>
          </div>
        </div>
        {agentDetails && (
          <div className="agent-details">
            <div className="specialties">
              {(agentDetails.specialties || []).map(specialty => (
                <span key={specialty} className="specialty-tag">{specialty}</span>
              ))}
            </div>
            <div className="current-task">
              {agentDetails.currentTask || 'No active task'}
            </div>
          </div>
        )}
      </div>

      <div className="environment-content">
        <div className="left-panel">
          <div className="file-explorer">
            <div className="explorer-header">
              <h3>📁 Workspace Files</h3>
              <button onClick={createNewFile} className="new-file-btn">+ New File</button>
            </div>
            <div className="file-list">
              {environmentData?.files?.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className={`file-item ${file.type} ${selectedFile?.name === file.name ? 'selected' : ''}`}
                  onClick={() => handleFileClick(file, index)}
                >
                  <span className="file-icon">
                    {file.type === 'directory' ?
                      (expandedDirs.has(`${file.name}-${index}`) ? '📂' : '📁') :
                      '📄'
                    }
                  </span>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">
                    {file.type === 'file' ? `${Math.round(file.size / 1024) || 0}KB` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="agent-chat">
            <h3>💬 Chat with {agent.name}</h3>
            <div className="chat-messages">
              {chatMessages.map(msg => (
                <div key={msg.id} className={`chat-message ${msg.type}`}>
                  <div className="message-header">
                    <span className="sender">{msg.type === 'user' ? 'You' : agent.name}</span>
                    <span className="timestamp">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="message-content">{msg.message}</div>
                </div>
              ))}
            </div>
            <div className="chat-input">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder={`Message ${agent.name}...`}
              />
              <button onClick={sendChatMessage}>Send</button>
            </div>
          </div>
        </div>

        <div className="right-panel">
          {selectedFile ? (
            <div className="file-editor">
              <div className="editor-header">
                <h3>📝 {selectedFile.name}</h3>
                <div className="editor-actions">
                  {isEditing ? (
                    <>
                      <button onClick={saveFileContent} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setIsEditing(false)}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setIsEditing(true)}>Edit</button>
                  )}
                </div>
              </div>
              <div className="editor-content">
                {isEditing ? (
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    className="code-editor"
                    rows={25}
                  />
                ) : (
                  <pre className="code-viewer">{fileContent}</pre>
                )}
              </div>
            </div>
          ) : (
            <div className="no-file-selected">
              <div className="welcome-message">
                <h3>Welcome to {agent.name}'s Workspace</h3>
                <p>Select a file from the left panel to view or edit it.</p>
                <p>Use the chat below to communicate directly with {agent.name}.</p>
                <div className="workspace-stats">
                  <div className="stat">
                    <span className="stat-number">{environmentData?.files?.length || 0}</span>
                    <span className="stat-label">Files</span>
                  </div>
                  <div className="stat">
                    <span className="stat-number">{agent.queue || 0}</span>
                    <span className="stat-label">Queue</span>
                  </div>
                  <div className="stat">
                    <span className="stat-number">{chatMessages.length - 1}</span>
                    <span className="stat-label">Messages</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentEnvironment;