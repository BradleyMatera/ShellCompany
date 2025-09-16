import React, { useState, useEffect, useCallback } from 'react';
import './AgentEnvironment.css';

const getFileIcon = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const iconMap = {
    'js': '🟨',
    'jsx': '⚛️',
    'ts': '🟦',
    'tsx': '⚛️',
    'html': '🌐',
    'css': '🎨',
    'scss': '🎨',
    'json': '📋',
    'md': '📝',
    'txt': '📄',
    'py': '🐍',
    'java': '☕',
    'cpp': '⚙️',
    'c': '⚙️',
    'png': '🖼️',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'gif': '🖼️',
    'svg': '🖼️',
    'pdf': '📕',
    'zip': '📦',
    'tar': '📦',
    'gz': '📦'
  };
  return iconMap[ext] || '📄';
};

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

  const loadAgentDetails = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/agents/${agent.id || agent.name.toLowerCase()}`);
      if (response.ok) {
        const data = await response.json();
        setAgentDetails(data.agent);
      }
    } catch (error) {
      console.error('Failed to load agent details:', error);
    }
  }, [agent]);

  const loadAgentEnvironment = useCallback(async () => {
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
  }, [agent]);

  const initializeChat = useCallback(() => {
    setChatMessages([
      {
        id: 1,
        type: 'agent',
        message: `Hi! I'm ${agent.name}, your ${agent.role}. I'm here to help with ${(agent.specialties || agent.capabilities || []).join(', ')}. How can I assist you today?`,
        timestamp: new Date().toISOString()
      }
    ]);
  }, [agent]);

  useEffect(() => {
    if (agent) {
      loadAgentEnvironment();
      loadAgentDetails();
      initializeChat();
    }
  }, [agent, loadAgentEnvironment, loadAgentDetails, initializeChat]);


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

  // initializeChat, loadAgentDetails, loadAgentEnvironment are defined via useCallback above

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
      // agentId not required here for the mocked contents

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

      // Enhanced save with lineage tracking
      const savePayload = {
        content: fileContent,
        metadata: {
          agentName: agent.name,
          editedBy: 'user',
          editedAt: new Date().toISOString(),
          size: fileContent.length,
          lineage: {
            action: 'file_edit',
            actor: 'user',
            agentWorkspace: agentId,
            timestamp: new Date().toISOString()
          }
        }
      };

      const response = await fetch(`http://localhost:3001/api/agents/${agentId}/files/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savePayload)
      });

      if (response.ok) {
        const result = await response.json();
        setIsEditing(false);

        // Update file metadata
        const updatedFile = {
          ...selectedFile,
          size: fileContent.length,
          modified: new Date().toISOString(),
          sha: result.sha || 'updated'
        };
        setSelectedFile(updatedFile);

        // Update file list
        const updatedFiles = environmentData.files.map(f =>
          f.name === selectedFile.name && f.parentDir === selectedFile.parentDir ? updatedFile : f
        );
        setEnvironmentData({ ...environmentData, files: updatedFiles });

        // Add success message to chat
        const successMessage = {
          id: Date.now(),
          type: 'agent',
          message: `✅ File ${selectedFile.name} saved successfully! SHA: ${result.sha?.substring(0, 8) || 'updated'}`,
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, successMessage]);

        console.log('File saved with lineage tracking:', result);
      } else {
        console.error('Failed to save file');
        const errorMessage = {
          id: Date.now(),
          type: 'agent',
          message: `❌ Failed to save ${selectedFile.name}. Please try again.`,
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
      const errorMessage = {
        id: Date.now(),
        type: 'agent',
        message: `❌ Error saving ${selectedFile.name}: ${error.message}`,
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMessage]);
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

      // Enhanced chat with context about current file and workspace
      const chatPayload = {
        message: currentInput,
        context: {
          agentName: agent.name,
          currentFile: selectedFile ? {
            name: selectedFile.name,
            type: selectedFile.type,
            size: selectedFile.size,
            parentDir: selectedFile.parentDir
          } : null,
          workspaceFiles: environmentData?.files?.length || 0,
          workspacePath: environmentData?.workspacePath,
          timestamp: new Date().toISOString()
        }
      };

      const response = await fetch(`http://localhost:3001/api/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatPayload)
      });

      if (response.ok) {
        const data = await response.json();
        const agentMessage = {
          id: Date.now() + 1,
          type: 'agent',
          message: data.message || data.response,
          timestamp: new Date().toISOString(),
          model: data.model,
          tokens: data.tokens,
          latency: data.latency
        };
        setChatMessages(prev => [...prev, agentMessage]);

        // If agent suggests file operations, handle them
        if (data.actions) {
          for (const action of data.actions) {
            if (action.type === 'create_file') {
              // Auto-create suggested files
              console.log('Agent suggested creating file:', action.filename);
            }
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = {
          id: Date.now() + 1,
          type: 'agent',
          message: errorData.error || "Sorry, I'm having trouble responding right now. Please try again.",
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, errorMessage]);
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
    const fileName = prompt('Enter file name (e.g., notes.md, config.json):');
    if (!fileName) return;

    // Validate filename
    if (fileName.includes('/') || fileName.includes('\\')) {
      alert('File name cannot contain path separators');
      return;
    }

    // Check if file already exists
    const existingFile = environmentData.files.find(f => f.name === fileName && !f.parentDir);
    if (existingFile) {
      const overwrite = window.confirm(`File ${fileName} already exists. Overwrite?`);
      if (!overwrite) return;
    }

    try {
      const agentId = agent.id || agent.name.toLowerCase();
      const defaultContent = getDefaultFileContent(fileName);

      // Create file with lineage tracking
      const createPayload = {
        content: defaultContent,
        metadata: {
          agentName: agent.name,
          createdBy: 'user',
          createdAt: new Date().toISOString(),
          size: defaultContent.length,
          lineage: {
            action: 'file_create',
            actor: 'user',
            agentWorkspace: agentId,
            timestamp: new Date().toISOString()
          }
        }
      };

      const response = await fetch(`http://localhost:3001/api/agents/${agentId}/files/${encodeURIComponent(fileName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload)
      });

      if (response.ok) {
        const result = await response.json();

        const newFile = {
          name: fileName,
          type: 'file',
          size: defaultContent.length,
          modified: new Date().toISOString(),
          sha: result.sha || 'new'
        };

        // Update file list
        const updatedFiles = existingFile ?
          environmentData.files.map(f => f.name === fileName && !f.parentDir ? newFile : f) :
          [...environmentData.files, newFile];

        setEnvironmentData({ ...environmentData, files: updatedFiles });
        setSelectedFile(newFile);
        setFileContent(defaultContent);
        setIsEditing(true);

        // Add success message to chat
        const successMessage = {
          id: Date.now(),
          type: 'agent',
          message: `✅ Created ${fileName}. Ready for editing!`,
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, successMessage]);

        console.log('File created with lineage tracking:', result);
      } else {
        console.error('Failed to create file');
        alert('Failed to create file. Please try again.');
      }
    } catch (error) {
      console.error('Failed to create file:', error);
      alert(`Error creating file: ${error.message}`);
    }
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
              {(agentDetails.specialties || []).map((specialty, idx) => (
                <span key={`${specialty}-${idx}`} className="specialty-tag">{specialty}</span>
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
                      getFileIcon(file.name)
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
        </div>

        <div className="center-panel">
          {selectedFile ? (
            <div className="file-editor">
              <div className="editor-header">
                <div className="file-info">
                  <h3>📝 {selectedFile.name}</h3>
                  <div className="file-path">{selectedFile.parentDir ? `${selectedFile.parentDir}/` : ''}{selectedFile.name}</div>
                </div>
                <div className="editor-actions">
                  {isEditing ? (
                    <>
                      <button onClick={saveFileContent} disabled={saving} className="save-btn">
                        {saving ? '💾 Saving...' : '💾 Save'}
                      </button>
                      <button onClick={() => setIsEditing(false)} className="cancel-btn">❌ Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setIsEditing(true)} className="edit-btn">✏️ Edit</button>
                      <button onClick={() => window.open(`data:text/plain;charset=utf-8,${encodeURIComponent(fileContent)}`, '_blank')} className="preview-btn">🔍 Download</button>
                    </>
                  )}
                </div>
              </div>
              <div className="editor-content">
                {isEditing ? (
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    className="code-editor"
                    placeholder="Start typing your content here..."
                  />
                ) : (
                  <pre className="code-viewer">{fileContent || 'File is empty. Click Edit to add content.'}</pre>
                )}
              </div>
              <div className="editor-status">
                <span className="status-info">
                  {fileContent.length} characters • {fileContent.split('\n').length} lines
                  {selectedFile.size && ` • ${Math.round(selectedFile.size / 1024) || 0}KB`}
                </span>
                <span className="last-modified">
                  {selectedFile.modified ? `Modified: ${new Date(selectedFile.modified).toLocaleString()}` : 'New file'}
                </span>
              </div>
            </div>
          ) : (
            <div className="no-file-selected">
              <div className="welcome-message">
                <h3>Welcome to {agent.name}'s Workspace</h3>
                <p>Select a file from the left panel to view or edit it.</p>
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
                <div className="quick-actions">
                  <button onClick={createNewFile} className="quick-action-btn">📄 New File</button>
                  <button onClick={() => loadAgentEnvironment()} className="quick-action-btn">🔄 Refresh</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="right-panel">
          <div className="agent-chat">
            <h3>💬 Chat with {agent.name}</h3>
            <div className="agent-specialty">
              Specializing in: {(agent.specialties || agent.capabilities || []).join(', ') || agent.role}
            </div>
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
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                placeholder={`Ask ${agent.name} about this file or workspace...`}
              />
              <button onClick={sendChatMessage} disabled={!chatInput.trim()}>Send</button>
            </div>
            <div className="quick-chat-actions">
              <button onClick={() => setChatInput('Tell me about this workspace')} className="quick-chat-btn">
                💼 About workspace
              </button>
              <button onClick={() => setChatInput('What files should I look at?')} className="quick-chat-btn">
                📋 File suggestions
              </button>
              {selectedFile && (
                <button onClick={() => setChatInput(`Explain the ${selectedFile.name} file`)} className="quick-chat-btn">
                  📄 Explain file
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentEnvironment;