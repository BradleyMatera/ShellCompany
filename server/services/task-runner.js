const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const bus = require('./bus');

function homeDir() {
  return os.homedir() || process.env.HOME || process.env.USERPROFILE || '.';
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true }).catch(() => {});
}

function nowIso() { return new Date().toISOString(); }

function jsonlWrite(stream, obj) {
  stream.write(JSON.stringify(obj) + '\n');
}

/**
 * Start a task as a child process and stream events
 * @param {Object} options
 * @param {string} options.projectId
 * @param {string} options.command
 * @param {string[]} [options.args]
 * @param {string} [options.cwd]
 * @param {Object} [options.env]
 */
async function startTask({ projectId, command, args = [], cwd, env = {} }) {
  const taskId = crypto.randomUUID();
  const base = path.join(homeDir(), 'ShellCompany');
  const logDir = path.join(base, '.logs', projectId);
  await ensureDir(logDir);
  const logPath = path.join(logDir, `${taskId}.jsonl`);
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  const startEvent = { type: 'task_started', ts: nowIso(), taskId, projectId, command, args, cwd: cwd || process.cwd() };
  jsonlWrite(logStream, startEvent);
  bus.emit('event', { source: 'task', kind: 'task_started', project: projectId, payload: { taskId, command, args, cwd } });

  const proc = spawn(command, args, {
    cwd: cwd || process.cwd(),
    env: { ...process.env, ...env },
    shell: true
  });

  const pid = proc.pid;
  jsonlWrite(logStream, { type: 'task_pid', ts: nowIso(), taskId, pid });
  bus.emit('event', { source: 'task', kind: 'task_pid', project: projectId, payload: { taskId, pid } });

  function handleChunk(kind, chunk) {
    const text = chunk.toString();
    jsonlWrite(logStream, { type: 'task_output', ts: nowIso(), taskId, stream: kind, data: text });
    bus.emit('event', { source: 'task', kind: 'task_output', project: projectId, payload: { taskId, stream: kind, data: text } });
  }

  proc.stdout.on('data', (d) => handleChunk('stdout', d));
  proc.stderr.on('data', (d) => handleChunk('stderr', d));

  proc.on('close', (code, signal) => {
    jsonlWrite(logStream, { type: 'task_exit', ts: nowIso(), taskId, exitCode: code, signal: signal || null });
    bus.emit('event', { source: 'task', kind: 'task_exit', project: projectId, payload: { taskId, exitCode: code, signal } });
    logStream.end();
  });

  proc.on('error', (err) => {
    jsonlWrite(logStream, { type: 'task_error', ts: nowIso(), taskId, error: err.message });
    bus.emit('event', { source: 'task', kind: 'task_error', project: projectId, payload: { taskId, error: err.message } });
    logStream.end();
  });

  return { taskId, pid, logPath };
}

async function tailLogs({ projectId, taskId, lines = 200 }) {
  const base = path.join(homeDir(), 'ShellCompany', '.logs', projectId);
  const logPath = path.join(base, `${taskId}.jsonl`);
  try {
    const buf = await fsp.readFile(logPath, 'utf8');
    const arr = buf.split('\n').filter(Boolean);
    return arr.slice(-lines).map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } });
  } catch (e) {
    return [];
  }
}

module.exports = { startTask, tailLogs };

