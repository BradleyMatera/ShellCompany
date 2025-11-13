const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { resolve(false); });
    socket.connect(port, host);
  });
}

function startProcess(cmd, args, opts) {
  const proc = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  proc.on('exit', (code) => {
    console.log(`${cmd} exited with ${code}`);
  });
  return proc;
}

(async function main() {
  try {
    const root = path.resolve(__dirname, '..');
    const serverPort = parseInt(process.env.API_PORT || process.env.PORT || '3001', 10);
    const clientCmd = process.env.CLIENT_CMD || 'cd client && npm start';

    const serverRunning = await isPortOpen(serverPort);
    if (!serverRunning) {
      console.log(`Starting server (port ${serverPort})...`);
      startProcess('bash', ['-lc', 'cd server && npm run de'], { cwd: root });
      // wait for server to be ready
      for (let i = 0; i < 30; i++) {
        if (await isPortOpen(serverPort)) break;
        await new Promise(r => setTimeout(r, 500));
      }
    } else {
      console.log(`Server already running on port ${serverPort}`);
    }

    console.log('Starting client...');
    startProcess('bash', ['-lc', clientCmd], { cwd: root });

    console.log('Dev orchestration started — server and client should be running.');
  } catch (e) {
    console.error('Dev orchestration failed:', e);
    process.exit(1);
  }
})();
