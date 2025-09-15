import React, { useState, useEffect, useMemo } from 'react';
import './EngineStatus.css';

const fetchJsonSafe = async (url, options) => {
  const res = await fetch(url, options);
  const status = res.status;
  const text = await res.text().catch(() => '');
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = null; }
  const ok = res.ok && !!json;
  return { ok, status, json, text, headers: res.headers };
};

const INTEGRATION_NOTES = {
  openai: 'Used by Nova (frontend/coding) via agent-engine; typical models: gpt-4o / gpt-4o-mini.',
  openai_project: 'OpenAI Projects key; same models as OpenAI with per-project quotas.',
  claude: 'Used for planning/reasoning; typical models: claude-sonnet-4-20250514, claude-3-5-haiku-20241022.',
  gemini: 'Used for research/fast drafts; typical models: models/gemini-1.5-pro-latest, models/gemini-1.5-flash.',
  xai: 'xAI Grok integration; typical models: grok-4, grok-3, grok-3-mini.'
};

const formatAgo = (ts) => {
  if (!ts) return 'never';
  const delta = Date.now() - ts;
  if (delta < 1000) return 'just now';
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
};

const percent = (num, den) => {
  if (!den || den === 0) return 0;
  return Math.min(100, Math.round((num / den) * 100));
};

const getStatusColor = (status) => {
  switch (status) {
    case 'online': return '#22c55e'; // green
    case 'limited': return '#f59e0b'; // yellow
    case 'offline': return '#ef4444'; // red
    default: return '#6b7280'; // gray
  }
};

const getUtilizationColor = (percentage) => {
  if (percentage < 50) return '#22c55e';      // green
  if (percentage < 90) return '#f59e0b';      // yellow
  return '#ef4444';                           // red
};

