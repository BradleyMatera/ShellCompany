const { Workflow } = require('./models');
const WorkflowOrchestrator = require('./services/workflow-orchestrator');

(async () => {
  try {
    const directive = 'Bring me 3 ideas about improving onboarding flow';

    // Instantiate a local orchestrator (same pattern as reconcile test)
    const orchestrator = new WorkflowOrchestrator(__dirname + '/agent-workspaces', null, { autoStart: false });

    const { workflowId, workflow } = await orchestrator.createWorkflow(directive);
    console.log('Local orchestrator created workflow:', workflowId, 'tasks:', workflow.tasks.length);

    // Wait briefly for persistence
    await new Promise(r => setTimeout(r, 500));

    const wf = await Workflow.findByPk(workflowId);
    if (!wf) {
      console.error('Workflow not found in DB');
      process.exitCode = 2;
      return;
    }

  console.log('Workflow found, tasks count:', (wf.tasks && wf.tasks.length) || 0);
  console.log('Workflow tasks:', JSON.stringify(wf.tasks, null, 2));

    // Look for planning task assigned to Alex or a task whose title contains 'plan'
    const planning = (wf.tasks || []).find(t => {
      const agentMatch = (t.assignedAgent || '').toLowerCase() === 'alex';
      const titleMatch = (t.title || '').toLowerCase().includes('plan');
      return agentMatch || titleMatch;
    });

    if (!planning) {
      console.error('Planning task (Alex) not found -- workflow tasks above for debugging');
      process.exitCode = 2;
      return;
    }

    // Confirm there are at least one per-agent idea tasks (title contains 'brainstorm' or 'ideas')
    const ideaTasks = (wf.tasks || []).filter(t => {
      const title = (t.title || '').toLowerCase();
      return title.includes('brainstorm') || title.includes('idea');
    });
    console.log('Idea tasks found:', ideaTasks.length);

    if (ideaTasks.length === 0) {
      console.error('No idea-generation tasks created');
      process.exitCode = 2;
      // Shutdown orchestrator
      if (typeof orchestrator.shutdown === 'function') await orchestrator.shutdown();
      return;
    }

    console.log('Test passed: Brainstorm workflow created and tasks persisted');

    if (typeof orchestrator.shutdown === 'function') await orchestrator.shutdown();
  } catch (e) {
    console.error('Integration test error:', e && e.stack);
    process.exitCode = 1;
  }
})();
