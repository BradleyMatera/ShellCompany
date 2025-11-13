import React from 'react';
import useEngineStatus from '../hooks/useEngineStatus';

export default function LocalEngineStatus() {
  const { capacity, providers, ollamaModels, fetchOllamaModels, error } = useEngineStatus();

  return (
    <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
      <div style={{ padding: 12, borderRadius: 8, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <h4 style={{ margin: 0, marginBottom: 8 }}>Engine Summary</h4>
        {!capacity && <p style={{ color: '#9CA3AF' }}>Unable to load status.</p>}
        {error && <p style={{ color: '#ef4444' }}>Error: {error}</p>}
        {capacity && (
          <div>
            <div>Active: <strong>{capacity.activeAgents || 0}</strong></div>
            <div>Queue: <strong>{capacity.queuedTasks || 0}</strong></div>
            <div style={{ marginTop: 8 }}>Providers:</div>
            <ul style={{ marginTop: 6 }}>
              {(providers || []).map(p => (
                <li key={p.key}>{p.name} — {p.status}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={{ padding: 12, borderRadius: 8, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <h4 style={{ margin: 0, marginBottom: 8 }}>Ollama Models</h4>
        {(!ollamaModels || ollamaModels.length === 0) && <p style={{ color: '#9CA3AF' }}>No models found (check Ollama server).</p>}
        {ollamaModels.length > 0 && (
          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            {ollamaModels.map(m => (
              <div key={m} style={{ padding: 8, borderRadius: 6, background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'monospace' }}>{m}</div>
                <div style={{ color: '#6b7280', fontSize: 12 }}>select</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