const ProviderCard = ({
  provider,
  onTest,
  onFetchLogs,
  logs = [],
  isSelected,
  onSelect,
  modelOptions = [],
  onChangeModel,
  costMode = 'balanced',
  onChangeCostMode,
  modelLabels = {}
}) => {
  const tokenCapNA = provider.tokensLimit == null;
  const tokenUtil = tokenCapNA ? 0 : percent(provider.tokensUsed || 0, provider.tokensLimit);
  const reqUtil = percent(provider.requestsPerMinute || 0, provider.requestsLimit || 1);

  const errorRatePct = Math.round((provider.errorRate || 0) * 1000) / 10; // 1 decimal

  const lastAgent = useMemo(() => {
    const lastCall = (logs || []).slice().reverse().find(l => l.action === 'call');
    return lastCall?.agentName || null;
  }, [logs]);

  return (
    <div
      className={`provider-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(provider.key)}
      title="Click to focus this provider and view logs"
      style={{ cursor: 'pointer' }}
    >
      <div className="provider-header">
        <div className="provider-name">
          <div className="status-dot" style={{ backgroundColor: getStatusColor(provider.status) }} />
          <span>{provider.name}</span>
        </div>
        <div className="provider-model" title="Current model being used by this provider">
          {provider.currentModel || 'unknown'}
        </div>
      </div>

      <div className="provider-metrics">
        <div className="metric" title="Token usage today from real calls. Token cap is not provided by most APIs; shows 'n/a' when unavailable.">
          <div className="metric-header">
            <span>Tokens</span>
            <span>{tokenCapNA ? 'n/a' : `${tokenUtil}%`}</span>
          </div>
          <div className="metric-bar">
            <div
              className="metric-fill"
              style={{
                width: `${tokenCapNA ? 0 : tokenUtil}%`,
                backgroundColor: tokenCapNA ? '#6b7280' : getUtilizationColor(tokenUtil)
              }}
            />
          </div>
          <div className="metric-detail">
            {(provider.tokensUsed || 0).toLocaleString()} / {provider.tokensLimit == null ? 'n/a' : (provider.tokensLimit).toLocaleString()}
          </div>
        </div>

        <div className="metric" title="Requests per minute in the last 60s window. >90% turns red and risks 429s.">
          <div className="metric-header">
            <span>Req/min</span>
            <span>{reqUtil}%</span>
          </div>
          <div className="metric-bar">
            <div
              className="metric-fill"
              style={{ width: `${reqUtil}%`, backgroundColor: getUtilizationColor(reqUtil) }}
            />
          </div>
          <div className="metric-detail">
            {provider.requestsPerMinute || 0} / {provider.requestsLimit || 0}
          </div>
        </div>

        <div className="provider-footer">
          <span className="last-response" title="Most recent successful response time">
            Last: {formatAgo(provider.lastResponse)}{provider.lastLatencyMs ? ` (${provider.lastLatencyMs}ms)` : ''}
          </span>
          <span className="error-rate" title="Error rate over last 10 minutes">
            Error: {errorRatePct.toFixed(1)}%
          </span>
        </div>

        <div className="provider-capacity" title="Current in-flight calls vs allowed concurrency">
          <span>In-flight: {provider.inFlight || 0}/{provider.maxConcurrent || 0}</span>
          {lastAgent ? <span style={{ marginLeft: 8, opacity: 0.8 }}>Last agent: {lastAgent}</span> : null}
        </div>

        <div className="provider-actions">
          <button
            className="btn"
            onClick={(e) => { e.stopPropagation(); onTest(provider.key); }}
            title="Run a live echo test to validate this provider"
          >
            Test Provider
          </button>
          <button
            className="btn secondary"
            onClick={(e) => { e.stopPropagation(); onFetchLogs(provider.key); }}
            title="Fetch last API calls for this provider"
          >
            View Logs
          </button>
        </div>

        <div className="provider-model-select" title="Select preferred model for this provider">
          <label style={{ marginRight: 6 }}>Model:</label>
          <select
            value={provider.preferredModel || provider.currentModel || ''}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); onChangeModel && onChangeModel(provider.key, e.target.value); }}
          >
            {(modelOptions || []).map(m => {
              const tier = modelLabels && modelLabels[m] ? ` (${modelLabels[m]})` : '';
              return <option key={m} value={m}>{m}{tier}</option>;
            })}
          </select>
        </div>

        <div className="provider-costmode-select" title="Select cost mode (affects automatic model selection in agents)">
          <label style={{ marginRight: 6 }}>Cost:</label>
          <select
            value={costMode}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); onChangeCostMode && onChangeCostMode(provider.key, e.target.value); }}
          >
            <option value="economy">Economy</option>
            <option value="balanced">Balanced</option>
            <option value="premium">Premium</option>
          </select>
        </div>

        <div className="integration-note" title="How this provider is wired into the orchestrator and agent-engine">
          {INTEGRATION_NOTES[provider.key] || 'Integrated via agent-engine routing and orchestrator model selection.'}
        </div>

        {(provider.lastError || provider.lastStatusCode) && (
          <div className="provider-error" title="Most recent error observed for this provider">
            ⚠️ {provider.lastStatusCode ? `HTTP ${provider.lastStatusCode} — ` : ''}{provider.lastError || 'Error'}
          </div>
        )}
        {provider.lastHint ? (
          <div className="provider-hint" title="Hint for remediation">
            💡 {provider.lastHint}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const EngineStatus = ({ className }) => {
  const [providers, setProviders] = useState([]);
  const [capacity, setCapacity] = useState({
    activeAgents: 0,
    maxConcurrent: 0,
    queuedTasks: 0,
    completedToday: 0
  });
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [logs, setLogs] = useState({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const [models, setModels] = useState({});
  const [policies, setPolicies] = useState({});

  const fetchStatus = async ({ ping = false } = {}) => {
    try {
      setLoading(true);
      const url = `/api/engine/status${ping ? '?ping=true' : ''}`;
      const { ok, status, json, text } = await fetchJsonSafe(url);
      if (!ok) {
        try {
          await fetch('/api/engine/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'engine',
              action: 'status_fetch',
              success: false,
              statusCode: status,
              error: (json && json.error) || 'Non-JSON or error response from backend',
              snippet: (text || '').slice(0, 200)
            })
          });
        } catch {}
        throw new Error((json && json.error) || `Backend returned non-JSON (HTTP ${status}). See server logs.`);
      }
      setProviders(Array.isArray(json.providers) ? json.providers : []);
      setCapacity(json.capacity || { activeAgents: 0, maxConcurrent: 0, queuedTasks: 0, completedToday: 0 });
      setError(null);
    } catch (error) {
      console.error('Failed to fetch engine status:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (providerKey, limit = 50) => {
    try {
      const { ok, status, json, text } = await fetchJsonSafe(`/api/engine/logs?provider=${encodeURIComponent(providerKey)}&limit=${limit}`);
      if (!ok) {
        try {
          await fetch('/api/engine/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: providerKey,
              action: 'logs_fetch',
              success: false,
              statusCode: status,
              error: (json && json.error) || 'Non-JSON or error response from backend',
              snippet: (text || '').slice(0, 200)
            })
          });
        } catch {}
        console.error('Failed to fetch logs:', (json && json.error) || `HTTP ${status}`);
        return;
      }
      setLogs(prev => ({ ...prev, [providerKey]: (json.logs || []) }));
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    }
  };

  const fetchModels = async () => {
    try {
      const { ok, status, json, text } = await fetchJsonSafe('/api/engine/models');
      if (!ok) {
        try {
          await fetch('/api/engine/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'engine',
              action: 'models_fetch',
              success: false,
              statusCode: status,
              error: (json && json.error) || 'Non-JSON or error response from backend',
              snippet: (text || '').slice(0, 200)
            })
          });
        } catch {}
        return;
      }
      setModels(json || {});
    } catch (e) {
      // ignore; status will still render
      console.error('Failed to fetch models:', e);
    }
  };

  const fetchPolicies = async () => {
    try {
      const { ok, status, json, text } = await fetchJsonSafe('/api/engine/policies');
      if (!ok) {
        try {
          await fetch('/api/engine/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: 'engine',
              action: 'policies_fetch',
              success: false,
              statusCode: status,
              error: (json && json.error) || 'Failed to fetch policies',
              snippet: (text || '').slice(0, 200)
            })
          });
        } catch {}
        return;
      }
      setPolicies(json || {});
    } catch (e) {
      console.error('Failed to fetch policies:', e);
    }
  };

  const changeModel = async (providerKey, model) => {
    try {
      const { ok, status, json, text } = await fetchJsonSafe(`/api/engine/provider/${encodeURIComponent(providerKey)}/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      });
      if (!ok) {
        try {
          await fetch('/api/engine/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: providerKey,
              action: 'set_preferred_model',
              success: false,
              statusCode: status,
              error: (json && json.error) || 'Failed to set preferred model',
              snippet: (text || '').slice(0, 200)
            })
          });
        } catch {}
      } else {
        setTestResult({ provider: providerKey, ok: true, latencyMs: 0, snippet: `Preferred model set to ${model}`, model });
      }
      await fetchStatus();
      await fetchModels();
      await fetchLogs(providerKey, 50);
    } catch (e) {
      console.error('Failed to set preferred model:', e);
      setTestResult({ provider: providerKey, ok: false, error: e.message });
    }
  };

  const changeCostMode = async (providerKey, mode) => {
    try {
      const { ok, status, json, text } = await fetchJsonSafe(`/api/engine/provider/${encodeURIComponent(providerKey)}/cost-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      if (!ok) {
        try {
          await fetch('/api/engine/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: providerKey,
              action: 'set_cost_mode',
              success: false,
              statusCode: status,
              error: (json && json.error) || 'Failed to set cost mode',
              snippet: (text || '').slice(0, 200)
            })
          });
        } catch {}
      } else {
        setPolicies(prev => ({ ...prev, [providerKey]: mode }));
        setTestResult({ provider: providerKey, ok: true, latencyMs: 0, snippet: `Cost mode set to ${mode}` });
      }
      await fetchStatus();
      await fetchModels();
      await fetchPolicies();
      await fetchLogs(providerKey, 50);
    } catch (e) {
      console.error('Failed to set cost mode:', e);
      setTestResult({ provider: providerKey, ok: false, error: e.message });
    }
  };

  const testProvider = async (providerKey) => {
    try {
      setTesting(prev => ({ ...prev, [providerKey]: true }));
      setTestResult(null);
      const { ok, status, json, text } = await fetchJsonSafe(`/api/engine/test/${encodeURIComponent(providerKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Echo test: Hello from ShellCompany Engine Status.' })
      });
      if (!ok || json.success === false) {
        try {
          await fetch('/api/engine/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: providerKey,
              action: 'test',
              success: false,
              statusCode: json.statusCode || status,
              error: (json && json.error) || 'Non-JSON or error response from backend',
              snippet: (text || '').slice(0, 200)
            })
          });
        } catch {}
        setTestResult({ provider: providerKey, ok: false, error: (json && json.error) || `Backend returned non-JSON (HTTP ${status}). See server logs.` });
      } else {
        setTestResult({
          provider: providerKey,
          ok: true,
          latencyMs: json.latencyMs,
          snippet: json.snippet,
          model: json.model
        });
      }
      // Refresh status and logs after test
      await fetchStatus();
      await fetchLogs(providerKey, 50);
    } catch (e) {
      setTestResult({ provider: providerKey, ok: false, error: e.message });
    } finally {
      setTesting(prev => ({ ...prev, [providerKey]: false }));
    }
  };

  const handleSelect = (providerKey) => {
    setSelectedProvider(providerKey);
    fetchLogs(providerKey, 100);
  };

  useEffect(() => {
    // Initial: ping providers then load status
    fetchStatus({ ping: true });
    fetchModels();
    fetchPolicies();
    const interval = setInterval(() => fetchStatus(), 5000); // live refresh
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh logs for the selected provider every 5s
  useEffect(() => {
    if (!selectedProvider) return;
    const id = setInterval(() => fetchLogs(selectedProvider, 100), 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

  const filteredProviders = useMemo(() => {
    if (!selectedProvider) return providers;
    return providers.filter(p => p.key === selectedProvider);
  }, [providers, selectedProvider]);

  return (
    <div className={`engine-status ${className || ''}`}>
      <div className="engine-header">
        <h3>Engine Status & Capacity</h3>

        <div className="capacity-summary">
          <span className="capacity-item" title="Agents currently running tasks / total agents available">
            <span className="capacity-label">Active:</span>
            <span className="capacity-value">{capacity.activeAgents}/{capacity.maxConcurrent}</span>
          </span>
          <span className="capacity-item" title="Tasks currently waiting to be executed">
            <span className="capacity-label">Queue:</span>
            <span className="capacity-value">{capacity.queuedTasks}</span>
          </span>
          <span className="capacity-item" title="Completed workflows (today)">
            <span className="capacity-label">Today:</span>
            <span className="capacity-value">{capacity.completedToday || 0}</span>
          </span>
        </div>

        <div className="engine-actions">
          <button className="btn" onClick={() => fetchStatus({ ping: true })} title="Ping all providers and refresh metrics now">
            Refresh & Ping
          </button>
          <select
            className="provider-filter"
            value={selectedProvider || ''}
            onChange={(e) => setSelectedProvider(e.target.value || null)}
            title="Filter metrics to a single provider"
          >
            <option value="">All Providers</option>
            {providers.map(p => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          Failed to load engine status: {error}
        </div>
      )}

      <div className="providers-grid">
        {filteredProviders.map((provider) => (
          <ProviderCard
            key={provider.key}
            provider={provider}
            onTest={testProvider}
            onFetchLogs={(key) => fetchLogs(key, 50)}
            logs={logs[provider.key] || []}
            isSelected={selectedProvider === provider.key}
            onSelect={handleSelect}
            modelOptions={(models[provider.key]?.candidates || [])}
            onChangeModel={changeModel}
            costMode={(policies[provider.key] || 'balanced')}
            onChangeCostMode={changeCostMode}
            modelLabels={(models[provider.key]?.meta
              ? Object.fromEntries(Object.entries(models[provider.key].meta).map(([id, info]) => [id, info?.costTier || null]))
              : {})}
          />
        ))}

        {(!loading && providers.length === 0) && (
          <div className="empty-state">
            No providers detected. Add keys to your server .env for: OPENAI_API_KEY, OPENAI_PROJECT_API_KEY, CLAUDE_API_KEY, GEMINI_API_KEY, X_AI_API_KEY
          </div>
        )}
      </div>

      <div className="logs-panel">
        <div className="logs-header">
          <h4>Provider Logs {selectedProvider ? `— ${providers.find(p => p.key === selectedProvider)?.name || selectedProvider}` : ''}</h4>
          {selectedProvider && (
            <div>
              <button className="btn small" onClick={() => fetchLogs(selectedProvider, 100)}>Reload Logs</button>
            </div>
          )}
        </div>
        {selectedProvider ? (
          <div className="logs-list">
            {(logs[selectedProvider] || []).slice().reverse().map((l, idx) => (
              <div key={idx} className={`log-row ${l.success ? 'ok' : 'err'}`}>
                <span className="log-ts">{new Date(l.ts).toLocaleTimeString()}</span>
                <span className="log-action">[{l.action}]</span>
                <span className="log-model">{l.model || '-'}</span>
                <span className="log-latency" title="Latency in ms">{l.latencyMs != null ? `${l.latencyMs}ms` : '-'}</span>
                <span className="log-status">{l.statusCode || (l.success ? 'OK' : 'ERR')}</span>
                {l.tokens ? (
                  <span className="log-tokens" title="Tokens in/out">tok {(l.tokens.input ?? 'n/a')}/{(l.tokens.output ?? 'n/a')}</span>
                ) : (
                  <span className="log-tokens na" title="Tokens not provided">tok n/a</span>
                )}
                {l.agentName ? <span className="log-agent" title="Agent that triggered this call">Agent: {l.agentName}</span> : null}
                {l.snippet ? <span className="log-snippet" title="Preview of response">{l.snippet}</span> : null}
                {(!l.success && l.error) ? <span className="log-error" title="Error">{l.error}</span> : null}
              </div>
            ))}
            {(logs[selectedProvider] || []).length === 0 && (
              <div className="empty-state small">No logs yet for this provider.</div>
            )}
          </div>
        ) : (
          <div className="empty-state small">Select a provider to view detailed logs.</div>
        )}
      </div>

      {testResult && (
        <div className={`toast ${testResult.ok ? 'ok' : 'err'}`}>
          {testResult.ok ? (
            <>
              ✅ Test OK ({testResult.provider}) — {testResult.latencyMs}ms {testResult.model ? `— ${testResult.model}` : ''}
              {testResult.snippet ? <div className="toast-snippet">{testResult.snippet}</div> : null}
            </>
          ) : (
            <>
              ❌ Test Failed ({testResult.provider}) — {testResult.error}
            </>
          )}
        </div>
      )}

      {Object.keys(testing).some(k => testing[k]) && (
        <div className="loading-banner">Running provider test...</div>
      )}
    </div>
  );
};

export default EngineStatus;
