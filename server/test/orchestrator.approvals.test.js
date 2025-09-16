const path = require('path');
const fs = require('fs');

// Avoid running this legacy harness when Jest is executing (Jest loads all files under test/)
// We only invoke `run()` when not under Jest to keep this file runnable by `node`.

async function run() {
  console.log('Orchestrator Approvals Test - START');

  const WorkflowOrchestrator = require('../services/workflow-orchestrator');

  const workspaceRoot = path.join(__dirname, 'test-workspace');
  if (!fs.existsSync(workspaceRoot)) fs.mkdirSync(workspaceRoot, { recursive: true });

  const orchestrator = new WorkflowOrchestrator(workspaceRoot, null, { autoStart: false });

  // Create a workflow directive that triggers manager_brief (explicit agent Sage)
  const directive = 'Have Sage create an about me in markdown';
  const { workflowId, workflow } = await orchestrator.createWorkflow(directive);

  console.log('Created workflow:', workflowId);

  // Ensure workflow in memory has pending after approval stored
  if (!workflow._pendingAfterApproval || workflow._pendingAfterApproval.length === 0) {
    console.error('FAIL: pendingAfterApproval not set on workflow after creation');
    process.exit(1);
  }

  console.log('PASS: pendingAfterApproval recorded with', workflow._pendingAfterApproval.length, 'tasks');

  // Simulate manager brief completion object
  const briefCompleted = {
    requestedAgent: 'Sage',
    content: '# Manager Brief\nApproved',
    answers: []
  };

  const res = await orchestrator.attachBriefApproval(workflowId, briefCompleted);
  if (!res || !res.manager) {
    console.error('FAIL: attachBriefApproval did not return manager info');
    process.exit(1);
  }

  console.log('PASS: attachBriefApproval returned manager', res.manager);

  // After scheduling, tasks should include manager_review
  const updated = orchestrator.getWorkflowStatus(workflowId);
  const hasManagerReview = updated.tasks.some(t => t.type === 'manager_review');
  if (!hasManagerReview) {
    console.error('FAIL: manager_review not appended after attachBriefApproval');
    process.exit(1);
  }

  console.log('PASS: manager_review appended to tasks');

  // Simulate marking all specialist tasks completed and manager review completed
  for (const t of updated.tasks) {
    if (t.type !== 'manager_review') t.status = 'completed';
  }

  // Simulate manager completing manager_review
  const reviewTask = updated.tasks.find(t => t.type === 'manager_review');
  if (!reviewTask) {
    console.error('FAIL: manager_review task not found');
    process.exit(1);
  }
  reviewTask.status = 'completed';

  // Update progress - should wait for CEO approval before completing
  await orchestrator.updateWorkflowProgress(workflowId);
  const preCEO = orchestrator.getWorkflowStatus(workflowId);
  if (preCEO.status !== 'waiting_for_ceo_approval') {
    console.error('FAIL: Workflow should be waiting_for_ceo_approval but is', preCEO.status);
    process.exit(1);
  }

  console.log('PASS: workflow waiting_for_ceo_approval before CEO approval');

  // Now record CEO approval
  await orchestrator.recordCeoApproval(workflowId, 'ceo', true);

  const final = orchestrator.getWorkflowStatus(workflowId);
  if (final.status !== 'completed') {
    console.error('FAIL: Workflow should be completed after CEO approval but is', final.status);
    process.exit(1);
  }

  console.log('PASS: workflow completed after manager review and CEO approval');

  console.log('Orchestrator Approvals Test - SUCCESS');
  process.exit(0);
}

if (!process.env.JEST_WORKER_ID) {
  run().catch(err => {
    console.error('Orchestrator Approvals Test - ERROR', err && err.stack);
    process.exit(1);
  });
}

// Add a placeholder test so Jest registers this file as a test module but doesn't execute legacy harness logic
describe('legacy-orchestrator-harness', () => {
  test.skip('legacy harness noop under Jest', () => {});
});
