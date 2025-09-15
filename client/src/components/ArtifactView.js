import React, { useEffect, useState } from 'react';

const ArtifactView = ({ artifactId, onBack }) => {
  const [artifact, setArtifact] = useState(null);
  const [lineage, setLineage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const r = await fetch(`http://localhost:3001/api/autonomous/artifacts/${artifactId}`, { credentials: 'include' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = await r.json();
        setArtifact(body.artifact || null);
        setLineage(body.lineage || null);
      } catch (e) {
        setError(e.message || 'Failed to load artifact');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [artifactId]);

  if (loading) return (<div className="artifact-view"><p>Loading artifact...</p></div>);
  if (error) return (<div className="artifact-view"><p>Error: {error}</p><button onClick={onBack}>Back</button></div>);

  return (
    <div className="artifact-view">
      <button onClick={onBack}>← Back</button>
      <h3>Artifact {artifactId}</h3>
      {artifact ? (
        <div className="artifact-meta">
          <p><strong>DB ID:</strong> {artifact.id}</p>
          <p><strong>SHA256:</strong> {artifact.sha256}</p>
          <p><strong>Project ID:</strong> {artifact.project_id}</p>
          <p><strong>Created At:</strong> {artifact.createdAt}</p>
          <p><strong>Path:</strong> {artifact.path || 'N/A'}</p>
          <p><strong>Size:</strong> {artifact.size || 'N/A'}</p>
        </div>
      ) : (
        <div className="artifact-meta">
          <p>No DB artifact row found (this may be a pending artifact).</p>
        </div>
      )}

      <h4>Lineage</h4>
      {lineage ? (
        <div className="artifact-lineage">
          <p><strong>Lineage ID:</strong> {lineage.id}</p>
          <p><strong>Agent:</strong> {lineage.agent}</p>
          <p><strong>Absolute Path:</strong> {lineage.absolutePath}</p>
          <p><strong>Checksum:</strong> {lineage.checksum || lineage.sha256}</p>
          <pre style={{whiteSpace: 'pre-wrap'}}>{JSON.stringify(lineage, null, 2)}</pre>
          <div style={{marginTop: 12}}>
            { (lineage.metadata && lineage.metadata.absolutePath) || (artifact && artifact.path) ? (
              <a
                href={`http://localhost:3001/api/autonomous/artifacts/${artifactId}/file`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => { /* allow browser to handle download via anchor */ }}
                className="download-button"
              >
                Download File
              </a>
            ) : (
              <span title="No file path available">No downloadable file available</span>
            ) }
          </div>
        </div>
      ) : (
        <p>No lineage information available.</p>
      )}
    </div>
  );
};

export default ArtifactView;
