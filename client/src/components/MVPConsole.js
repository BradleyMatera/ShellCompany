// client/src/components/MVPConsole.js
import React, { useEffect, useState } from 'react';

export default function MVPConsole() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    fetch('/api/logs').then(res => res.json()).then(setLogs);
    // TODO: Replace with WebSocket for real-time logs
  }, []);

  return (
    <div>
      <h2>Console (MVP)</h2>
      <ul>
        {logs.map(log => (
          <li key={log.id}>
            [{log.timestamp}] Agent {log.agentId} (Directive {log.directiveId}): {log.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
