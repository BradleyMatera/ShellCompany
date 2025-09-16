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
      // Fetch real workflow data from the autonomous API
      const res = await fetch('/api/autonomous/workflows');
      const data = await res.json();
      let list = [];

      if (data?.workflows) {
        // Deduplicate workflows by ID first
        const uniqueWorkflows = data.workflows.reduce((acc, wf) => {
          if (!acc.find(existing => existing.id === wf.id)) {
            acc.push(wf);
          }
          return acc;
        }, []);

        list = uniqueWorkflows.map(wf => normalizeProject({
          id: wf.id,
          name: wf.directive || `Workflow ${wf.id}`,
          description: wf.brief || wf.directive || '',
          status: wf.status || 'unknown',
          agent: wf.assignedManager || wf.managerId || 'unassigned',
          artifacts: wf.artifacts || [],
          files: wf.files || [],
          metadata: {
            ...wf.metadata,
            workflow: true,
            startedAt: wf.createdAt,
            managerBrief: wf.brief,
            clarificationNeeded: wf.clarificationRequired,
            ceoApproval: wf.status === 'waiting_for_ceo_approval'
          },
          lastModified: wf.updatedAt || wf.createdAt || new Date().toISOString(),
          type: 'workflow'
        }));
      }

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
      // Use workflow-aware file loading for workflow projects
      if (project.type === 'workflow') {
        const res = await fetch(`/api/autonomous/workflows/${project.id}/files/${encodeURIComponent(file.path)}`);
        const text = await res.text();
        setFileContent(text); setSelectedFile(file); setIsEditing(false);
      } else {
        const res = await fetch(`/api/projects/${encodeURIComponent(project.agent)}/${encodeURIComponent(project.name)}/files/${encodeURIComponent(file.path)}`);
        const text = await res.text();
        setFileContent(text); setSelectedFile(file); setIsEditing(false);
      }
    } catch (e) {
      console.error('loadFileContent', e); setFileContent('Error loading file');
    }
  };

  const saveFileContent = async () => {
    if (!selectedProject || !selectedFile) return;
    try {
      // Use workflow-aware file saving with lineage tracking
      if (selectedProject.type === 'workflow') {
        const payload = {
          content: fileContent,
          metadata: {
            lineage: {
              action: 'file_edit',
              actor: 'user',
              timestamp: new Date().toISOString(),
              workflowId: selectedProject.id
            }
          }
        };
        const res = await fetch(`/api/autonomous/workflows/${selectedProject.id}/files/${encodeURIComponent(selectedFile.path)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) { setIsEditing(false); fetchProjects(); }
      } else {
        const res = await fetch(`/api/projects/${encodeURIComponent(selectedProject.agent)}/${encodeURIComponent(selectedProject.name)}/files/${encodeURIComponent(selectedFile.path)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          body: fileContent
        });
        if (res.ok) { setIsEditing(false); fetchProjects(); }
      }
    } catch (e) { console.error('saveFileContent', e); }
  };

  const downloadArtifact = async (project, file) => {
    try {
      let res;
      if (project.type === 'workflow') {
        res = await fetch(`/api/autonomous/workflows/${project.id}/files/${encodeURIComponent(file.path)}`);
      } else {
        res = await fetch(`/api/projects/${encodeURIComponent(project.agent)}/${encodeURIComponent(project.name)}/files/${encodeURIComponent(file.path)}`);
      }
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
            <option value="planned">Planned</option>
            <option value="awaiting_clarification">Awaiting Clarification</option>
            <option value="in_progress">In Progress</option>
            <option value="executing">Executing</option>
            <option value="waiting_for_ceo_approval">CEO Approval</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="paused">Paused</option>
            <option value="rejected">Rejected</option>
          </select>
          <button onClick={fetchProjects}>🔄 Refresh</button>
        </div>
      </div>

      {!selectedProject ? (
        filtered.length === 0 ? (
          <div className="projects-empty">No projects found</div>
        ) : (
          <div className="projects-grid">
            {filtered.map((p, idx) => (
              <div key={`${p.id}-${idx}`} className="project-card" onClick={() => setSelectedProject(p)}>
                <div className="project-header">
                  <div className="project-name">{p.name}</div>
                  <div className="project-status">{p.status}</div>
                </div>
                <div className="project-description">{p.description}</div>
                <div className="project-meta">
                  Manager: {p.agent} • Files: {p.files?.length || 0} • Artifacts: {p.artifacts?.length || 0}
                  {p.metadata?.ceoApproval && <span className="ceo-flag"> • 👑 CEO Review</span>}
                  {p.metadata?.clarificationNeeded && <span className="clarify-flag"> • ❓ Clarification</span>}
                </div>
                <div className="project-timestamp">
                  Updated: {new Date(p.lastModified).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="project-workspace">
          <div className="workspace-header">
            <button onClick={() => { setSelectedProject(null); setSelectedFile(null); setFileContent(''); setIsEditing(false); }}>← Back</button>
            <div className="workspace-info">
              <h3>{selectedProject.name} — {selectedProject.agent}</h3>
              <div className="workspace-meta">
                Status: <span className="status-badge">{selectedProject.status}</span>
                {selectedProject.metadata?.workflow && (
                  <span className="workflow-links">
                    • <a href={`/agent-environment?agent=${selectedProject.agent}&project=${selectedProject.name}`}>Agent Environment</a>
                    • <a href={`/console?workflow=${selectedProject.id}`}>Console Logs</a>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="workspace-columns">
            <div className="file-browser">
              <h4>Files</h4>
              <ul>
                {selectedProject.files?.map((f, idx) => (
                  <li key={`${f.path || f.name}-${idx}`} onClick={() => loadFileContent(selectedProject, f)}>{f.name || f.path}</li>
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
