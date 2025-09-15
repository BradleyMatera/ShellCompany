const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
// Use global fetch (Node 18+/23+). Do not require node-fetch which may be ESM-only.
const apiModule = require('./routes/autonomous-api');
const router = apiModule.router || apiModule;

(async () => {
  const app = express();
  app.use(express.json());

  // Minimal orchestrator stub with getArtifactWithLineage
  const orchestratorStub = {
    getArtifactWithLineage(id) {
      // will be set dynamically
      return this._map && this._map[id] ? this._map[id] : null;
    },
    _map: {}
  };

  app.locals.orchestrator = orchestratorStub;
  app.use('/api/autonomous', router);

  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, res));
  const port = server.address().port;

  try {
    // Prepare a test file under agent-workspaces/test-agent/artifacts/test.txt
    const wsRoot = path.join(__dirname, 'agent-workspaces');
    const agentDir = path.join(wsRoot, 'test-agent', 'artifacts');
    await fs.mkdir(agentDir, { recursive: true });
    const testFilePath = path.join(agentDir, 'test.txt');
    const content = 'integration-file-download:' + Date.now();
    await fs.writeFile(testFilePath, content, 'utf8');

    // Register lineage mapping for artifact id 'test-file-1'
    orchestratorStub._map['test-file-1'] = {
      id: 'test-file-1',
      metadata: { absolutePath: testFilePath }
    };

    // Fetch the file via the endpoint
    const url = `http://localhost:${port}/api/autonomous/artifacts/test-file-1/file`;
    console.log('Fetching', url);
    const res = await fetch(url);
    console.log('Status', res.status);
    const body = await res.text();
    console.log('Body length:', body.length);

    if (res.status !== 200 || !body.includes('integration-file-download')) {
      throw new Error('Unexpected response');
    }

    console.log('✅ Integration test for artifact file endpoint passed');
  } catch (e) {
    console.error('❌ Integration test failed:', e && e.stack);
    process.exitCode = 1;
    } finally {
      server.close(() => {
        // Ensure process exits so test harness doesn't hang if other timers were started by required modules
        setImmediate(() => process.exit(process.exitCode || 0));
      });
    }
})();
