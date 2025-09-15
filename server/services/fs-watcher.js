const chokidar = (() => { try { return require('chokidar'); } catch { return null; } })();
const os = require('os');
const path = require('path');
const bus = require('./bus');
const fs = require('fs');

function homeDir() { return os.homedir() || process.env.HOME || process.env.USERPROFILE || '.'; }

let watcher = null;

function defaultProjectPath(projectId) {
  return path.join(homeDir(), 'ShellCompany', projectId);
}

function start({ projectId = 'shellcompany', dir } = {}) {
  if (!chokidar) {
    console.warn('fs-watcher: chokidar not installed; file events disabled');
    return null;
  }
  const watchDir = dir || defaultProjectPath(projectId);
  try { fs.mkdirSync(watchDir, { recursive: true }); } catch {}
  watcher = chokidar.watch(watchDir, { ignoreInitial: true, persistent: true });
  watcher.on('add', (p) => bus.emit('event', { source: 'fs', kind: 'file_written', project: projectId, payload: { path: p } }));
  watcher.on('change', (p) => bus.emit('event', { source: 'fs', kind: 'file_written', project: projectId, payload: { path: p } }));
  watcher.on('unlink', (p) => bus.emit('event', { source: 'fs', kind: 'file_deleted', project: projectId, payload: { path: p } }));
  console.log(`📁 fs-watcher: watching ${watchDir}`);
  return watchDir;
}

function stop() {
  if (watcher) { try { watcher.close(); } catch {} watcher = null; }
}

module.exports = { start, stop };

