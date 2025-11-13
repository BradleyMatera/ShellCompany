const fs = require('fs');
const path = require('path');
const providerLimits = require('./provider-limits');

class ProviderMonitor {
  constructor() {
    this.state = new Map(); // provider -> { reachable, lastModel, lastLatencyMs, lastError, lastSuccessTs, lastCallTs, lastStatusCode, preferredModel }
    this.logs = []; // [{ ts, provider, action, success, latencyMs, model, tokens, statusCode, error, hint, agentName, workflowId, snippet }]
    this.maxLogs = 1000;

    // Model discovery cache: provider -> { candidates: string[], discoveredAt: ISO }
    this.modelCache = new Map();

    // Persisted preferences for preferred model per provider
    this.preferencesPath = path.join(__dirname, '../config/provider-preferences.json');
    this.preferences = this.loadPreferences();

    // Cost mode policies (economy | balanced | premium), persisted separately
    this.policiesPath = path.join(__dirname, '../config/provider-policies.json');
    this.policies = this.loadPolicies();

    // Provider metadata and curated fallbacks
    this.providerMeta = {
      openai: {
        displayName: 'OpenAI',
        envVar: 'OPENAI_API_KEY',
        defaultModel: 'gpt-4o-mini',
        endpoints: {
          models: 'https://api.openai.com/v1/models',
          chat: 'https://api.openai.com/v1/chat/completions'
        },
        rank: (id = '') => (id.includes('gpt-4o') ? 100 : id.includes('gpt-4') ? 90 : id.includes('gpt-3.5') ? 50 : 0)
      },
      openai_project: {
        displayName: 'OpenAI (Project)',
        envVar: 'OPENAI_PROJECT_API_KEY',
        defaultModel: 'gpt-4o-mini',
        endpoints: {
          models: 'https://api.openai.com/v1/models',
          chat: 'https://api.openai.com/v1/chat/completions'
        },
        rank: (id = '') => (id.includes('gpt-4o') ? 100 : id.includes('gpt-4') ? 90 : id.includes('gpt-3.5') ? 50 : 0)
      },
      claude: {
        displayName: 'Claude (Anthropic)',
        envVar: 'CLAUDE_API_KEY',
        defaultModel: 'claude-sonnet-4-20250514',
        curated: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
        endpoints: {
          messages: process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/messages'
        }
      },
      gemini: {
        displayName: 'Gemini (Google)',
        envVar: 'GEMINI_API_KEY',
        defaultModel: 'models/gemini-1.5-pro-latest',
        endpoints: {
          models: 'https://generativelanguage.googleapis.com/v1beta/models',
          generateBase: 'https://generativelanguage.googleapis.com/v1beta'
        },
        rank: (name = '') => {
          const id = name.replace('models/', '');
          if (id.startsWith('gemini-1.5-pro-latest')) return 100;
          if (id.startsWith('gemini-1.5-pro-002')) return 95;
          if (id.startsWith('gemini-1.5-pro')) return 90;
          if (id.startsWith('gemini-1.5-flash')) return 80;
          if (id === 'chat-bison-001') return 60;
          return 0;
        }
      },
      xai: {
        displayName: 'xAI (Grok)',
        envVar: 'X_AI_API_KEY',
        defaultModel: 'grok-3',
        endpoints: {
          models: 'https://api.x.ai/v1/models',
          chat: 'https://api.x.ai/v1/chat/completions'
        },
        rank: (id = '') => (id.startsWith('grok-4') ? 100 : id.startsWith('grok-3') ? 90 : id.startsWith('grok-3-fast') ? 80 : id.startsWith('grok-3-mini') ? 70 : 0)
      },
      ollama: {
        displayName: 'Ollama',
        envVar: 'OLLAMA_ENDPOINT',
        defaultModel: 'llama3',
        endpoints: {
          models: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/tags',
          chat: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate'
        },
        curated: ['llama3', 'phi3', 'mistral', 'codellama', 'llama2', 'gemma', 'dolphin-mixtral', 'llava', 'llama3-8b', 'llama3-70b'],
        rank: (id = '') => (id.includes('llama3-70b') ? 100 : id.includes('llama3-8b') ? 90 : id.includes('llama3') ? 80 : id.includes('phi3') ? 70 : id.includes('mistral') ? 60 : 50)
      }
    };
  }

