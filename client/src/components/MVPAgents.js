// client/src/components/MVPAgents.js
import React, { useEffect, useState } from 'react';

export default function MVPAgents({ onExecute }) {
  const [agents, setAgents] = useState([]);
  const [selectedDirectiveId, setSelectedDirectiveId] = useState('');

  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        // Ensure agents is always an array
        if (Array.isArray(data)) {
          setAgents(data);
        } else {
          setAgents([]);
        }
      })
      .catch(() => setAgents([]));
  }, []);

  return (
    <div>
      <h2>Agents (MVP)</h2>
      <ul>
        {(Array.isArray(agents) ? agents : []).map(agent => (
          <li key={agent.id}>
            {agent.name} ({agent.status})
            <input
              type="text"
              placeholder="Directive ID"
              value={selectedDirectiveId}
              onChange={e => setSelectedDirectiveId(e.target.value)}
            />
            <button onClick={() => onExecute(agent.id, selectedDirectiveId)}>
              Execute
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
