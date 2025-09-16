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

  // Inject a non-owner user (id 999, role 'user')
  app.locals.testAuthUser = { id: 999, role: 'user', email: 'nonowner@local' };

  app.use('/api/autonomous', router);

  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;

  try {
    // Prepare a test file and also create a DB Artifact and Project owned by another user
    const wsRoot = path.join(__dirname, 'agent-workspaces');
    const agentDir = path.join(wsRoot, 'test-agent', 'artifacts');
    await fs.mkdir(agentDir, { recursive: true });
    const testFilePath = path.join(agentDir, 'test-forbid.txt');
    await fs.writeFile(testFilePath, 'forbid-test', 'utf8');

    // Create a project owned by user id 1
    const proj = await models.Project.create({ name: 'forbid-proj', owner_id: 1, description: 'forbid test', file_system_path: testFilePath }).catch(() => null);
    const art = await models.Artifact.create({ project_id: proj ? proj.id : '1', path: testFilePath, sha256: 'dummysha1', bytes: 9 }).catch(() => null);

    // Orchestrator lineage mapping
    orchestratorStub._map['forbid-1'] = { id: 'forbid-1', metadata: { absolutePath: testFilePath } };

    const url = `http://localhost:${port}/api/autonomous/artifacts/forbid-1/file`;
    const res = await fetch(url);
    console.log('Status', res.status);
    if (res.status !== 403) throw new Error('Expected 403 for forbidden request');
    console.log('✅ Forbidden access test passed');
  } catch (e) {
    console.error('❌ Test failed', e && e.stack);
    process.exitCode = 1;
  } finally {
    server.close(() => setImmediate(() => process.exit(process.exitCode || 0)));
  }
})();
