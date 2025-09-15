const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const bus = require('./bus');

let ptyLib = null;
try { ptyLib = require('node-pty'); } catch (e) { /* optional */ }

const sessions = new Map();

function homeDir() { return os.homedir() || process.env.HOME || process.env.USERPROFILE || '.'; }
async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }).catch(() => {}); }
function nowIso() { return new Date().toISOString(); }

function createLogger(projectId, ptyId) {
  const base = path.join(homeDir(), 'ShellCompany', '.logs', projectId);
  const logPath = path.join(base, `${ptyId}.jsonl`);
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  return { logPath, stream, write: (obj) => stream.write(JSON.stringify(obj) + '\n'), end: () => stream.end() };
}

async function start({ projectId = 'shellcompany', shell, cwd }) {
  if (!ptyLib) throw new Error('PTY not available: install node-pty');
  const ptyId = crypto.randomUUID();
  const { logPath, stream, write } = createLogger(projectId, ptyId);
  await ensureDir(path.dirname(logPath));

  const defaultShell = shell || (process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash'));
  const cols = 120, rows = 30;
  const pty = ptyLib.spawn(defaultShell, [], { name: 'xterm-color', cols, rows, cwd: cwd || process.cwd(), env: process.env });

  sessions.set(ptyId, { pty, projectId, logPath, stream });
  write({ type: 'pty_started', ts: nowIso(), ptyId, shell: defaultShell, cwd: cwd || process.cwd() });
  bus.emit('event', { source: 'pty', kind: 'pty_started', project: projectId, payload: { ptyId, shell: defaultShell } });

  pty.onData((data) => {
    write({ type: 'pty_output', ts: nowIso(), ptyId, data });
    bus.emit('event', { source: 'pty', kind: 'pty_output', project: projectId, payload: { ptyId, data } });
  });
  pty.onExit(({ exitCode, signal }) => {
    write({ type: 'pty_exit', ts: nowIso(), ptyId, exitCode, signal });
    bus.emit('event', { source: 'pty', kind: 'pty_exit', project: projectId, payload: { ptyId, exitCode, signal } });
    stream.end();
    sessions.delete(ptyId);
  });

  return { ptyId, logPath };
}

function input(ptyId, data) {
  const s = sessions.get(ptyId);
  if (!s) throw new Error('PTY not found');
  s.pty.write(data);
}

function resize(ptyId, cols, rows) {
  const s = sessions.get(ptyId);
  if (!s) throw new Error('PTY not found');
  s.pty.resize(cols, rows);
}

function kill(ptyId) {
  const s = sessions.get(ptyId);
  if (!s) return false;
  try { s.pty.kill(); } catch {}
  try { s.stream.end(); } catch {}
  sessions.delete(ptyId);
  return true;
}

module.exports = { start, input, resize, kill };

