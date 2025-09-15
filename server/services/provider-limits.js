// Simple per-provider+key capacity & concurrency manager for desktop use

class WindowCounter {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.ts = [];
  }
  add(now = Date.now()) { this.ts.push(now); this.compact(now); }
  count(now = Date.now()) { this.compact(now); return this.ts.length; }
  compact(now = Date.now()) { const cutoff = now - this.windowMs; while (this.ts.length && this.ts[0] < cutoff) this.ts.shift(); }
}

class CapacityManager {
  constructor() {
    this.state = new Map(); // key -> { inFlight, maxConcurrent, rpmLimit, counter }
  }

  ensure(key, config) {
    if (!this.state.has(key)) {
      this.state.set(key, {
        inFlight: 0,
        maxConcurrent: config.maxConcurrent || 4,
        rpmLimit: config.rpm || 60,
        counter: new WindowCounter(60_000)
      });
    }
    const s = this.state.get(key);
    // allow dynamic updates
    if (config.maxConcurrent) s.maxConcurrent = config.maxConcurrent;
    if (config.rpm) s.rpmLimit = config.rpm;
    return s;
  }

  snapshot() {
    const out = {};
    for (const [k, s] of this.state.entries()) {
      out[k] = { inFlight: s.inFlight, maxConcurrent: s.maxConcurrent, rpm: s.rpmLimit, recent: s.counter.count() };
    }
    return out;
  }

  canStart(key) {
    const s = this.state.get(key);
    if (!s) return true;
    if (s.inFlight >= s.maxConcurrent) return false;
    if (s.counter.count() >= s.rpmLimit) return false;
    return true;
  }

  acquire(key) {
    const s = this.state.get(key);
    if (!s) return () => {};
    s.inFlight++;
    s.counter.add();
    let released = false;
    return () => { if (!released) { s.inFlight = Math.max(0, s.inFlight - 1); released = true; } };
  }
}

// singleton
const mgr = new CapacityManager();

// Provider defaults; tuned conservatively for desktop tests
const DEFAULTS = {
  'openai': { rpm: 300, maxConcurrent: 4 },
  'claude': { rpm: 300, maxConcurrent: 4 },
  'gemini': { rpm: 60, maxConcurrent: 4 }
};

function keyFor(provider, token) {
  // partition by token to isolate per‑key capacity
  return `${provider}:${(token || '').slice(0,8) || 'env'}`;
}

function ensure(provider, token, overrides = {}) {
  const cfg = { ...DEFAULTS[provider], ...overrides };
  return mgr.ensure(keyFor(provider, token), cfg);
}

function canStart(provider, token) { return mgr.canStart(keyFor(provider, token)); }
function acquire(provider, token) { return mgr.acquire(keyFor(provider, token)); }
function snapshot() { return mgr.snapshot(); }

module.exports = { ensure, canStart, acquire, snapshot };

