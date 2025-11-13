import { useState, useEffect, useRef } from 'react';
import apiFetch from '../apiHelper';

function safeJsonText(res) {
  return res.text().then(t => {
    try { return t ? JSON.parse(t) : {}; } catch (e) { return null; }
  }).catch(() => null);
}

export default function useEngineStatus(pollIntervalMs = 5000) {
  const [providers, setProviders] = useState([]);
  const [capacity, setCapacity] = useState({ activeAgents: 0, maxConcurrent: 0, queuedTasks: 0, completedToday: 0 });
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [logs, setLogs] = useState({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState({});
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const [models, setModels] = useState({});
  const [policies, setPolicies] = useState({});
  const [ollamaModels, setOllamaModels] = useState([]);

  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const fetchStatus = async ({ ping = false } = {}) => {
    try {
      setLoading(true);
      const url = `/api/engine/status${ping ? '?ping=true' : ''}`;
      const res = await apiFetch(url);
      const json = await safeJsonText(res);
      if (!res.ok || json == null) {
        setError(`Status fetch failed (HTTP ${res.status})`);
        return { ok: false, status: res.status };
      }
      if (!mounted.current) return { ok: true, json };
      setProviders(Array.isArray(json.providers) ? json.providers : []);
      setCapacity(json.capacity || { activeAgents: 0, maxConcurrent: 0, queuedTasks: 0, completedToday: 0 });
      setError(null);
      return { ok: true, json };
    } catch (e) {
      console.error('fetchStatus error', e);
      setError(e.message || String(e));
      return { ok: false, error: e };
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (providerKey, limit = 50) => {
    try {
      const res = await apiFetch(`/api/engine/logs?provider=${encodeURIComponent(providerKey)}&limit=${limit}`);
      if (!res.ok) {
        console.error('Failed to fetch logs', res.status);
        return;
      }
      const json = await res.json();
      if (!mounted.current) return;
      setLogs(prev => ({ ...prev, [providerKey]: (json.logs || []) }));
    } catch (e) {
      console.error('fetchLogs error', e);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await apiFetch('/api/engine/models');
      if (!res.ok) return;
      const json = await res.json();
      if (!mounted.current) return;
      setModels(json || {});
    } catch (e) {
      console.error('fetchModels error', e);
    }
  };

  const fetchPolicies = async () => {
    try {
      const res = await apiFetch('/api/engine/policies');
      if (!res.ok) return;
      const json = await res.json();
      if (!mounted.current) return;
      setPolicies(json || {});
    } catch (e) {
      console.error('fetchPolicies error', e);
    }
  };

  const changeModel = async (providerKey, model) => {
    try {
      const res = await apiFetch(`/api/engine/provider/${encodeURIComponent(providerKey)}/model`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model })
      });
      if (!res.ok) {
        const txt = await safeJsonText(res);
        throw new Error((txt && txt.error) || `HTTP ${res.status}`);
      }
      setTestResult({ provider: providerKey, ok: true, snippet: `Preferred model set to ${model}`, model });
      await fetchStatus();
      await fetchModels();
      await fetchLogs(providerKey, 50);
    } catch (e) {
      console.error('changeModel error', e);
      setTestResult({ provider: providerKey, ok: false, error: e.message });
    }
  };

  const changeCostMode = async (providerKey, mode) => {
    try {
      const res = await apiFetch(`/api/engine/provider/${encodeURIComponent(providerKey)}/cost-mode`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPolicies(prev => ({ ...prev, [providerKey]: mode }));
      setTestResult({ provider: providerKey, ok: true, snippet: `Cost mode set to ${mode}` });
      await fetchStatus();
      await fetchModels();
      await fetchPolicies();
      await fetchLogs(providerKey, 50);
    } catch (e) {
      console.error('changeCostMode error', e);
      setTestResult({ provider: providerKey, ok: false, error: e.message });
    }
  };

  const testProvider = async (providerKey) => {
    try {
      setTesting(prev => ({ ...prev, [providerKey]: true }));
      setTestResult(null);
      const res = await apiFetch(`/api/engine/test/${encodeURIComponent(providerKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Echo test: Hello from ShellCompany.' })
      });
      const json = await (res.ok ? res.json() : safeJsonText(res));
      if (!res.ok || json?.success === false) {
        setTestResult({ provider: providerKey, ok: false, error: (json && json.error) || `HTTP ${res.status}` });
      } else {
        setTestResult({ provider: providerKey, ok: true, latencyMs: json.latencyMs, snippet: json.snippet, model: json.model });
      }
      await fetchStatus();
      await fetchLogs(providerKey, 50);
    } catch (e) {
      console.error('testProvider error', e);
      setTestResult({ provider: providerKey, ok: false, error: e.message });
    } finally {
      setTesting(prev => ({ ...prev, [providerKey]: false }));
    }
  };

  const fetchOllamaModels = async () => {
    try {
      const res = await apiFetch('/api/ollama/models');
      if (!res.ok) {
        setOllamaModels([]);
        return;
      }
      const json = await res.json();
      if (!mounted.current) return;
      // support both {models:[]} and plain array
      setOllamaModels(Array.isArray(json.models) ? json.models : (Array.isArray(json) ? json : []));
    } catch (e) {
      console.error('fetchOllamaModels error', e);
      setOllamaModels([]);
    }
  };

  // Polling
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchStatus({ ping: true });
      await fetchModels();
      await fetchPolicies();
      await fetchOllamaModels();
      while (!cancelled) {
        await new Promise(r => setTimeout(r, pollIntervalMs));
        if (cancelled) break;
        await fetchStatus();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    providers,
    capacity,
    selectedProvider,
    setSelectedProvider,
    logs,
    loading,
    testing,
    testResult,
    error,
    models,
    policies,
    fetchStatus,
    fetchLogs,
    fetchModels,
    fetchPolicies,
    changeModel,
    changeCostMode,
    testProvider,
    ollamaModels,
    fetchOllamaModels
  };
}
