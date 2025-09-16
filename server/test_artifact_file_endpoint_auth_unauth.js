const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const router = require('./routes/autonomous-api').router;

(async () => {
  const app = express();
  app.use(express.json());

  // Minimal orchestrator stub
  const orchestratorStub = { _map: {}, getArtifactWithLineage(id){ return this._map[id] || null; } };
  app.locals.orchestrator = orchestratorStub;
  app.use('/api/autonomous', router);

  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;

  try {
    const wsRoot = path.join(__dirname, 'agent-workspaces');
    const agentDir = path.join(wsRoot, 'test-agent', 'artifacts');
    await fs.mkdir(agentDir, { recursive: true });
    const testFilePath = path.join(agentDir, 'test-unauth.txt');
    await fs.writeFile(testFilePath, 'unauth-test', 'utf8');

    orchestratorStub._map['unauth-1'] = { id: 'unauth-1', metadata: { absolutePath: testFilePath } };

    // No app.locals.testAuthUser injected -> ensureAuth should return 401
    const url = `http://localhost:${port}/api/autonomous/artifacts/unauth-1/file`;
    const res = await fetch(url);
    console.log('Status', res.status);
    if (res.status !== 401) throw new Error('Expected 401 for unauthenticated request');
    console.log('✅ Unauthorized access test passed');
  } catch (e) {
    console.error('❌ Test failed', e && e.stack);
    process.exitCode = 1;
  } finally {
    server.close(() => setImmediate(() => process.exit(process.exitCode || 0)));
  }
})();
