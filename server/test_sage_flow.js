const path = require('path');
const fs = require('fs').promises;

const BriefManager = require('./services/brief-manager');
const WorkflowOrchestrator = require('./services/workflow-orchestrator');

(async () => {
  try {
    const workspaceRoot = path.join(__dirname, 'agent-workspaces');
    const socketMock = { emit: (ev, payload) => console.log('[SOCKET EMIT]', ev, payload && payload.workflowId ? payload.workflowId : '') };

  const briefManager = new BriefManager();
  const orchestrator = new WorkflowOrchestrator(workspaceRoot, socketMock);

    // Ensure agent workspaces exist so command execution has valid cwd
  const workspaceManager = require('./services/workspace-manager');
  await workspaceManager.ensureAgentWorkspace('sage');
  await workspaceManager.ensureAgentWorkspace('alex');

    // Analyze directive naming Sage
    const directive = 'have Sage create an about me and put it in an md document, i will review it later.';
    console.log('ANALYZE:', directive);
    const brief = await briefManager.analyzeDirective(directive);
    console.log('Analysis:', brief.analysis);

    // Approve / generate completed brief (simulate answering any clarifiers)
    // If there are clarifyingQuestions that need answers, provide defaults
    for (const q of brief.clarifyingQuestions) {
      if (!brief.responses.has(q.id)) {
        // Provide reasonable defaults for required high-priority questions
        const answer = q.id === 'timeline' ? 'Standard (Half day)' : (q.id === 'scope' ? 'Basic prototype/MVP' : (q.id === 'filename' ? 'about-me.md' : 'Default'));
        await briefManager.recordResponse(brief.id, q.id, answer);
      }
    }

    const completed = await briefManager.generateCompleteBrief(brief.id);
    console.log('Completed brief:', completed);

    // Create workflow from brief
    const { workflowId, workflow } = await orchestrator.createWorkflow(completed.directive, completed);
    console.log('Workflow created:', workflowId);
  console.log('Initial workflow tasks:');
  workflow.tasks.forEach(t => console.log(` - ${t.title} [${t.id}] assigned to ${t.assignedAgent} status=${t.status}`));

    // Poll until workflow completes (with timeout)
    const start = Date.now();
    const timeoutMs = 60000; // 60s
    while (true) {
  const status = orchestrator.getWorkflowStatus(workflowId);
  console.log(`Workflow status: ${status.status} - progress: ${JSON.stringify(status.progress)}`);
  // print tasks statuses and agent status
  status.tasks.forEach(t => console.log(`   task: ${t.title} assigned=${t.assignedAgent} status=${t.status}`));
  const agentStatus = orchestrator.getAgentStatus();
  console.log('   Agent statuses:', agentStatus.map(a => `${a.name}:${a.status} artifacts=${a.artifacts}`).join(' | '));
      if (status.status === 'completed' || status.status === 'failed') break;
      if (Date.now() - start > timeoutMs) {
        console.error('Timeout waiting for workflow completion');
        break;
      }
      // Process next task tick manually to speed up in case interval is delayed
      await orchestrator.processNextTask();
      await new Promise(r => setTimeout(r, 500));
    }

    // After completion, check Sage workspace
    const sageWorkspace = path.join(workspaceRoot, 'sage-workspace');
    const aboutPath = path.join(sageWorkspace, 'about-me.md');

    try {
      const content = await fs.readFile(aboutPath, 'utf8');
      console.log('\nABOUT-ME.MD CONTENT:\n', content);
      const stats = await fs.stat(aboutPath);
      console.log('File size:', stats.size);
    } catch (e) {
      console.error('Failed to read about-me.md from Sage workspace:', e.message);
    }

    // Print artifacts with lineage for Sage from orchestrator
    const sageArtifacts = orchestrator.getAgentArtifactsWithLineage('Sage');
    console.log('\nSage Artifacts (with lineage):', JSON.stringify(sageArtifacts, null, 2));

    // Attempt an immediate reconciliation to persist any deferred artifacts
    try {
      const reconciled = await orchestrator.reconcilePendingArtifactsOnce();
      console.log('[TEST] Reconciled pending artifacts count:', reconciled);
    } catch (e) {
      console.warn('[TEST] Reconciliation call failed:', e && e.message);
    }

    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(2);
  }
})();
