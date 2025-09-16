// Ensure uuid mock for Jest compatibility
jest.mock('uuid', () => ({ v4: () => `test-uuid-${Date.now()}-${Math.random().toString(36).slice(2,8)}` }));

const request = require('supertest');
const path = require('path');
const fs = require('fs');

const app = require('../index');
const WorkflowOrchestrator = require('../services/workflow-orchestrator');

describe('API approval endpoints (integration)', () => {
  let orchestrator;
  let server;

  beforeAll(async () => {
    // Inject a test orchestrator into app.locals to avoid starting real socket.io
    const workspaceRoot = path.join(__dirname, 'test-workspace-api');
    if (!fs.existsSync(workspaceRoot)) fs.mkdirSync(workspaceRoot, { recursive: true });
    orchestrator = new WorkflowOrchestrator(workspaceRoot, null, { autoStart: false });
    app.locals.orchestrator = orchestrator;
    // Provide a test auth user to bypass ensureAuth
    app.locals.testAuthUser = { id: 1, name: 'Test User', role: 'admin' };

    server = app.listen(0); // ephemeral port
  });

  afterAll(async () => {
    try { await orchestrator.shutdown(); } catch (e) { /* ignore */ }
    // Attempt to shutdown other global services to allow Jest to exit cleanly
    try { const taskQueue = require('../services/task-queue'); if (taskQueue && typeof taskQueue.shutdown === 'function') await taskQueue.shutdown(); } catch (e) {}
    try { const health = require('../services/health-monitor'); if (health && typeof health.shutdown === 'function') await health.shutdown(); } catch (e) {}
    try { const agentEngine = require('../services/agent-engine'); if (agentEngine && typeof agentEngine.shutdown === 'function') await agentEngine.shutdown(); } catch (e) {}
    try { server && server.close(); } catch (e) { /* ignore */ }
  });

  test('create workflow and approve brief and CEO via API', async () => {
    // Create workflow via API; use a directive known to trigger manager_brief tasks
    const directive = 'Have Sage create an about me in markdown';
    const createRes = await request(server)
      .post('/api/autonomous/workflow')
      .send({ directive })
      .expect(200);

    expect(createRes.body.success).toBe(true);
    const workflowId = createRes.body.workflowId;
    expect(workflowId).toBeTruthy();

    // Fetch workflow status and assert it has pending tasks
    const statusRes = await request(server).get(`/api/autonomous/workflows/${workflowId}`).expect(200);
    expect(statusRes.body.workflow).toBeTruthy();
    const wf = statusRes.body.workflow;
    // If the directive created a manager brief, _pendingAfterApproval will be present; otherwise continue
    if (wf._pendingAfterApproval) {
      expect(Array.isArray(wf._pendingAfterApproval)).toBe(true);
      expect(wf._pendingAfterApproval.length).toBeGreaterThan(0);
    }

    // Approve manager brief via API
    const brief = { requestedAgent: 'Sage', content: 'Approved brief' };
    const approveRes = await request(server)
      .post(`/api/autonomous/workflows/${workflowId}/brief/approve`)
      .send({ approved: true, approver: 'manager', completedBrief: brief })
      .expect(200);

    expect(approveRes.body.success).toBe(true);

    // Simulate marking tasks completed (the orchestrator relies on task status in-memory)
    const updated = orchestrator.getWorkflowStatus(workflowId);
    expect(updated).toBeTruthy();
    // mark everything except manager_review as completed
    for (const t of updated.tasks) {
      if (t.type !== 'manager_review') t.status = 'completed';
    }
    const review = updated.tasks.find(t => t.type === 'manager_review');
    expect(review).toBeTruthy();
    review.status = 'completed';

    // Call update progress to transition to waiting_for_ceo_approval
    await orchestrator.updateWorkflowProgress(workflowId);
    const preCEO = orchestrator.getWorkflowStatus(workflowId);
    expect(preCEO.status).toBe('waiting_for_ceo_approval');

    // Post CEO approval via API
    const ceoRes = await request(server)
      .post(`/api/autonomous/workflows/${workflowId}/approve`)
      .send({ approved: true, approver: 'ceo' })
      .expect(200);

    expect(ceoRes.body.success).toBe(true);

    // Verify final workflow state
    const final = orchestrator.getWorkflowStatus(workflowId);
    expect(final.status).toBe('completed');
  });
});
