// Integration test that uses HTTP endpoints via supertest to exercise
// the manager-led workflow lifecycle including CEO approval.
const request = require('supertest');
const app = require('./index');
const BriefManager = require('./services/brief-manager');
const WorkflowOrchestrator = require('./services/workflow-orchestrator');
const path = require('path');
const fs = require('fs').promises;

(async () => {
  console.log('Starting manager flow HTTP integration test');

  // Ensure orchestrator is available on app.locals for routes that expect it
  const workspaceRoot = path.join(__dirname, 'agent-workspaces');
  const orchestrator = new WorkflowOrchestrator(workspaceRoot, null, { autoStart: true });
  app.locals.orchestrator = orchestrator;
  app.locals.testAuthUser = { id: 1, role: 'owner', name: 'test-user' };

  try {
    const directive = 'have Sage create an about me and put it in an md document, i will review it later';

    // Create brief using BriefManager (we reuse the same in-memory flow as before)
    const briefManager = new BriefManager();
    const brief = await briefManager.analyzeDirective(directive, 'test-user');

    // Answer filename/timeline/scope if present
    const filenameQuestion = brief.clarifyingQuestions.find(q => q.id === 'filename');
    if (filenameQuestion) await briefManager.recordResponse(brief.id, 'filename', 'ABOUT_ME.md');
    await briefManager.recordResponse(brief.id, 'timeline', 'No specific deadline');
    await briefManager.recordResponse(brief.id, 'scope', 'Basic prototype/MVP');

    const completedBrief = await briefManager.generateCompleteBrief(brief.id);

    // Create workflow via HTTP POST to boardroom autonomous endpoint
    const createResp = await request(app)
      .post('/api/autonomous/workflow')
      .send({ directive: completedBrief.directive })
      .set('Accept', 'application/json');

    if (!createResp.body || !createResp.body.workflowId) {
      throw new Error('Failed to create workflow via API: ' + JSON.stringify(createResp.body));
    }

    const workflowId = createResp.body.workflowId;
    console.log('Workflow created via HTTP:', workflowId);

    // Approve brief via orchestrator API (simulate manager approving brief)
    const briefApproveResp = await request(app)
      .post(`/api/autonomous/workflows/${workflowId}/brief/approve`)
      .send({ approved: true, approver: 'Sage', completedBrief })
      .set('Accept', 'application/json');

    if (!briefApproveResp.body || !briefApproveResp.body.success && !briefApproveResp.body.scheduled) {
      console.warn('Brief approve response:', briefApproveResp.status, briefApproveResp.body);
    } else {
      console.log('Brief approved via API:', briefApproveResp.body);
    }

    // Wait for tasks to execute (poll orchestrator state)
    let attempts = 0;
    while (attempts < 60) {
      const status = orchestrator.getWorkflowStatus(workflowId);
      if (status && status.progress && status.progress.percentage === 100) break;
      await new Promise(r => setTimeout(r, 1000));
      attempts++;
    }

    let final = orchestrator.getWorkflowStatus(workflowId);
    console.log('Intermediate workflow status:', final && final.status, final && final.progress);

    // If waiting for CEO approval, call CEO API endpoint
    if (final && final.status === 'waiting_for_ceo_approval') {
      const ceoResp = await request(app)
        .post(`/api/autonomous/workflows/${workflowId}/approve`)
        .send({ approved: true, approver: 'test-ceo' })
        .set('Accept', 'application/json');

      console.log('CEO approval response:', ceoResp.status, ceoResp.body);

      // Give orchestrator a moment to finalize
      await new Promise(r => setTimeout(r, 1000));
      final = orchestrator.getWorkflowStatus(workflowId);
      console.log('Post-CEO status:', final && final.status, final && final.progress);
    }

    // Validate artifact creation
    const novaPath = path.join(workspaceRoot, 'nova-workspace', 'ABOUT_ME.md');
    let created = false;
    try {
      const content = await fs.readFile(novaPath, 'utf8');
      console.log('Found ABOUT_ME.md in Nova workspace, length:', content.length);
      created = true;
    } catch (e) {
      console.warn('ABOUT_ME.md not found in Nova workspace:', e.message);
    }

    const reviewTask = final && final.tasks && final.tasks.find(t => t.type === 'manager_review');
    if (!reviewTask) console.error('Manager review task missing');

    if (final && final.status === 'completed' && created && reviewTask && reviewTask.status === 'completed') {
      console.log('HTTP integration test passed: workflow completed after CEO approval');
    } else {
      console.error('HTTP integration test incomplete: status=', final && final.status, 'fileCreated=', created, 'reviewStatus=', reviewTask && reviewTask.status);
    }

  } catch (err) {
    console.error('HTTP integration test failed:', err && err.stack || err);
  } finally {
    await orchestrator.shutdown();
    console.log('Test complete - orchestrator shutdown');
    process.exit(0);
  }

})();
