import React, { useState, useEffect } from 'react';
import './AgentEnvironment.css';

const AgentEnvironment = ({ agentName, onClose }) => {
  const [fileTree, setFileTree] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [agentStatus, setAgentStatus] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  useEffect(() => {
    if (agentName) {
      loadAgentEnvironment();
      loadAgentStatus();
      loadChatHistory();
      // Expand all folders by default for debugging
      setExpandedFolders(new Set(['projects', 'docs', 'src', 'components', 'assets', 'temp']));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentName]);

  const loadAgentEnvironment = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3001/api/autonomous/agents/${agentName}/workspace`);
      if (!response.ok) {
        throw new Error(`Failed to load workspace: ${response.status}`);
      }
      const data = await response.json();
      // Use the fileTree from the workspace status (already properly structured)
      const fileTree = data.workspace?.fileTree || [];
      
      setFileTree(Array.isArray(fileTree) ? fileTree : (fileTree.children || []));
      setError(null);
    } catch (err) {
      console.error('Failed to load agent environment:', err);
      setError(err.message);
      setFileTree([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAgentStatus = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/autonomous/agents`);
      if (!response.ok) {
        throw new Error(`Failed to load agents: ${response.status}`);
      }
      const data = await response.json();
      
      // Find the specific agent
      const allAgents = [];
      if (data.departments) {
        Object.values(data.departments).forEach(deptAgents => {
          allAgents.push(...deptAgents);
        });
      }
      
      const agent = allAgents.find(a => a.name === agentName);
      setAgentStatus(agent || { status: 'unknown', name: agentName });
    } catch (err) {
      console.error('Failed to load agent status:', err);
      setAgentStatus({ status: 'unknown', name: agentName });
    }
  };

  const loadChatHistory = async () => {
    // Skip loading chat history for now - just initialize empty
    setChatMessages([]);
  };

  const loadFile = async (filePath) => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3001/api/autonomous/agents/${agentName}/workspace/files/${encodeURIComponent(filePath)}`);
      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.status}`);
      }
      const data = await response.json();
      setSelectedFile(filePath);
      setFileContent(data.file?.content || '');
      setError(null);
    } catch (err) {
      console.error('Failed to load file:', err);
      setError(err.message);
      setFileContent('');
    } finally {
      setLoading(false);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;

    try {
      setSaving(true);
      const response = await fetch(`http://localhost:3001/api/autonomous/agents/${agentName}/workspace/files/${encodeURIComponent(selectedFile)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: fileContent,
          metadata: { author: 'user' }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save file: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        await loadAgentEnvironment();
        await loadAgentStatus();
        setError(null);
      } else {
        throw new Error(data.error || 'Save failed');
      }
    } catch (err) {
      console.error('Failed to save file:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sendChatMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const response = await fetch(`http://localhost:3001/api/autonomous/agents/${agentName}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: newMessage,
          sender: 'user'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }

      const data = await response.json();
      setChatMessages(prev => [...prev, 
        { sender: 'user', message: newMessage, timestamp: new Date().toISOString() },
        { sender: agentName, message: data.message, timestamp: new Date().toISOString() }
      ]);
      setNewMessage('');
    } catch (err) {
      console.error('Failed to send chat message:', err);
      console.error('Failed to send chat message:', err);
      setError(err.message);
    }
  };

  const createNewFile = async () => {
    const fileName = prompt('Enter filename:');
    if (!fileName) return;

    try {
      const response = await fetch(`http://localhost:3001/api/autonomous/agents/${agentName}/workspace/files/${encodeURIComponent(fileName)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: `// New file created by ${agentName}\n// ${new Date().toISOString()}\n\n`,
          metadata: { author: 'user' }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create file: ${response.status}`);
      }

      await loadAgentEnvironment();
      await loadFile(fileName);
    } catch (err) {
      console.error('Failed to create file:', err);
      setError(err.message);
    }
  };

  const createNewFileInDirectory = async (directoryPath) => {
    const fileName = prompt('Enter filename:');
    if (!fileName) return;

    const fullPath = `${directoryPath}/${fileName}`;
    try {
      const response = await fetch(`http://localhost:3001/api/autonomous/agents/${agentName}/workspace/files/${encodeURIComponent(fullPath)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: `// New file created by ${agentName}\n// ${new Date().toISOString()}\n\n`,
          metadata: { author: 'user' }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to create file: ${response.status}`);
      }

      await loadAgentEnvironment();
      await loadFile(fullPath);
    } catch (err) {
      console.error('Failed to create file:', err);
      setError(err.message);
    }
  };

  const renameFile = async (filePath) => {
    const currentName = filePath.split('/').pop();
    const newName = prompt('Enter new filename:', currentName);
    if (!newName || newName === currentName) return;

    try {
      // For now, we'll implement rename as copy + delete
      // First, load the current file content
      const response = await fetch(`http://localhost:3001/api/autonomous/agents/${agentName}/workspace/files/${encodeURIComponent(filePath)}`);
      if (!response.ok) {
        throw new Error(`Failed to read file for rename: ${response.status}`);
      }
      
      const data = await response.json();
      const content = data.file?.content || '';

      // Create new file with new name
      const newPath = filePath.substring(0, filePath.lastIndexOf('/') + 1) + newName;
      const createResponse = await fetch(`http://localhost:3001/api/autonomous/agents/${agentName}/workspace/files/${encodeURIComponent(newPath)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content,
          metadata: { author: 'user' }
        })
      });

      if (!createResponse.ok) {
        throw new Error(`Failed to create renamed file: ${createResponse.status}`);
      }

      // Delete old file
      const deleteResponse = await fetch(`http://localhost:3001/api/autonomous/agents/${agentName}/workspace/files/${encodeURIComponent(filePath)}`, {
        method: 'DELETE'
      });

      if (!deleteResponse.ok) {
        console.warn('Failed to delete old file after rename, but new file created successfully');
      }

      await loadAgentEnvironment();
      if (selectedFile === filePath) {
        await loadFile(newPath);
      }
    } catch (err) {
      console.error('Failed to rename file:', err);
      setError(err.message);
    }
  };

  const deleteFile = async (filePath) => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm(`Are you sure you want to delete "${filePath.split('/').pop()}"?`)) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/autonomous/agents/${agentName}/workspace/files/${encodeURIComponent(filePath)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.status}`);
      }

      if (selectedFile === filePath) {
        setSelectedFile(null);
        setFileContent('');
      }

      await loadAgentEnvironment();
    } catch (err) {
      console.error('Failed to delete file:', err);
      setError(err.message);
    }
  };

  const toggleFolder = (folderPath) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js': return '📄';
      case 'jsx': return '⚛️';
      case 'ts': return '📘';
      case 'tsx': return '⚛️';
      case 'css': return '🎨';
      case 'html': return '🌐';
      case 'md': return '📝';
      case 'json': return '📋';
      case 'txt': return '📄';
      case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': return '🖼️';
      default: return '📄';
    }
  };

  const getFileIconClass = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return `file-icon ${ext || 'default'}`;
  };

  const isFileEmpty = (file) => {
    return !file.size || file.size === 0;
  };

  const isFileModified = (file) => {
    // Check if file was recently modified (within last hour)
    if (!file.modified) return false;
    const modifiedTime = new Date(file.modified);
    const now = new Date();
    return (now - modifiedTime) < (60 * 60 * 1000); // 1 hour
  };

  const renderFileTree = (items, depth = 0, parentPath = '') => {
    return items.map((item, index) => {
      const itemPath = parentPath ? `${parentPath}/${item.name}` : item.name;
      const isExpanded = expandedFolders.has(itemPath);

      return (
        <div key={index} className={`file-tree-item depth-${depth}`}>
          {item.type === 'directory' ? (
            <div className="directory">
              <div 
                className={`directory-header ${isExpanded ? 'expanded' : ''}`}
                onClick={() => toggleFolder(itemPath)}
              >
                <span className="expand-icon">
                  {isExpanded ? '📂' : '📁'}
                </span>
                <span className="directory-name">
                  {item.name}
                </span>
                <div className="file-hover-actions">
                  <button 
                    className="hover-action" 
                    title="New file"
                    onClick={(e) => {
                      e.stopPropagation();
                      createNewFileInDirectory(itemPath);
                    }}
                  >
                    +
                  </button>
                  <button 
                    className="hover-action" 
                    title="Refresh"
                    onClick={(e) => {
                      e.stopPropagation();
                      loadAgentEnvironment();
                    }}
                  >
                    🔄
                  </button>
                </div>
              </div>
              {isExpanded && item.children && (
                <div className="directory-children">
                  {renderFileTree(item.children, depth + 1, itemPath)}
                </div>
              )}
            </div>
          ) : (
            <div 
              className={`file ${selectedFile === item.path || selectedFile === itemPath ? 'selected' : ''}`}
              onClick={() => loadFile(item.path || itemPath)}
            >
              <span className={getFileIconClass(item.name)}>
                {getFileIcon(item.name)}
              </span>
              <span className="file-name">
                {item.name}
              </span>
              <span className="file-size">
                {item.size ? `${Math.round(item.size / 1024)}KB` : '0KB'}
              </span>
              {isFileEmpty(item) && (
                <span className="file-status empty" title="Empty file">○</span>
              )}
              {isFileModified(item) && (
                <span className="file-status modified" title="Recently modified">●</span>
              )}
              <div className="file-hover-actions">
                <button 
                  className="hover-action" 
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation();
                    renameFile(item.path || itemPath);
                  }}
                >
                  ✏️
                </button>
                <button 
                  className="hover-action" 
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFile(item.path || itemPath);
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          )}
        </div>
      );
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'idle': return '#28a745';
      case 'busy': return '#ffc107';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  };

  if (loading && !agentStatus) {
    return (
      <div className="agent-environment">
        <div className="environment-header">
          <h3>Loading {agentName} Environment...</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="loading-spinner">⏳ Initializing agent workspace...</div>
      </div>
    );
  }

  return (
    <div className="agent-environment">
      <div className="environment-header">
        <div className="agent-info">
          <h3>{agentName} Environment</h3>
          {agentStatus && (
            <div className="agent-status">
              <span 
                className="status-indicator"
                style={{ backgroundColor: getStatusColor(agentStatus.status) }}
              ></span>
              <span className="status-text">{agentStatus.status}</span>
              <span className="current-task">
                {agentStatus.currentTask ? `Working on: ${agentStatus.currentTask}` : 'No active task'}
              </span>
            </div>
          )}
        </div>
        <button onClick={onClose} className="close-btn">×</button>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="environment-content">
        <div className="file-explorer">
          <div className="explorer-header">
            <h4>📁 Workspace Files</h4>
            <button onClick={createNewFile} className="new-file-btn" title="Create new file">
              +
            </button>
            <button onClick={loadAgentEnvironment} className="refresh-btn" title="Refresh files">
              🔄
            </button>
          </div>
          <div className="file-tree">
            {fileTree.length > 0 ? renderFileTree(fileTree) : (
              <div className="empty-workspace">
                No files in workspace
                <button onClick={createNewFile} className="create-first-file">
                  Create first file
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="file-editor">
          <div className="editor-header">
            <h4>
              {selectedFile ? (
                <>
                  ✏️ {selectedFile}
                  <button 
                    onClick={saveFile} 
                    className={`save-btn ${saving ? 'saving' : ''}`}
                    disabled={saving}
                  >
                    {saving ? '💾 Saving...' : '💾 Save'}
                  </button>
                </>
              ) : (
                '📝 Select a file to edit'
              )}
            </h4>
          </div>
          <div className="editor-content">
            {selectedFile ? (
              fileContent.trim() === '' ? (
                <div className="empty-file-state">
                  <h3>📄 This file is empty</h3>
                  <p>Create content to get started with {selectedFile.split('/').pop()}</p>
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    className="code-editor"
                    placeholder="Start typing to add content to this file..."
                    spellCheck={false}
                  />
                </div>
              ) : (
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="code-editor"
                  placeholder="File content..."
                  spellCheck={false}
                />
              )
            ) : (
              <div className="no-file-selected">
                <h3>📝 No file selected</h3>
                <p>👈 Select a file from the workspace to start editing</p>
                <p>You can create, edit, and save files directly in {agentName}'s workspace.</p>
              </div>
            )}
          </div>
        </div>

        <div className="agent-chat">
          <div className="chat-header">
            <h4>💬 Chat with {agentName}</h4>
          </div>
          <div className="chat-messages">
            {chatMessages.length > 0 ? (
              chatMessages.map((msg, index) => (
                <div key={index} className={`chat-message ${msg.sender === 'user' ? 'user' : 'agent'}`}>
                  <div className="message-header">
                    <span className="sender">{msg.sender === 'user' ? 'You' : agentName}</span>
                    <span className="timestamp">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="message-content">{msg.message}</div>
                </div>
              ))
            ) : (
              <div className="no-messages">
                No conversation yet. Start chatting with {agentName}!
              </div>
            )}
          </div>
          <div className="chat-input">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
              placeholder={`Ask ${agentName} something...`}
              className="message-input"
            />
            <button onClick={sendChatMessage} className="send-btn">
              Send
            </button>
          </div>
        </div>
      </div>

      {agentStatus && (
        <div className="environment-footer">
          <div className="stats">
            <span>📊 Artifacts: {agentStatus.artifactsCreated || 0}</span>
            <span>✅ Tasks: {agentStatus.tasksCompleted || 0}</span>
            <span>💬 Messages: {agentStatus.messagesExchanged || 0}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentEnvironment;
