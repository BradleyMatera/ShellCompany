import React, { useState, useEffect } from 'react';
import './OngoingProjects.css';

const OngoingProjects = () => {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [originalContent, setOriginalContent] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/projects');
      const data = await response.json();
      console.log('Projects API response:', data);

      // Flatten projects from all workspaces
      const allProjects = data.workspaces.reduce((acc, workspace) => {
        return acc.concat(workspace.projects);
      }, []);

      setProjects(allProjects);
      setStats(data.stats);

    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setProjects([]);
    }
    setIsLoading(false);
  };

  const loadFileContent = async (project, file) => {
    if (file.type === 'directory') return;

    try {
      const response = await fetch(`http://localhost:3001/api/projects/${project.agent}/${project.name}/files/${encodeURIComponent(file.path)}`);
      const content = await response.text();
      setFileContent(content);
      setOriginalContent(content);
      setSelectedFile(file);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to load file content:', error);
      setFileContent('Error loading file content');
    }
  };

  const saveFileContent = async () => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/projects/${selectedProject.agent}/${selectedProject.name}/files/${encodeURIComponent(selectedFile.path)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          body: fileContent
        }
      );

      if (response.ok) {
        setOriginalContent(fileContent);
        setIsEditing(false);
        // Refresh the project to update file metadata
        fetchProjects();
      } else {
        console.error('Failed to save file');
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  const downloadArtifact = async (project, artifact) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/projects/${project.agent}/${project.name}/files/${encodeURIComponent(artifact.path)}`
      );
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = artifact.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download artifact:', error);
    }
  };

  const runProjectCommand = async (command) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/projects/${selectedProject.agent}/${selectedProject.name}/commands`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command })
        }
      );

      const result = await response.json();
      if (result.success) {
        console.log('Command output:', result.output);
        // Refresh projects to see any changes
        fetchProjects();
      } else {
        console.error('Command failed:', result.error);
      }

      return result;
    } catch (error) {
      console.error('Failed to run command:', error);
      return { success: false, error: error.message };
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#22c55e';
      case 'in-development': return '#3b82f6';
      case 'setup-required': return '#f59e0b';
      case 'inactive': return '#6c757d';
      case 'active': return '#10b981';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✅';
      case 'in-development': return '🔧';
      case 'setup-required': return '⚙️';
      case 'inactive': return '💤';
      case 'active': return '🟢';
      default: return '❓';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'dashboard': return '📊';
      case 'api': return '🔌';
      case 'website': return '🌐';
      case 'landing-page': return '🎯';
      case 'component': return '🧩';
      case 'service': return '⚡';
      default: return '📁';
    }
  };

  const filteredProjects = projects.filter(project => {
    if (filter === 'all') return true;
    return project.status === filter;
  });

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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

  if (isLoading) {
    return (
      <div className="ongoing-projects">
        <div className="loading">🔄 Loading Projects...</div>
      </div>
    );
  }

  return (
    <div className="ongoing-projects">
      <div className="projects-header">
        <div className="projects-title">
          <h2>📂 Project Workspaces</h2>
          <div className="projects-status">
            <span className="projects-count">{filteredProjects.length} projects</span>
            {stats && (
              <span className="projects-stats">
                • {stats.totalFiles} files • {stats.totalArtifacts} artifacts
              </span>
            )}
          </div>
        </div>

        <div className="projects-controls">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Projects</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="in-development">In Development</option>
            <option value="setup-required">Setup Required</option>
            <option value="inactive">Inactive</option>
          </select>

          <button onClick={fetchProjects} className="refresh-btn">
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="projects-content">
        {!selectedProject ? (
          filteredProjects.length === 0 ? (
            <div className="projects-empty">
              <div className="empty-icon">📂</div>
              <h3>No Projects Found</h3>
              <p>
                {filter === 'all'
                  ? 'No project workspaces found. Create projects through agent workflows to see them here.'
                  : `No ${filter} projects found. Try adjusting the filter.`
                }
              </p>
            </div>
          ) : (
            <div className="projects-grid">
              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  className={`project-card ${project.status}`}
                  onClick={() => setSelectedProject(project)}
                >
                  <div className="project-header">
                    <div className="project-type">
                      <span className="type-icon">{getTypeIcon(project.type)}</span>
                      <span className="type-text">{project.type}</span>
                    </div>
                    <div className="project-status">
                      <span className="status-icon">{getStatusIcon(project.status)}</span>
                      <span className="status-text">{project.status}</span>
                    </div>
                  </div>

                  <div className="project-content">
                    <h3 className="project-name">{project.name}</h3>
                    <div className="project-agent">
                      <span className="agent-badge">👤 {project.agent}</span>
                    </div>

                    {project.metadata?.description && (
                      <p className="project-description">{project.metadata.description}</p>
                    )}

                    <div className="project-meta">
                      <div className="meta-item">
                        <span className="meta-label">Files:</span>
                        <span className="meta-value">{project.files?.length || 0}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Artifacts:</span>
                        <span className="meta-value">{project.artifacts?.length || 0}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Modified:</span>
                        <span className="meta-value">{formatDate(project.lastModified)}</span>
                      </div>
                    </div>

                    {project.metadata?.scripts && Object.keys(project.metadata.scripts).length > 0 && (
                      <div className="project-scripts">
                        <strong>Available Scripts:</strong>
                        <div className="script-tags">
                          {Object.keys(project.metadata.scripts).slice(0, 3).map(script => (
                            <span key={script} className="script-tag">{script}</span>
                          ))}
                          {Object.keys(project.metadata.scripts).length > 3 && (
                            <span className="script-tag more">+{Object.keys(project.metadata.scripts).length - 3}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="project-workspace">
            <div className="workspace-header">
              <button
                onClick={() => {
                  setSelectedProject(null);
                  setSelectedFile(null);
                  setFileContent('');
                  setIsEditing(false);
                }}
                className="back-btn"
              >
                ← Back to Projects
              </button>

              <div className="project-info">
                <h2>{getTypeIcon(selectedProject.type)} {selectedProject.name}</h2>
                <div className="project-details">
                  <span className="agent-info">👤 {selectedProject.agent}</span>
                  <span className={`status-badge ${selectedProject.status}`}>
                    {getStatusIcon(selectedProject.status)} {selectedProject.status}
                  </span>
                  <span className="project-path">📁 {selectedProject.relativePath}</span>
                </div>
              </div>

              <div className="workspace-actions">
                {selectedProject.metadata?.scripts && (
                  <div className="quick-commands">
                    {Object.keys(selectedProject.metadata.scripts).slice(0, 2).map(script => (
                      <button
                        key={script}
                        onClick={() => runProjectCommand(`npm run ${script}`)}
                        className="command-btn"
                      >
                        ▶️ {script}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={fetchProjects} className="refresh-btn">
                  🔄 Refresh
                </button>
              </div>
            </div>

            <div className="workspace-content">
              <div className="file-browser">
                <div className="browser-header">
                  <h3>📁 Project Files ({selectedProject.files?.length || 0})</h3>
                </div>
                <div className="file-list">
                  {selectedProject.files?.map(file => (
                    <div
                      key={file.path}
                      className={`file-item ${file.type} ${selectedFile?.path === file.path ? 'selected' : ''}`}
                      onClick={() => loadFileContent(selectedProject, file)}
                    >
                      <div className="file-icon">
                        {file.type === 'directory' ? '📁' : '📄'}
                      </div>
                      <div className="file-details">
                        <div className="file-name">{file.name}</div>
                        {file.type === 'file' && (
                          <div className="file-meta">
                            {formatFileSize(file.size)} • {new Date(file.modified).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="file-viewer">
                {selectedFile ? (
                  <div className="viewer-content">
                    <div className="viewer-header">
                      <div className="file-path">
                        <span className="path-text">📄 {selectedFile.path}</span>
                        <span className="file-size">{formatFileSize(selectedFile.size)}</span>
                      </div>
                      <div className="viewer-actions">
                        {!isEditing ? (
                          <>
                            <button
                              onClick={() => setIsEditing(true)}
                              className="edit-btn"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => downloadArtifact(selectedProject, selectedFile)}
                              className="download-btn"
                            >
                              ⬇️ Download
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={saveFileContent}
                              className="save-btn"
                            >
                              💾 Save
                            </button>
                            <button
                              onClick={() => {
                                setFileContent(originalContent);
                                setIsEditing(false);
                              }}
                              className="cancel-btn"
                            >
                              ❌ Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <textarea
                        value={fileContent}
                        onChange={(e) => setFileContent(e.target.value)}
                        className="code-editor"
                        placeholder="File content..."
                      />
                    ) : (
                      <pre className="code-viewer">{fileContent}</pre>
                    )}
                  </div>
                ) : (
                  <div className="no-file-selected">
                    <h3>Select a File</h3>
                    <p>Choose a file from the browser to view or edit its contents.</p>

                    {selectedProject.artifacts?.length > 0 && (
                      <div className="artifacts-preview">
                        <h4>📦 Key Artifacts ({selectedProject.artifacts.length})</h4>
                        <div className="artifact-list">
                          {selectedProject.artifacts.slice(0, 5).map(artifact => (
                            <div key={artifact.id} className="artifact-item">
                              <span className="artifact-icon">
                                {artifact.type === 'folder' ? '📁' :
                                 artifact.category === 'source' ? '💻' :
                                 artifact.category === 'style' ? '🎨' :
                                 artifact.category === 'docs' ? '📖' : '📄'}
                              </span>
                              <span className="artifact-name">{artifact.name}</span>
                              <span className="artifact-category">{artifact.category}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default OngoingProjects;
