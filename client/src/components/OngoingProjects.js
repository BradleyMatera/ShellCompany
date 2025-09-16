import React, { useState, useEffect, useCallback } from 'react';
import './OngoingProjects.css';

const normalizeProject = (p = {}) => ({
  id: p.id || p.name || (p.slug || Math.random().toString(36).slice(2, 9)),
  name: p.name || p.id || 'untitled',
  description: p.description || p.metadata?.description || '',
  status: p.status || (p.state === 'running' ? 'active' : 'inactive') || 'active',
  agent: p.agent || p.owner?.name || (p.workers && p.workers[0] && p.workers[0].id) || 'unknown',
  files: p.files || p.environment?.files || [],
  artifacts: p.artifacts || p.artifactList || [],
  metadata: p.metadata || {},
  relativePath: p.relativePath || p.file_system_path || p.path || '',
  lastModified: p.lastModified || p.modified || p.updatedAt || p.createdAt || new Date().toISOString(),
  type: p.type || 'service'
});

const OngoingProjects = () => {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [fileContent, setFileContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      let list = [];

      if (Array.isArray(data)) list = data.map(normalizeProject);
      else if (data?.workspaces) list = data.workspaces.flatMap(ws => (ws.projects || []).map(normalizeProject));
      else if (data?.projects) list = data.projects.map(normalizeProject);
      else if (data?.workflows) list = data.workflows.map(wf => normalizeProject({ id: wf.id, name: wf.directive || wf.id, description: wf.directive, status: wf.status, artifacts: wf.artifacts || [], agent: wf.agent || 'unknown' }));
      else if (data?.id && data?.name) list = [normalizeProject(data)];
      else if (data && typeof data === 'object') list = Object.values(data).flat().map(normalizeProject);

      setProjects(list);
    } catch (e) {
      console.error('fetchProjects error', e);
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const loadFileContent = async (project, file) => {
    if (!file || file.type === 'directory') return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.agent)}/${encodeURIComponent(project.name)}/files/${encodeURIComponent(file.path)}`);
      const text = await res.text();
      setFileContent(text); setSelectedFile(file); setIsEditing(false);
    } catch (e) {
      console.error('loadFileContent', e); setFileContent('Error loading file');
    }
  };

  const saveFileContent = async () => {
    if (!selectedProject || !selectedFile) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(selectedProject.agent)}/${encodeURIComponent(selectedProject.name)}/files/${encodeURIComponent(selectedFile.path)}`, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: fileContent });
  if (res.ok) { setIsEditing(false); fetchProjects(); }
    } catch (e) { console.error('saveFileContent', e); }
  };

  const downloadArtifact = async (project, file) => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.agent)}/${encodeURIComponent(project.name)}/files/${encodeURIComponent(file.path)}`);
      const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.name || 'file.bin'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { console.error('downloadArtifact', e); }
  };

  if (isLoading) return <div className="ongoing-projects"><div className="loading">🔄 Loading Projects...</div></div>;

  const filtered = projects.filter(p => filter === 'all' ? true : p.status === filter);

  return (
    <div className="ongoing-projects">
      <div className="projects-header">
        <h2>📂 Project Workspaces</h2>
        <div className="projects-controls">
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="in-development">In Development</option>
            <option value="setup-required">Setup Required</option>
            <option value="inactive">Inactive</option>
          </select>
          <button onClick={fetchProjects}>🔄 Refresh</button>
        </div>
      </div>

      {!selectedProject ? (
        filtered.length === 0 ? (
          <div className="projects-empty">No projects found</div>
        ) : (
          <div className="projects-grid">
            {filtered.map(p => (
              <div key={p.id} className="project-card" onClick={() => setSelectedProject(p)}>
                <div className="project-name">{p.name}</div>
                <div className="project-meta">Files: {p.files?.length || 0} • Artifacts: {p.artifacts?.length || 0}</div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="project-workspace">
          <button onClick={() => { setSelectedProject(null); setSelectedFile(null); setFileContent(''); setIsEditing(false); }}>← Back</button>
          <h3>{selectedProject.name} — {selectedProject.agent}</h3>
          <div className="workspace-columns">
            <div className="file-browser">
              <h4>Files</h4>
              <ul>
                {selectedProject.files?.map(f => (
                  <li key={f.path || f.name} onClick={() => loadFileContent(selectedProject, f)}>{f.name || f.path}</li>
                ))}
              </ul>
            </div>
            <div className="file-viewer">
              {selectedFile ? (
                <div>
                  <div className="viewer-header"><strong>{selectedFile.path || selectedFile.name}</strong></div>
                  {!isEditing ? <pre>{fileContent}</pre> : <textarea value={fileContent} onChange={e => setFileContent(e.target.value)} />}
                  <div>
                    {!isEditing ? <button onClick={() => setIsEditing(true)}>Edit</button> : <button onClick={saveFileContent}>Save</button>}
                    <button onClick={() => downloadArtifact(selectedProject, selectedFile)}>Download</button>
                  </div>
                </div>
              ) : (
                <div>Select a file to view</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OngoingProjects;
