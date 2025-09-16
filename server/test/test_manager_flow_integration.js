const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;
const WorkflowOrchestrator = require('../services/workflow-orchestrator');
const { sequelize } = require('../models');

describe('Manager Flow Integration Test', function() {
  this.timeout(30000); // 30 second timeout for integration tests

  let orchestrator;
  let testWorkspaceRoot;

  before(async function() {
    // Create test workspace
    testWorkspaceRoot = path.join(__dirname, 'test-workspace');
    await fs.mkdir(testWorkspaceRoot, { recursive: true });

    // Initialize orchestrator in headless mode for testing
    orchestrator = new WorkflowOrchestrator(testWorkspaceRoot, null, {
      autoStart: false,
      isHeadless: true,
      socketSafety: true
    });

    console.log('✅ Test setup complete');
  });

  after(async function() {
    // Cleanup
    if (orchestrator) {
      await orchestrator.shutdown();
    }

    // Clean up test workspace
    try {
      await fs.rmdir(testWorkspaceRoot, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    console.log('✅ Test cleanup complete');
  });

  describe('ASK Manager Lifecycle', function() {
    let workflowId;

    it('should create workflow with manager brief when directive requires clarification', async function() {
      const directive = 'have Sage create an about me and put it in an md document, I will review it later';

      const result = await orchestrator.createWorkflow(directive);
      workflowId = result.workflowId;

      assert(workflowId, 'Should return workflow ID');
      assert(result.workflow, 'Should return workflow object');

      const workflow = orchestrator.getWorkflowStatus(workflowId);
      assert(workflow, 'Workflow should exist');
      assert.strictEqual(workflow.directive, directive, 'Directive should match');

      // Check manager selection
      const managerBriefTasks = workflow.tasks.filter(t => t.type === 'manager_brief');
      assert(managerBriefTasks.length > 0, 'Should have manager brief task');

      const briefTask = managerBriefTasks[0];
      assert.strictEqual(briefTask.assignedAgent, 'Sage', 'Should assign Sage as manager based on directive');

      console.log('✅ Manager selection by intent: Sage selected for docs/DevOps directive');
    });

    it('should hold specialist tasks until brief approval', async function() {
      const workflow = orchestrator.getWorkflowStatus(workflowId);

      // Should have pending tasks stored
      assert(workflow._pendingAfterApproval, 'Should have pending tasks');
      assert(workflow._pendingAfterApproval.length > 0, 'Should have specialist tasks waiting');

      // Progress should only include manager brief tasks
      const managerBriefCount = workflow.tasks.filter(t => t.type === 'manager_brief').length;
      assert.strictEqual(workflow.progress.total, managerBriefCount, 'Progress total should only include manager brief tasks');

      console.log('✅ Specialist tasks held until brief approval');
    });

    it('should generate comprehensive manager brief with clarifying questions', async function() {
      const workflow = orchestrator.getWorkflowStatus(workflowId);
      const briefTask = workflow.tasks.find(t => t.type === 'manager_brief');

      assert(briefTask, 'Should have manager brief task');
      assert(briefTask.content, 'Brief task should have content');

      // Check brief content structure
      const content = briefTask.content;
      assert(content.includes('# Manager Brief'), 'Should have proper brief header');
      assert(content.includes('## Understanding'), 'Should have understanding section');
      assert(content.includes('## Assumptions'), 'Should have assumptions section');
      assert(content.includes('## Risks'), 'Should have risks section');
      assert(content.includes('## Plan'), 'Should have plan section');
      assert(content.includes('## Clarifying Questions'), 'Should have clarifying questions section');

      // Check metadata
      assert(briefTask.briefMeta, 'Should have brief metadata');
      assert(briefTask.briefMeta.clarifyingQuestions, 'Should have clarifying questions in metadata');

      console.log('✅ Comprehensive manager brief generated with clarifying questions');
    });

    it('should require clarification responses before proceeding', async function() {
      const workflow = orchestrator.getWorkflowStatus(workflowId);

      if (workflow.metadata?.requiresClarification) {
        assert.strictEqual(workflow.status, 'awaiting_clarification', 'Workflow should be awaiting clarification');
        assert(workflow.metadata.clarifyingQuestions.length > 0, 'Should have clarifying questions');

        console.log('✅ Workflow correctly requires clarification');
      } else {
        console.log('ℹ️ No clarification required for this directive');
      }
    });

    it('should allow responding to clarifying questions', async function() {
      const workflow = orchestrator.getWorkflowStatus(workflowId);

      if (workflow.metadata?.requiresClarification) {
        const responses = {
          'What specific filename should be used for the output?': 'ABOUT_SAGE.md',
          'What level of detail is expected?': 'Professional summary with technical background',
          'What tone should be used?': 'Professional and technical'
        };

        const result = await orchestrator.respondToClarification(workflowId, responses);
        assert(result.success, 'Should successfully record clarification responses');
        assert.strictEqual(result.status, 'proceeding', 'Should be proceeding after clarification');

        const updatedWorkflow = orchestrator.getWorkflowStatus(workflowId);
        assert(updatedWorkflow.metadata.clarificationResponses, 'Should have clarification responses stored');
        assert.strictEqual(updatedWorkflow.status, 'in_progress', 'Should be in progress after clarification');

        console.log('✅ Clarification responses recorded and workflow proceeding');
      } else {
        console.log('ℹ️ Skipping clarification test - not required');
      }
    });

    it('should approve brief and schedule pending tasks', async function() {
      const briefCompleted = {
        requestedAgent: 'Sage',
        projectType: 'documentation',
        scope: 'Basic',
        timeline: 'Standard'
      };

      const result = await orchestrator.attachBriefApproval(workflowId, briefCompleted);
      assert(result.scheduled > 0, 'Should schedule pending tasks after approval');
      assert.strictEqual(result.manager, 'Sage', 'Should set manager correctly');

      const workflow = orchestrator.getWorkflowStatus(workflowId);
      assert(workflow.brief, 'Should have brief attached');
      assert.strictEqual(workflow.manager, 'Sage', 'Should have manager set');

      // Progress total should now include all tasks including manager_review
      const totalExpected = workflow.tasks.length;
      assert.strictEqual(workflow.progress.total, totalExpected, 'Progress total should include all scheduled tasks');

      // Should have manager_review task
      const reviewTask = workflow.tasks.find(t => t.type === 'manager_review');
      assert(reviewTask, 'Should have manager review task');

      console.log('✅ Brief approved and pending tasks scheduled with manager review');
    });

    it('should complete workflow only after manager review and CEO approval', async function() {
      const workflow = orchestrator.getWorkflowStatus(workflowId);

      // Simulate completing all specialist tasks first
      for (const task of workflow.tasks) {
        if (task.type !== 'manager_review' && task.status === 'pending') {
          // Simulate task completion
          task.status = 'completed';
          task.endTime = Date.now();
        }
      }

      // Update progress to trigger completion check
      await orchestrator.updateWorkflowProgress(workflowId);

      let updatedWorkflow = orchestrator.getWorkflowStatus(workflowId);

      // Should not be completed yet - waiting for manager review
      assert.notStrictEqual(updatedWorkflow.status, 'completed', 'Should not be completed without manager review');

      // Complete manager review
      const reviewTask = updatedWorkflow.tasks.find(t => t.type === 'manager_review');
      if (reviewTask) {
        reviewTask.status = 'completed';
        reviewTask.endTime = Date.now();
      }

      await orchestrator.updateWorkflowProgress(workflowId);
      updatedWorkflow = orchestrator.getWorkflowStatus(workflowId);

      // Should be waiting for CEO approval
      assert.strictEqual(updatedWorkflow.status, 'waiting_for_ceo_approval', 'Should be waiting for CEO approval');

      // CEO approves
      await orchestrator.recordCeoApproval(workflowId, 'ceo', true);
      await orchestrator.updateWorkflowProgress(workflowId);

      const finalWorkflow = orchestrator.getWorkflowStatus(workflowId);
      assert.strictEqual(finalWorkflow.status, 'completed', 'Should be completed after CEO approval');
      assert(finalWorkflow.metadata.ceoApproved, 'Should have CEO approval recorded');

      console.log('✅ Workflow completion gates working: manager review → CEO approval → completed');
    });

    it('should track artifact lineage throughout workflow', async function() {
      const workflow = orchestrator.getWorkflowStatus(workflowId);

      // Check that artifacts have proper lineage metadata
      if (workflow.artifacts && workflow.artifacts.length > 0) {
        const artifact = workflow.artifacts[0];
        assert(artifact.lineage, 'Artifact should have lineage');
        assert(artifact.agentName, 'Artifact should have agent name');
        assert(artifact.taskId, 'Artifact should have task ID');

        console.log('✅ Artifact lineage tracking working');
      } else {
        console.log('ℹ️ No artifacts created in test workflow');
      }
    });

    it('should provide comprehensive workflow status', async function() {
      const workflow = orchestrator.getWorkflowStatus(workflowId);

      // Verify all expected workflow properties
      assert(workflow.id, 'Should have workflow ID');
      assert(workflow.directive, 'Should have directive');
      assert(workflow.status, 'Should have status');
      assert(workflow.tasks, 'Should have tasks array');
      assert(workflow.progress, 'Should have progress object');
      assert(workflow.artifacts, 'Should have artifacts array');
      assert(workflow.metadata, 'Should have metadata');

      // Progress should be accurate
      const completedTasks = workflow.tasks.filter(t => t.status === 'completed').length;
      assert.strictEqual(workflow.progress.completed, completedTasks, 'Progress completed count should be accurate');

      console.log('✅ Comprehensive workflow status available');
    });
  });

  describe('Manager Selection Logic', function() {
    it('should select Sage for DevOps/docs directives', async function() {
      const directives = [
        'Setup CI/CD pipeline for the project',
        'Create documentation for the API',
        'Deploy the application to production',
        'Write a README.md file'
      ];

      for (const directive of directives) {
        const manager = orchestrator.selectManagerForDirective(directive);
        assert.strictEqual(manager, 'Sage', `Should select Sage for: ${directive}`);
      }

      console.log('✅ Sage selection for DevOps/docs directives working');
    });

    it('should select Nova for frontend directives', async function() {
      const directives = [
        'Create a React component for user profile',
        'Build the frontend dashboard',
        'Implement responsive design'
      ];

      for (const directive of directives) {
        const manager = orchestrator.selectManagerForDirective(directive);
        assert.strictEqual(manager, 'Nova', `Should select Nova for: ${directive}`);
      }

      console.log('✅ Nova selection for frontend directives working');
    });

    it('should select Zephyr for backend directives', async function() {
      const directives = [
        'Create REST API endpoints',
        'Set up database connections',
        'Implement server-side validation'
      ];

      for (const directive of directives) {
        const manager = orchestrator.selectManagerForDirective(directive);
        assert.strictEqual(manager, 'Zephyr', `Should select Zephyr for: ${directive}`);
      }

      console.log('✅ Zephyr selection for backend directives working');
    });

    it('should detect explicit agent mentions', async function() {
      const directive = 'have Nova create a beautiful landing page';
      const explicitAgent = orchestrator.extractExplicitAgentFromDirective(directive);
      assert.strictEqual(explicitAgent, 'Nova', 'Should detect explicit Nova mention');

      const manager = orchestrator.selectManagerForDirective(directive);
      assert.strictEqual(manager, 'Nova', 'Should use explicitly mentioned agent as manager');

      console.log('✅ Explicit agent detection working');
    });
  });

  describe('Socket Safety', function() {
    it('should handle headless mode gracefully', async function() {
      assert(orchestrator.isRunningHeadless(), 'Should be running in headless mode');

      // Test socket emit in headless mode
      const result = orchestrator.safeSocketEmit('test-event', { test: 'data' });
      assert(result, 'Should handle socket emit safely in headless mode');

      console.log('✅ Socket safety working in headless mode');
    });

    it('should not crash on socket operations', async function() {
      // These operations should not throw in headless mode
      assert.doesNotThrow(() => {
        orchestrator.safeSocketEmit('workflow-created', { workflowId: 'test' });
        orchestrator.safeSocketEmit('workflow-progress', { workflowId: 'test', progress: 50 });
        orchestrator.safeSocketEmit('artifact-updated', { artifactId: 'test' });
      }, 'Socket operations should not throw in headless mode');

      console.log('✅ Socket operations safe in headless mode');
    });
  });
});

console.log('Integration test for ASK Manager Lifecycle created');