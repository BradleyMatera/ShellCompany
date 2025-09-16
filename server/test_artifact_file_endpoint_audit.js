const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const models = require('./models');
const router = require('./routes/autonomous-api').router;

(async () => {
  const app = express();
  app.use(express.json());

  // Minimal orchestrator stub
  const orchestratorStub = { _map: {}, getArtifactWithLineage(id){ return this._map[id] || null; } };
  app.locals.orchestrator = orchestratorStub;

  // Inject an authenticated test user who is the owner (id: 1)
  app.locals.testAuthUser = { id: 1, role: 'owner', email: 'owner@local' };

  app.use('/api/autonomous', router);

  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;

  try {
    // Prepare a test file under agent-workspaces/test-agent/artifacts/test-audit.txt
    const wsRoot = path.join(__dirname, 'agent-workspaces');
    const agentDir = path.join(wsRoot, 'test-agent', 'artifacts');
    await fs.mkdir(agentDir, { recursive: true });
    const testFilePath = path.join(agentDir, 'test-audit.txt');
    const content = 'audit-file-download:' + Date.now();
    await fs.writeFile(testFilePath, content, 'utf8');

    // Register lineage mapping for artifact id 'test-audit-1'
    orchestratorStub._map['test-audit-1'] = {
      id: 'test-audit-1',
      metadata: { absolutePath: testFilePath }
    };

    // Perform fetch to trigger download + audit creation
    const url = `http://localhost:${port}/api/autonomous/artifacts/test-audit-1/file`;
    console.log('Fetching', url);
    const res = await fetch(url);
    console.log('Status', res.status);
    const body = await res.text();
    console.log('Body length:', body.length);

    if (res.status !== 200 || !body.includes('audit-file-download')) {
      throw new Error('Unexpected response from file download');
    }

    // Poll the Audit table for a matching record (give the server a short moment)
    let found = null;
    for (let i = 0; i < 30; i++) {
      // Query by target and target_id
      found = await models.Audit.findOne({ where: { target: 'artifact', target_id: 'test-audit-1' }, order: [['createdAt', 'DESC']] });
      if (found) break;
      await new Promise(r => setTimeout(r, 100));
    }

    if (!found) {
      throw new Error('Expected Audit row not found after download');
    }

    console.log('✅ Audit row created:', { id: found.id, actor_id: found.actor_id, action: found.action, target_id: found.target_id });
    console.log('✅ Audit integration test passed');
  } catch (e) {
    console.error('❌ Audit integration test failed:', e && e.stack);
    process.exitCode = 1;
  } finally {
    server.close(() => setImmediate(() => process.exit(process.exitCode || 0)));
  }
})();
