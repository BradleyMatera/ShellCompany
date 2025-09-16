// Mock 'uuid' to avoid ESM-only uuid package parsing inside Jest runtime
jest.mock('uuid', () => ({ v4: () => `test-uuid-${Date.now()}-${Math.random().toString(36).slice(2,8)}` }));

const path = require('path');
const fs = require('fs');
const WorkflowOrchestrator = require('../services/workflow-orchestrator');

describe('Orchestrator manager approval lifecycle', () => {
  let orchestrator;
  let workspaceRoot;

  beforeAll(async () => {
    workspaceRoot = path.join(__dirname, 'test-workspace');
    if (!fs.existsSync(workspaceRoot)) fs.mkdirSync(workspaceRoot, { recursive: true });
    orchestrator = new WorkflowOrchestrator(workspaceRoot, null, { autoStart: false });
  });

  afterAll(async () => {
    // best-effort cleanup
    try { await orchestrator.shutdown && orchestrator.shutdown(); } catch (e) { /* ignore */ }
  });

  test('flows through manager brief -> schedule -> manager_review -> CEO approval -> completed', async () => {
    const directive = 'Have Sage create an about me in markdown';
    const { workflowId, workflow } = await orchestrator.createWorkflow(directive);

    expect(workflowId).toBeTruthy();
    expect(workflow._pendingAfterApproval && workflow._pendingAfterApproval.length).toBeGreaterThan(0);

    const briefCompleted = {
      requestedAgent: 'Sage',
      content: '# Manager Brief\nApproved',
      answers: []
    };

    const res = await orchestrator.attachBriefApproval(workflowId, briefCompleted);
    expect(res).toBeTruthy();
    expect(res.manager).toBeTruthy();

    const updated = orchestrator.getWorkflowStatus(workflowId);
    expect(updated.tasks.some(t => t.type === 'manager_review')).toBe(true);

    // mark all specialist tasks completed
    for (const t of updated.tasks) {
      if (t.type !== 'manager_review') t.status = 'completed';
    }

    const reviewTask = updated.tasks.find(t => t.type === 'manager_review');
    expect(reviewTask).toBeTruthy();
    reviewTask.status = 'completed';

    await orchestrator.updateWorkflowProgress(workflowId);
    const preCEO = orchestrator.getWorkflowStatus(workflowId);
    expect(preCEO.status).toBe('waiting_for_ceo_approval');

    await orchestrator.recordCeoApproval(workflowId, 'ceo', true);
    const final = orchestrator.getWorkflowStatus(workflowId);
    expect(final.status).toBe('completed');
  });
});
