// client/src/AppMVP.js
import React, { useState, useEffect } from 'react';
import MVPBoardRoom from './components/MVPBoardRoom';
import MVPAgents from './components/MVPAgents';
import MVPConsole from './components/MVPConsole';
import MVPProjects from './components/MVPProjects';

export default function AppMVP() {
  const [directives, setDirectives] = useState([]);

  const handleCreateDirective = async (data) => {
    const res = await fetch('/api/directives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const newDirective = await res.json();
    setDirectives([...directives, newDirective]);
  };

  const [modelProvider, setModelProvider] = useState('ollama');
  const [modelName, setModelName] = useState('llama3');
  const [ollamaModels, setOllamaModels] = useState([]);

  useEffect(() => {
    if (modelProvider === 'ollama') {
      fetch('/api/ollama/models')
        .then(res => res.json())
        .then(data => {
          setOllamaModels(Array.isArray(data.models) ? data.models : []);
          // If current modelName is not in the list, reset to first
          if (data.models && !data.models.includes(modelName)) {
            setModelName(data.models[0] || '');
          }
        })
        .catch(() => setOllamaModels([]));
    }
  }, [modelProvider, modelName]);

  const handleExecuteAgent = async (agentId, directiveId, options = {}) => {
    await fetch(`/api/agents/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        directiveId,
        modelProvider,
        modelName,
        ollamaOptions: options.ollamaOptions || {},
      }),
    });
    // Optionally refresh logs or status
  };

  return (
    <div>
      <h1>ShellCompany MVP Dashboard</h1>
      <div style={{ marginBottom: 16 }}>
        <label>Model Provider: </label>
        <select value={modelProvider} onChange={e => setModelProvider(e.target.value)}>
          <option value="ollama">Ollama (Cloud/Local)</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
        <label style={{ marginLeft: 16 }}>Model Name: </label>
        {modelProvider === 'ollama' ? (
          <select value={modelName} onChange={e => setModelName(e.target.value)}>
            {ollamaModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <input value={modelName} onChange={e => setModelName(e.target.value)} placeholder="llama3" />
        )}
      </div>
      <MVPBoardRoom onCreate={handleCreateDirective} />
      <MVPAgents onExecute={handleExecuteAgent} />
      <MVPConsole />
      <MVPProjects />
    </div>
  );
}