  // Preferences persistence
  ensureConfigDir() {
    const dir = path.dirname(this.preferencesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  loadPreferences() {
    try {
      this.ensureConfigDir();
      if (!fs.existsSync(this.preferencesPath)) return {};
      const raw = fs.readFileSync(this.preferencesPath, 'utf8');
      const obj = JSON.parse(raw || '{}');
      return obj && typeof obj === 'object' ? obj : {};
    } catch {
      return {};
    }
  }

  savePreferences() {
    try {
      this.ensureConfigDir();
      fs.writeFileSync(this.preferencesPath, JSON.stringify(this.preferences, null, 2), 'utf8');
    } catch {}
  }

  // Policies (cost mode) persistence
  loadPolicies() {
    try {
      this.ensureConfigDir();
      if (!fs.existsSync(this.policiesPath)) return {};
      const raw = fs.readFileSync(this.policiesPath, 'utf8');
      const obj = JSON.parse(raw || '{}');
      return obj && typeof obj === 'object' ? obj : {};
    } catch {
      return {};
    }
  }

  savePolicies() {
    try {
      this.ensureConfigDir();
      fs.writeFileSync(this.policiesPath, JSON.stringify(this.policies, null, 2), 'utf8');
    } catch {}
  }

  getCostMode(provider) {
    const mode = this.policies?.[provider];
    return (mode === 'economy' || mode === 'premium' || mode === 'balanced') ? mode : 'balanced';
  }

  setCostMode(provider, mode) {
    if (!['economy', 'balanced', 'premium'].includes(mode)) {
      throw new Error('mode must be one of: economy | balanced | premium');
    }
    this.policies[provider] = mode;
    this.savePolicies();
    this.record(provider, { action: 'setCostMode', success: true, mode });
    return { provider, mode };
  }

  // Heuristic cost-tier classification for common models
  classifyCostTier(provider, modelId = '') {
    const id = String(modelId).toLowerCase();
    switch (provider) {
      case 'openai':
      case 'openai_project':
        if (id.includes('gpt-4o') && !id.includes('mini')) return 'premium';
        if (id.includes('gpt-3.5') || id.includes('mini')) return 'economy';
        return 'balanced';
      case 'gemini': {
        if (id.includes('flash')) return 'economy';
        if (id.includes('pro')) return 'premium';
        if (id.includes('bison')) return 'economy';
        return 'balanced';
      }
      case 'xai':
        if (id.startsWith('grok-4')) return 'premium';
        if (id.includes('mini') || id.includes('fast')) return 'economy';
        return 'balanced';
      case 'claude':
        if (id.includes('opus') || id.includes('sonnet-4')) return 'premium';
        if (id.includes('haiku')) return 'economy';
        return 'balanced';
      default:
        return 'balanced';
    }
  }

  // Choose a model from cached candidates according to cost mode
  chooseModel(provider, mode = 'balanced') {
    const cached = this.modelCache.get(provider);
    const candidates = (cached?.candidates || []).slice();
    if (candidates.length === 0) {
      // fallback to preferred/default
      return this.getPreferredModel(provider);
    }
    const desiredTier = this.getCostMode(provider) || mode;
    // Try to find best match by tier, otherwise fallback to ranked best
    const byTier = candidates.find(m => this.classifyCostTier(provider, m) === desiredTier);
    if (byTier) return byTier;

    // If not found, try a reasonable secondary for each tier
    if (desiredTier === 'economy') {
      const econ = candidates.find(m => /mini|flash|3\.5|bison/i.test(m));
      if (econ) return econ;
    } else if (desiredTier === 'premium') {
      const prem = candidates.find(m => /(gpt-4o(?!-mini))|grok-4|sonnet-4|opus|gemini-1\.5-pro/i.test(m));
      if (prem) return prem;
    }

    // Fallback to first by rank (we don't have direct rank values here; candidates are already roughly ranked)
    return candidates[0];
  }

  // Build metadata per model for UI/context: id, cost tier, contextWindow (unknown), availability (unknown)
  getModelMetadata(provider, candidates = []) {
    const meta = {};
    for (const id of candidates) {
      meta[id] = {
        id,
        displayName: id,
        costTier: this.classifyCostTier(provider, id),
        contextWindow: null,
        available: null
      };
    }
    return meta;
  }

  hasKey(provider) {
    const meta = this.providerMeta[provider];
    if (!meta) return false;
    const token = process.env[meta.envVar];
    return !!(token && token.trim());
  }

  getToken(provider) {
    const meta = this.providerMeta[provider];
    if (!meta) return null;
    return process.env[meta.envVar] || null;
  }

  // Safe logging and state update
  record(provider, entry) {
    const ts = new Date().toISOString();
    const log = { ts, provider, ...entry };
    this.logs.push(log);
    if (this.logs.length > this.maxLogs) this.logs.splice(0, this.logs.length - this.maxLogs);
    // Keep lastStatusCode in state for card display
    if (typeof entry.statusCode !== 'undefined') {
      const curr = this.state.get(provider) || {};
      curr.lastStatusCode = entry.statusCode;
      this.state.set(provider, curr);
    }
    return log;
  }

  updateState(provider, patch) {
    const curr = this.state.get(provider) || {};
    const next = { ...curr, ...patch };
    if (!next.preferredModel) {
      const pref = this.getPreferredModel(provider);
      if (pref) next.preferredModel = pref;
    }
    this.state.set(provider, next);
    return next;
  }

  getLogs({ provider, limit = 100 } = {}) {
    const filtered = provider ? this.logs.filter(l => l.provider === provider) : this.logs;
    return filtered.slice(Math.max(0, filtered.length - limit));
  }

  getErrorRate(provider, windowMs = 10 * 60 * 1000) {
    const cutoff = Date.now() - windowMs;
    const recent = this.getLogs({ provider }).filter(l => new Date(l.ts).getTime() >= cutoff);
    if (recent.length === 0) return 0;
    const errors = recent.filter(l => !l.success).length;
    return errors / recent.length;
  }

  // Preferred models
  getPreferredModel(provider) {
    const fromPrefs = this.preferences?.[provider];
    if (fromPrefs) return fromPrefs;
    const cached = this.modelCache.get(provider);
    if (cached?.candidates?.length) return cached.candidates[0];
    const meta = this.providerMeta[provider];
    return meta?.defaultModel || null;
  }

  setPreferredModel(provider, model) {
    if (!this.providerMeta[provider]) throw new Error(`Unknown provider: ${provider}`);
    this.preferences[provider] = model;
    this.savePreferences();
    this.updateState(provider, { preferredModel: model });
    this.record(provider, { action: 'setPreferred', success: true, model });
    return { provider, preferred: model };
  }

  // Model discovery
  async discoverModels(provider) {
    const meta = this.providerMeta[provider];
    if (!meta) throw new Error(`Unknown provider: ${provider}`);
    if (!this.hasKey(provider)) return { candidates: meta.curated || (meta.defaultModel ? [meta.defaultModel] : []), discoveredAt: new Date().toISOString() };

    try {
      if (provider === 'openai' || provider === 'openai_project') {
        const token = this.getToken(provider);
        const r = await fetch(meta.endpoints.models, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });
        const text = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 128)}`);
        const data = JSON.parse(text);
        const list = Array.isArray(data.data) ? data.data : [];
        const ids = Array.from(new Set(list.map(m => m.id).filter(Boolean)));
        const ranked = ids
          .filter(id => /^(gpt-4o|gpt-4|gpt-3\.5)/.test(id))
          .sort((a, b) => (meta.rank(b) - meta.rank(a)));
        return { candidates: ranked.length ? ranked : ids.slice(0, 5), discoveredAt: new Date().toISOString() };
      }

      if (provider === 'gemini') {
        const token = this.getToken(provider);
        const url = `${meta.endpoints.models}?key=${encodeURIComponent(token)}`;
        const r = await fetch(url, { method: 'GET' });
        const text = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 128)}`);
        const data = JSON.parse(text);
        const models = Array.isArray(data.models) ? data.models : [];
        const names = models.map(m => m.name).filter(Boolean); // e.g. 'models/gemini-1.5-pro-latest'
        const unique = Array.from(new Set(names));
        const ranked = unique
          .filter(name => name.includes('gemini') || name.endsWith('chat-bison-001'))
          .sort((a, b) => (this.providerMeta.gemini.rank(b) - this.providerMeta.gemini.rank(a)));

        // Ensure PaLM 2 fallback candidate exists for projects without Gemini access
        let candidates = ranked.length ? ranked : unique.slice(0, 5);
        if (!candidates.includes('models/chat-bison-001')) {
          candidates = [...candidates, 'models/chat-bison-001'];
        }
        if (!candidates.includes('models/text-bison-001')) {
          candidates = [...candidates, 'models/text-bison-001'];
        }

        return { candidates, discoveredAt: new Date().toISOString() };
      }

