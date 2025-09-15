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
  const [currentPath, setCurrentPath] = useState('');

  useEffect(() => {
    loadAgentEnvironment();
  }, [agent]);

  const loadAgentEnvironment = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/autonomous/agents/${agent.name}/environment`);
      const data = await response.json();
      // Fix: Extract environment data from API response
      setEnvironmentData(data.environment || data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load agent environment:', error);
      setLoading(false);
    }
  };

  const handleFileClick = async (file) => {
    if (file.type === 'directory') {
      // Handle directory - expand/collapse and load contents
      const expanded = expandedDirs.has(file.path);
      const newExpanded = new Set(expandedDirs);
      if (expanded) {
        newExpanded.delete(file.path);
      } else {
        newExpanded.add(file.path);
        // Load directory contents
        await loadDirectoryContents(file.path, file.name);
      }
      setExpandedDirs(newExpanded);
    } else {
      // Handle file - load content
      await loadFileContent(file.path, file);
    }
  };

  const loadDirectoryContents = async (dirPath, dirName) => {
    try {
      console.log(`Loading directory contents: ${dirPath}`);
      console.log(`Workspace path: ${environmentData.workspacePath}`);
      
      // Extract relative path correctly
      const workspaceBase = environmentData.workspacePath;
      let relativePath = dirName; // For top-level directories, use just the directory name
      
      if (dirPath.startsWith(workspaceBase)) {
        relativePath = dirPath.substring(workspaceBase.length + 1); // Remove workspace base + trailing slash
      }
      
      console.log(`Relative path: ${relativePath}`);
      
      const response = await fetch(`/api/autonomous/agents/${agent.name}/directory/${encodeURIComponent(relativePath)}`);
      const data = await response.json();
      
      console.log(`Directory contents:`, data);
      
      // Add the directory contents to environmentData
      const updatedFiles = [...environmentData.files];
      const dirIndex = updatedFiles.findIndex(f => f.path === dirPath);
      if (dirIndex !== -1) {
        // Insert directory contents after the directory
        data.files.forEach((subFile, idx) => {
          updatedFiles.splice(dirIndex + 1 + idx, 0, {
            ...subFile,
            name: `  ${subFile.name}`, // Indent to show hierarchy
            isSubFile: true,
            parentDir: dirName,
            relativePath: `${relativePath}/${subFile.name}`
          });
        });
      }
      
      setEnvironmentData({
        ...environmentData,
        files: updatedFiles
      });
    } catch (error) {
      console.error('Failed to load directory contents:', error);
    }
  };

  const loadFileContent = async (filePath, file = null) => {
    try {
      // Determine the correct file path for API call
      let apiPath = filePath;
      
      // If it's a sub-file (from directory expansion), use the relativePath
      if (file && file.isSubFile && file.relativePath) {
        apiPath = file.relativePath;
        console.log(`Loading sub-file with relative path: ${apiPath}`);
      } else if (file && file.name && !filePath.includes('/')) {
        // For top-level files, just use the file name
        apiPath = file.name;
        console.log(`Loading top-level file: ${apiPath}`);
      }
      
      console.log(`Loading file content for: ${apiPath}`);
      const response = await fetch(`/api/autonomous/agents/${agent.name}/files/${encodeURIComponent(apiPath)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const content = await response.text();
      setFileContent(content);
      setSelectedFile(apiPath);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const saveFileContent = async () => {
    try {
      await fetch(`/api/autonomous/agents/${agent.name}/files/${encodeURIComponent(selectedFile)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: fileContent
      });
      setIsEditing(false);
      // Add lineage entry
      const lineageEntry = {
        timestamp: new Date().toISOString(),
        action: 'edited',
        file: selectedFile,
        agent: agent.name,
        note: 'Manual edit via Agent Environment'
      };
      console.log('File saved with lineage:', lineageEntry);
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    
    const newMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString()
    };
    
    setChatMessages(prev => [...prev, newMessage]);
    setChatInput('');
    
    try {
      const response = await fetch(`/api/autonomous/agents/${agent.name}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: chatInput })
      });
      
      const agentResponse = await response.json();
      setChatMessages(prev => [...prev, {
        role: 'agent',
        content: agentResponse.message,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      console.error('Failed to send chat message:', error);
    }
  };

  const runPreview = async () => {
    if (!selectedFile) return;
    
    try {
      const response = await fetch(`/api/autonomous/agents/${agent.name}/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          file: selectedFile,
          type: selectedFile.endsWith('.html') ? 'html' : 'general'
        })
      });
      
      const result = await response.json();
      window.open(result.previewUrl, '_blank');
    } catch (error) {
      console.error('Failed to run preview:', error);
    }
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
      case 'html': return '🌐';
      case 'css': return '🎨';
      case 'js': case 'jsx': case 'ts': case 'tsx': return '⚡';
      case 'json': return '📋';
      case 'md': return '📝';
      case 'png': case 'jpg': case 'jpeg': case 'gif': return '🖼️';
      default: return '📄';
    }
  };

  if (loading) {
    return (
      <div className="agent-environment">
        <div className="environment-header">
          <button onClick={onBack} className="back-button">← Back</button>
          <h2>Loading {agent.name}'s Environment...</h2>
        </div>
        <div className="loading">Loading agent workspace...</div>
      </div>
    );
  }

  return (
    <div className="agent-environment">
      <div className="environment-header">
        <button onClick={onBack} className="back-button">← Back</button>
        <div className="agent-info">
          <span className="agent-avatar-large">{agent.avatar}</span>
          <div className="agent-details">
            <h2>{agent.name}</h2>
            <p className="agent-role">{agent.role}</p>
            <div className="agent-status-badge status-{agent.status}">{agent.status}</div>
          </div>
        </div>
        <div className="environment-actions">
          <button onClick={loadAgentEnvironment} className="refresh-btn">🔄 Refresh</button>
        </div>
      </div>

      <div className="environment-content">
        {/* Left Panel: File Browser */}
        <div className="file-browser">
          <h3>📁 Workspace Files</h3>
          <div className="workspace-path">
            <code>{environmentData?.workspace || `/agent-workspaces/${agent.name.toLowerCase()}-workspace`}</code>
          </div>
          <div className="files-list">
            {environmentData?.files?.map(file => (
              <div 
                key={file.path} 
                className={`file-item ${selectedFile === file.path ? 'selected' : ''} ${file.type === 'directory' ? 'directory' : ''}`}
                onClick={() => handleFileClick(file)}
              >
                <span className="file-icon">
                  {file.type === 'directory' ? '📁' : getFileIcon(file.name)}
                </span>
                <span className="file-name">{file.name}</span>
                <span className="file-size">{file.type === 'directory' ? 'DIR' : `${file.size}B`}</span>
                <span className="file-modified">{new Date(file.modified).toLocaleDateString()}</span>
              </div>
            )) || (
              <div className="no-files">No files found in workspace</div>
            )}
          </div>
        </div>

        {/* Center Panel: File Editor */}
        <div className="file-editor">
          {selectedFile ? (
            <>
              <div className="editor-header">
                <span className="file-path">{selectedFile}</span>
                <div className="editor-actions">
                  {!isEditing ? (
                    <button onClick={() => setIsEditing(true)} className="edit-btn">✏️ Edit</button>
                  ) : (
                    <>
                      <button onClick={saveFileContent} className="save-btn">💾 Save</button>
                      <button onClick={() => setIsEditing(false)} className="cancel-btn">❌ Cancel</button>
                    </>
                  )}
                  <button onClick={runPreview} className="preview-btn">👀 Preview</button>
                </div>
              </div>
              <div className="editor-content">
                {isEditing ? (
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    className="code-editor"
                    spellCheck={false}
                  />
                ) : (
                  <pre className="code-viewer">
                    <code>{fileContent}</code>
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="no-file-selected">
              <h3>No file selected</h3>
              <p>Select a file from the workspace to view and edit its contents.</p>
            </div>
          )}
        </div>

        {/* Right Panel: Agent Chat & Status */}
        <div className="agent-chat">
          <h3>💬 Chat with {agent.name}</h3>
          <div className="agent-specialty">
            <strong>Specialties:</strong> {agent.specialty?.join(', ') || 'General'}
          </div>
          
          <div className="chat-messages">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                <div className="message-header">
                  <span className="message-role">{msg.role === 'agent' ? agent.name : 'You'}</span>
                  <span className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="message-content">{msg.content}</div>
              </div>
            ))}
            {chatMessages.length === 0 && (
              <div className="chat-placeholder">
                <p>Ask {agent.name} about their work, decisions, or request changes.</p>
                <p>Example: "Why did you structure the CSS this way?"</p>
              </div>
            )}
          </div>
          
          <div className="chat-input">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
              placeholder={`Ask ${agent.name} anything...`}
            />
            <button onClick={sendChatMessage} disabled={!chatInput.trim()}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentEnvironment;