      if (provider === 'xai') {
        const token = this.getToken(provider);
        const r = await fetch(meta.endpoints.models, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });
        const text = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 128)}`);
        let data = {};
        try { data = JSON.parse(text); } catch {}
        const arr = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : []);
        const ids = arr.map(m => m.id || m.name).filter(Boolean);
        const groks = Array.from(new Set(ids.filter(id => id.startsWith('grok'))));
        const ranked = groks.sort((a, b) => (this.providerMeta.xai.rank(b) - this.providerMeta.xai.rank(a)));
        // If nothing returned, fall back to curated order
        const curated = ['grok-4', 'grok-3', 'grok-3-mini', 'grok-3-fast'].filter(Boolean);
        const candidates = ranked.length ? ranked : curated;
        return { candidates, discoveredAt: new Date().toISOString() };
      }

      if (provider === 'claude') {
        const curated = this.providerMeta.claude.curated || [];
        return { candidates: curated, discoveredAt: new Date().toISOString() };
      }

      return { candidates: meta.defaultModel ? [meta.defaultModel] : [], discoveredAt: new Date().toISOString() };
    } catch (err) {
      // On discovery error, return curated/default rather than failing
      const fallback = meta.curated || (meta.defaultModel ? [meta.defaultModel] : []);
      this.record(provider, { action: 'discover', success: false, error: err.message });
      return { candidates: fallback, discoveredAt: new Date().toISOString() };
    }
  }

  async getModelCandidates(provider, ttlMs = 15 * 60 * 1000) {
    const cached = this.modelCache.get(provider);
    const now = Date.now();
    const withinTtl = cached && cached.discoveredAt && (now - new Date(cached.discoveredAt).getTime()) < ttlMs;

    if (withinTtl) {
      let candidates = cached.candidates || [];
      const preferred = this.getPreferredModel(provider);
      if (preferred) {
        if (!candidates.includes(preferred)) {
          candidates = [preferred, ...candidates];
        } else {
          candidates = [preferred, ...candidates.filter(c => c !== preferred)];
        }
      }
      return Array.from(new Set(candidates));
    }

    const { candidates, discoveredAt } = await this.discoverModels(provider);
    this.modelCache.set(provider, { candidates, discoveredAt });

    const preferred = this.getPreferredModel(provider);
    let list = candidates;
    if (preferred) {
      if (!list.includes(preferred)) {
        list = [preferred, ...list];
      } else {
        list = [preferred, ...list.filter(c => c !== preferred)];
      }
    }
    return Array.from(new Set(list));
  }

  async getModelsSummary() {
    const out = {};
    for (const provider of Object.keys(this.providerMeta)) {
      if (!this.hasKey(provider)) continue;
      const candidates = await this.getModelCandidates(provider);
      const cached = this.modelCache.get(provider) || {};
      out[provider] = {
        preferred: this.getPreferredModel(provider),
        candidates,
        discoveredAt: cached.discoveredAt || null,
        meta: this.getModelMetadata(provider, candidates)
      };
    }
    return out;
  }

  // Parallel ping with timeout to keep UI responsive
  async pingAll() {
    const providers = Object.keys(this.providerMeta).filter(p => this.hasKey(p));
    const timeoutMs = 5000;

    const tasks = providers.map((p) => {
      return Promise.race([
        this.ping(p)
          .then(state => [p, state])
          .catch(e => {
            this.record(p, { action: 'ping', success: false, latencyMs: timeoutMs, error: e.message });
            return [p, { reachable: false, lastError: e.message }];
          }),
        new Promise((resolve) => setTimeout(() => {
          this.record(p, { action: 'ping', success: false, latencyMs: timeoutMs, error: 'Timeout' });
          resolve([p, this.updateState(p, { reachable: false, lastError: 'Timeout', lastCallTs: Date.now() })]);
        }, timeoutMs))
      ]);
    });

    const pairs = await Promise.all(tasks);
    const results = {};
    for (const [key, value] of pairs) {
      results[key] = value;
    }
    return results;
  }

  async ping(provider) {
    const meta = this.providerMeta[provider];
    if (!meta) throw new Error(`Unknown provider: ${provider}`);
    if (!this.hasKey(provider)) {
      const res = this.updateState(provider, { reachable: false, lastError: 'Missing API key', lastCallTs: Date.now() });
      this.record(provider, { action: 'ping', success: false, latencyMs: 0, error: 'Missing API key' });
      return res;
    }

    const t0 = Date.now();
    try {
      if (provider === 'openai' || provider === 'openai_project') {
        const token = this.getToken(provider);
        const r = await fetch(meta.endpoints.models, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });
        const latencyMs = Date.now() - t0;
        const text = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 128)}`);
        const data = JSON.parse(text);
        const list = Array.isArray(data.data) ? data.data : [];
        const ids = list.map(m => m.id).filter(Boolean);
        // Pick a reasonable current model
        const model = ids.find(id => id.includes('gpt-4o')) || ids.find(id => id.includes('gpt-4')) || ids.find(id => id.includes('gpt-3.5')) || meta.defaultModel;
        this.record(provider, { action: 'ping', success: true, latencyMs, model, statusCode: r.status });
        return this.updateState(provider, {
          reachable: true,
          lastModel: model,
          lastLatencyMs: latencyMs,
          lastSuccessTs: Date.now(),
          lastCallTs: Date.now()
        });
      }

        if (provider === 'ollama') {
          // Ping Ollama by listing available models
          const url = meta.endpoints.models;
          try {
            const r = await fetch(url, { method: 'GET' });
            const latencyMs = Date.now() - t0;
            const text = await r.text();
            if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 128)}`);
            let data = {};
            try { data = JSON.parse(text); } catch {}
            const models = Array.isArray(data.models) ? data.models : [];
            const model = models[0]?.name || meta.defaultModel;
            this.record(provider, { action: 'ping', success: true, latencyMs, model, statusCode: r.status });
            return this.updateState(provider, {
              reachable: true,
              lastModel: model,
              lastLatencyMs: latencyMs,
              lastSuccessTs: Date.now(),
              lastCallTs: Date.now()
            });
          } catch (err) {
            const latencyMs = Date.now() - t0;
            this.record(provider, { action: 'ping', success: false, latencyMs, error: err.message });
            return this.updateState(provider, {
              reachable: false,
              lastError: err.message,
              lastLatencyMs: latencyMs,
              lastCallTs: Date.now()
            });
          }
        }

      if (provider === 'claude') {
        const token = this.getToken(provider);
        const r = await fetch(meta.endpoints.messages, {
          method: 'POST',
          headers: {
            'x-api-key': token,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: this.getPreferredModel('claude'),
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }]
          })
        });
        const latencyMs = Date.now() - t0;
        const text = await r.text();
        if (!r.ok) {
          // Return error details but keep normalized
          this.record(provider, { action: 'ping', success: false, latencyMs, statusCode: r.status, error: text.slice(0, 140) });
          return this.updateState(provider, {
            reachable: false,
            lastError: `HTTP ${r.status}`,
            lastLatencyMs: latencyMs,
            lastCallTs: Date.now()
          });
        }
        this.record(provider, { action: 'ping', success: true, latencyMs, model: this.getPreferredModel('claude'), statusCode: r.status });
        return this.updateState(provider, {
          reachable: true,
          lastModel: this.getPreferredModel('claude'),
          lastLatencyMs: latencyMs,
          lastSuccessTs: Date.now(),
          lastCallTs: Date.now()
        });
      }

      if (provider === 'gemini') {
        const token = this.getToken(provider);
        const url = `${meta.endpoints.models}?key=${encodeURIComponent(token)}`;
        const r = await fetch(url, { method: 'GET' });
        const latencyMs = Date.now() - t0;
        const text = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 128)}`);
        const data = JSON.parse(text);
        const models = Array.isArray(data.models) ? data.models : [];
        const name = (models.find(m => (m.name || '').includes('gemini-1.5-pro'))?.name)
          || (models[0]?.name) || meta.defaultModel;
        this.record(provider, { action: 'ping', success: true, latencyMs, model: name, statusCode: r.status });
        return this.updateState(provider, {
          reachable: true,
          lastModel: name,
          lastLatencyMs: latencyMs,
          lastSuccessTs: Date.now(),
          lastCallTs: Date.now()
        });
      }

      if (provider === 'xai') {
        const token = this.getToken(provider);
        const r = await fetch(meta.endpoints.models, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        });
        const latencyMs = Date.now() - t0;
        const text = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 128)}`);
        let data = {};
        try { data = JSON.parse(text); } catch {}
        const arr = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : []);
        const ids = arr.map(m => m.id || m.name).filter(Boolean);
        const model = ids.find(id => id.startsWith('grok-4')) || ids.find(id => id.startsWith('grok-3')) || meta.defaultModel;
        this.record(provider, { action: 'ping', success: true, latencyMs, model, statusCode: r.status });
        return this.updateState(provider, {
          reachable: true,
          lastModel: model,
          lastLatencyMs: latencyMs,
          lastSuccessTs: Date.now(),
          lastCallTs: Date.now()
        });
      }

      throw new Error('Unhandled provider ping');
    } catch (err) {
      const latencyMs = Date.now() - t0;
      this.record(provider, { action: 'ping', success: false, latencyMs, error: err.message });
      return this.updateState(provider, {
        reachable: false,
        lastError: err.message,
        lastLatencyMs: latencyMs,
        lastCallTs: Date.now()
      });
    }
  }

  // Unified test with per-provider fallback across models
  async test(provider, prompt = 'Echo test: Hello from ShellCompany.') {
    return this.testWithFallback(provider, prompt);
  }

  async testWithFallback(provider, prompt = 'Echo test: Hello from ShellCompany.') {
    if (!this.providerMeta[provider]) throw new Error(`Unknown provider: ${provider}`);
    if (!this.hasKey(provider)) throw new Error('Missing API key');

    const candidates = await this.getModelCandidates(provider);
    const tried = [];
    let lastErr = null;

    for (const model of candidates) {
      try {
        const res = await this.testWithModel(provider, model, prompt);
        // Success
        this.updateState(provider, { reachable: true, lastModel: model, lastLatencyMs: res.latencyMs, lastSuccessTs: Date.now(), lastCallTs: Date.now() });
        // Update preferred to working model if not explicitly set
        if (!this.preferences?.[provider]) {
          this.preferences[provider] = model;
          this.savePreferences();
          this.updateState(provider, { preferredModel: model });
        }
        this.record(provider, { action: 'test', success: true, latencyMs: res.latencyMs, model, statusCode: res.statusCode, snippet: res.snippet, tokens: res.tokens });
        return { provider, success: true, model, latencyMs: res.latencyMs, statusCode: res.statusCode, snippet: res.snippet, tokens: res.tokens };
      } catch (err) {
        // Decide whether to try next model
        lastErr = err;
        tried.push({ model, err: err.message, code: err.statusCode });
        const msg = (err.message || '').toLowerCase();
        const sc = err.statusCode || 0;

        // If auth/credits issue for the provider, do not keep trying models
        if (sc === 401 || sc === 403 || msg.includes('insufficient') || msg.includes('credit') || msg.includes('balance')) {
          this.record(provider, { action: 'test', success: false, latencyMs: err.latencyMs, model, statusCode: sc, error: err.message, hint: provider === 'claude' ? 'Add credits to Anthropic' : undefined });
          this.updateState(provider, { reachable: false, lastError: err.message, lastLatencyMs: err.latencyMs, lastCallTs: Date.now() });
          return { provider, success: false, model, latencyMs: err.latencyMs, statusCode: sc, error: err.message, hint: provider === 'claude' ? 'Add credits to Anthropic' : undefined };
        }

        // If deprecated/not found, try next candidate
        if (sc === 404 || msg.includes('not found') || msg.includes('deprecated') || msg.includes('unknown model')) {
          this.record(provider, { action: 'fallback', success: false, model, statusCode: sc, error: err.message, hint: 'Model deprecated/invalid; trying next model' });
          continue;
        }

        // 429 or 5xx: try next model once (basic resilience)
        if (sc === 429 || (sc >= 500 && sc <= 599)) {
          this.record(provider, { action: 'fallback', success: false, model, statusCode: sc, error: err.message, hint: 'Rate limited or upstream error; trying next model' });
          continue;
        }

        // For other errors/timeouts: try next candidate
        this.record(provider, { action: 'fallback', success: false, model, statusCode: sc, error: err.message, hint: 'Trying next model' });
        continue;
      }
    }

    // All attempts failed
    const lastMsg = lastErr ? lastErr.message : 'All models failed';
    const lastLatency = lastErr ? lastErr.latencyMs : 0;
    const lastCode = lastErr ? lastErr.statusCode : undefined;
    this.updateState(provider, { reachable: false, lastError: lastMsg, lastLatencyMs: lastLatency, lastCallTs: Date.now() });
    this.record(provider, { action: 'test', success: false, latencyMs: lastLatency, statusCode: lastCode, error: lastMsg });
    return { provider, success: false, error: lastMsg, statusCode: lastCode, latencyMs: lastLatency, tried };
  }

  // Provider-specific single model test (throws on failure)
  async testWithModel(provider, model, prompt) {
    const meta = this.providerMeta[provider];
    const t0 = Date.now();

    const throwNormalized = (statusCode, bodyText, messageFallback) => {
      const err = new Error(messageFallback || `HTTP ${statusCode} ${String(bodyText || '').slice(0, 200)}`);
      err.statusCode = statusCode;
      err.latencyMs = Date.now() - t0;
      throw err;
    };

    try {
      if (provider === 'openai' || provider === 'openai_project') {
        const token = this.getToken(provider);
        const r = await fetch(meta.endpoints.chat, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 60
          })
        });
        const latencyMs = Date.now() - t0;
        const text = await r.text();
        let data = {};
        try { data = JSON.parse(text); } catch {}
        if (!r.ok || !data) return throwNormalized(r.status, text);
        const content = data.choices?.[0]?.message?.content || '';
        const snippet = (content || '').slice(0, 140);
        const usage = data.usage || {};
        const tokens = { input: usage.prompt_tokens || 0, output: usage.completion_tokens || 0 };
        return { success: true, statusCode: r.status, latencyMs, snippet, tokens };
      }

        if (provider === 'ollama') {
          // Test Ollama by generating a simple completion
          const url = meta.endpoints.chat;
          const payload = {
            model,
            prompt,
            stream: false,
            options: { temperature: 0 }
          };
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const latencyMs = Date.now() - t0;
          const text = await r.text();
          let data = {};
          try { data = JSON.parse(text); } catch {}
          if (!r.ok || !data) return throwNormalized(r.status, text);
          const content = data.response || '';
          const snippet = (content || '').slice(0, 140);
          // Ollama does not return token usage, so set as n/a
          const tokens = { input: 0, output: 0 };
          return { success: true, statusCode: r.status, latencyMs, snippet, tokens };
        }

      if (provider === 'claude') {
        const token = this.getToken(provider);
        const r = await fetch(meta.endpoints.messages, {
          method: 'POST',
          headers: {
            'x-api-key': token,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model,
            max_tokens: 60,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const latencyMs = Date.now() - t0;
        const text = await r.text();
        let data = {};
        try { data = JSON.parse(text); } catch {}
        if (!r.ok || !data) return throwNormalized(r.status, text);
        const content = data.content?.[0]?.text || '';
        const snippet = (content || '').slice(0, 140);
        const usage = data.usage || {};
        const tokens = { input: usage.input_tokens || 0, output: usage.output_tokens || 0 };
        return { success: true, statusCode: r.status, latencyMs, snippet, tokens };
      }

      if (provider === 'gemini') {
        const token = this.getToken(provider);
        const id = model.startsWith('models/') ? model : `models/${model}`;
        const modelName = id.replace(/^models\//, '');
        let url;
        let body;
        let isBison = false;

        // Handle PaLM 2 fallbacks (bison) via v1beta2 endpoints
        if (modelName === 'chat-bison-001') {
          isBison = true;
          url = `https://generativelanguage.googleapis.com/v1beta2/models/chat-bison-001:generateMessage?key=${encodeURIComponent(token)}`;
          body = {
            prompt: {
              messages: [{ author: 'user', content: prompt }]
            }
          };
        } else if (modelName === 'text-bison-001') {
          isBison = true;
          url = `https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText?key=${encodeURIComponent(token)}`;
          body = {
            prompt: { text: prompt }
          };
        } else {
          // Gemini 1.5/2.x via v1beta generateContent
          url = `${meta.endpoints.generateBase}/${id}:generateContent?key=${encodeURIComponent(token)}`;
          body = {
            contents: [{ parts: [{ text: prompt }] }]
          };
        }

        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const latencyMs = Date.now() - t0;
        const text = await r.text();
        let data = {};
        try { data = JSON.parse(text); } catch {}
        if (!r.ok || !data) return throwNormalized(r.status, text);

        let content = '';
        if (isBison) {
          content = data.candidates?.[0]?.content || data.candidates?.[0]?.output || '';
        } else {
          content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
        const snippet = (content || '').slice(0, 140);
        const usage = data.usageMetadata || {};
        const tokens = usage ? { input: usage.promptTokenCount || 0, output: usage.candidatesTokenCount || 0 } : undefined;
        return { success: true, statusCode: r.status, latencyMs, snippet, tokens };
      }

      if (provider === 'xai') {
        const token = this.getToken(provider);
        const r = await fetch(meta.endpoints.chat, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 60
          })
        });
        const latencyMs = Date.now() - t0;
        const text = await r.text();
        let data = {};
        try { data = JSON.parse(text); } catch {}
        if (!r.ok || !data) return throwNormalized(r.status, text);
        const content = data.choices?.[0]?.message?.content || '';
        const snippet = (content || '').slice(0, 140);
        const usage = data.usage || {};
        const tokens = { input: usage.prompt_tokens || 0, output: usage.completion_tokens || 0 };
        return { success: true, statusCode: r.status, latencyMs, snippet, tokens };
      }

      throwNormalized(500, null, 'Unhandled provider test');
    } catch (err) {
      if (err.statusCode) throw err;
      // Wrap any other errors
      const e = new Error(err.message || 'Unknown error');
      e.statusCode = 0;
      e.latencyMs = Date.now() - t0;
      throw e;
    }
  }

  // Called by agent-engine per real model call to track live usage
  recordCall({ provider, model, latencyMs, tokens = { input: 0, output: 0 }, success, error, statusCode, agentName, workflowId }) {
    this.record(provider, { action: 'call', success, latencyMs, model, tokens, statusCode, error, agentName, workflowId });
    const patch = {
      lastModel: model || (this.state.get(provider)?.lastModel),
      lastLatencyMs: latencyMs,
      lastCallTs: Date.now(),
    };
    if (success) patch.lastSuccessTs = Date.now();
    if (!success) patch.lastError = error;
    this.updateState(provider, patch);
  }

  // Build status payload for UI
  buildStatusPayload({ agentEngine, orchestrator }) {
    const providers = [];

    // Aggregate provider-limits snapshot for RPM and concurrency
    const snap = providerLimits.snapshot();
    const agg = {}; // provider -> { recent, rpm, inFlight, maxConcurrent }
    for (const key of Object.keys(snap)) {
      const [provider] = key.split(':');
      if (!agg[provider]) agg[provider] = { recent: 0, rpm: 0, inFlight: 0, maxConcurrent: 0 };
      agg[provider].recent += snap[key].recent || 0;
      agg[provider].rpm = Math.max(agg[provider].rpm, snap[key].rpm || 0);
      agg[provider].inFlight += snap[key].inFlight || 0;
      agg[provider].maxConcurrent = Math.max(agg[provider].maxConcurrent, snap[key].maxConcurrent || 0);
    }

    // Usage stats from agent-engine (daily token totals)
    let todayStr = new Date().toISOString().split('T')[0];
    const usage = agentEngine?.getUsageStats ? agentEngine.getUsageStats() : {};
    const dailyTokens = (providerKey) => {
      const key = `${providerKey}-${todayStr}`;
      const stats = usage[key] || { tokens: 0 };
      return stats.tokens || 0;
    };

    // Providers present (keys)
    for (const provider of Object.keys(this.providerMeta)) {
      if (!this.hasKey(provider)) continue;
      const meta = this.providerMeta[provider];
      const st = this.state.get(provider) || {};
      const a = agg[provider] || {};
      const tokensUsed = dailyTokens(provider);
      const tokensLimit = null; // not available via APIs; UI shows 'n/a'

      providers.push({
        key: provider,
        name: meta.displayName,
        status: st.reachable === false ? 'offline' : st.lastSuccessTs ? 'online' : 'limited',
        tokensUsed,
        tokensLimit,
        requestsPerMinute: a.recent || 0,
        requestsLimit: a.rpm || 60,
        currentModel: st.lastModel || meta.defaultModel,
        preferredModel: st.preferredModel || this.getPreferredModel(provider) || meta.defaultModel,
        lastResponse: st.lastSuccessTs || st.lastCallTs || 0,
        errorRate: this.getErrorRate(provider),
        inFlight: a.inFlight || 0,
        maxConcurrent: a.maxConcurrent || 0,
        lastLatencyMs: st.lastLatencyMs || null,
        lastError: st.lastError || null,
        lastStatusCode: typeof st.lastStatusCode !== 'undefined' ? st.lastStatusCode : null,
        lastHint: (this.getLogs({ provider }).slice(-50).reverse().find(l => l.hint) || {}).hint || null
      });
    }

    // Capacity from orchestrator
    let capacity = {
      activeAgents: 0,
      maxConcurrent: 0,
      queuedTasks: 0,
      completedToday: 0
    };
    if (orchestrator) {
      try {
        const agentStatuses = orchestrator.getAgentStatus ? orchestrator.getAgentStatus() : [];
        capacity.activeAgents = agentStatuses.filter(a => a.status && a.status !== 'idle').length;
        capacity.maxConcurrent = agentStatuses.length;
        capacity.queuedTasks = Array.isArray(orchestrator.taskQueue) ? orchestrator.taskQueue.length : 0;
        try {
          const wfs = orchestrator.completedWorkflows || [];
          const today = new Date().toISOString().slice(0, 10);
          capacity.completedToday = wfs.filter(w => w.endTime && new Date(w.endTime).toISOString().slice(0, 10) === today).length;
        } catch {}
      } catch {}
    }

    return { providers, capacity };
  }
}

module.exports = new ProviderMonitor();
