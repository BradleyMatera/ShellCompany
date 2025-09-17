const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * CEO Approval Manager - Enforces explicit CEO approval before workflow completion
 * No workflow can reach 100% completion without recorded CEO approval
 * Provides audit trail and approval workflow management
 */
class CeoApprovalManager extends EventEmitter {
  constructor(database) {
    super();
    this.database = database;
    
    // In-memory approval state tracking
    this.pendingApprovals = new Map(); // workflowId -> approval request
    this.approvalHistory = new Map();  // workflowId -> approval record
    this.blockedWorkflows = new Set(); // workflowIds awaiting approval
    
    // Approval request queue for batch processing
    this.approvalQueue = [];
    
    // CEO notification preferences
    this.notificationSettings = {
      emailOnPending: true,
      slackOnPending: true,
      digestFrequency: 'immediate', // immediate | hourly | daily
      minimumWorkflowValue: 0 // Only notify for workflows above this value
    };
    
    console.log('[CEO-APPROVAL] ✅ CEO Approval Manager initialized');
  }

  /**
   * Submit workflow for CEO approval - BLOCKS completion until approved
   */
  async submitForApproval(workflowId, workflowData, submittedBy = 'system') {
    try {
      const approvalRequest = {
        id: crypto.randomUUID(),
        workflowId,
        submittedBy,
        submittedAt: new Date().toISOString(),
        status: 'pending',
        workflowData: {
          directive: workflowData.directive,
          manager: workflowData.manager || 'Unknown',
          tasksCompleted: workflowData.progress?.completed || 0,
          totalTasks: workflowData.progress?.total || 0,
          artifacts: workflowData.artifacts?.length || 0,
          estimatedValue: this.calculateWorkflowValue(workflowData),
          riskLevel: this.assessRiskLevel(workflowData),
          duration: workflowData.totalDuration || 0,
          cost: workflowData.metadata?.estimatedCost || 0
        },
        reviewData: {
          managerReview: workflowData.tasks?.find(t => t.type === 'manager_review'),
          qualityScore: this.calculateQualityScore(workflowData),
          completionRate: this.calculateCompletionRate(workflowData),
          complianceChecks: this.runComplianceChecks(workflowData)
        }
      };

      // Store in pending approvals
      this.pendingApprovals.set(workflowId, approvalRequest);
      this.blockedWorkflows.add(workflowId);

      // Persist to database
      await this.persistApprovalRequest(approvalRequest);

      // Mark workflow as blocked in database
      if (this.database?.Workflow) {
        await this.database.Workflow.update({
          status: 'waiting_for_ceo_approval',
          metadata: {
            ...workflowData.metadata,
            ceoApprovalRequested: true,
            ceoApprovalRequestId: approvalRequest.id,
            ceoApprovalSubmittedAt: approvalRequest.submittedAt,
            ceoApprovalSubmittedBy: submittedBy
          }
        }, { where: { id: workflowId } });
      }

      console.log(`[CEO-APPROVAL] 🔒 Workflow ${workflowId} submitted for CEO approval (${approvalRequest.id})`);
      console.log(`[CEO-APPROVAL] 📊 Quality: ${approvalRequest.reviewData.qualityScore}%, Risk: ${approvalRequest.workflowData.riskLevel}, Value: $${approvalRequest.workflowData.estimatedValue}`);

      // Notify CEO if configured
      await this.notifyCEO(approvalRequest);

      // Emit event for real-time UI updates
      this.emit('approvalRequested', {
        workflowId,
        approvalRequestId: approvalRequest.id,
        workflowData: approvalRequest.workflowData,
        reviewData: approvalRequest.reviewData
      });

      return {
        success: true,
        approvalRequestId: approvalRequest.id,
        status: 'pending',
        message: 'Workflow submitted for CEO approval and blocked from completion'
      };

    } catch (error) {
      console.error(`[CEO-APPROVAL] ❌ Failed to submit workflow ${workflowId} for approval:`, error.message);
      throw new Error(`Failed to submit for CEO approval: ${error.message}`);
    }
  }

  /**
   * Process CEO approval decision - ONLY this unblocks workflow completion
   */
  async processApprovalDecision(workflowId, decision, approver = 'ceo', comments = '') {
    try {
      const approvalRequest = this.pendingApprovals.get(workflowId);
      
      if (!approvalRequest) {
        throw new Error(`No pending approval request found for workflow ${workflowId}`);
      }

      if (!['approved', 'rejected', 'needs_revision'].includes(decision)) {
        throw new Error('Decision must be approved, rejected, or needs_revision');
      }

      const approvalRecord = {
        id: crypto.randomUUID(),
        workflowId,
        approvalRequestId: approvalRequest.id,
        decision,
        approver,
        approvedAt: new Date().toISOString(),
        comments: comments.trim(),
        previousStatus: approvalRequest.status,
        approvalChain: [{
          approver,
          decision,
          timestamp: new Date().toISOString(),
          comments
        }]
      };

      // Update request status
      approvalRequest.status = decision;
      approvalRequest.processedAt = approvalRecord.approvedAt;
      approvalRequest.processedBy = approver;

      // Store approval history
      this.approvalHistory.set(workflowId, approvalRecord);

      if (decision === 'approved') {
        // UNBLOCK workflow - allow completion
        this.blockedWorkflows.delete(workflowId);
        this.pendingApprovals.delete(workflowId);

        // Update workflow in database to mark as CEO approved
        if (this.database?.Workflow) {
          await this.database.Workflow.update({
            status: 'completed', // Allow completion now
            metadata: {
              ...approvalRequest.workflowData,
              ceoApproved: true,
              ceoApprovedBy: approver,
              ceoApprovedAt: approvalRecord.approvedAt,
              ceoComments: comments,
              approvalRecordId: approvalRecord.id
            }
          }, { where: { id: workflowId } });
        }

        console.log(`[CEO-APPROVAL] ✅ Workflow ${workflowId} APPROVED by ${approver} - UNBLOCKED for completion`);
        
      } else if (decision === 'rejected') {
        // Keep blocked, mark as rejected
        this.pendingApprovals.delete(workflowId);

        if (this.database?.Workflow) {
          await this.database.Workflow.update({
            status: 'rejected',
            metadata: {
              ...approvalRequest.workflowData,
              ceoApproved: false,
              ceoRejectedBy: approver,
              ceoRejectedAt: approvalRecord.approvedAt,
              ceoRejectionReason: comments,
              approvalRecordId: approvalRecord.id
            }
          }, { where: { id: workflowId } });
        }

        console.log(`[CEO-APPROVAL] ❌ Workflow ${workflowId} REJECTED by ${approver}: ${comments}`);
        
      } else if (decision === 'needs_revision') {
        // Keep in pending, request changes
        if (this.database?.Workflow) {
          await this.database.Workflow.update({
            status: 'needs_revision',
            metadata: {
              ...approvalRequest.workflowData,
              ceoRequestedRevision: true,
              ceoRevisionRequestedBy: approver,
              ceoRevisionRequestedAt: approvalRecord.approvedAt,
              ceoRevisionComments: comments,
              approvalRecordId: approvalRecord.id
            }
          }, { where: { id: workflowId } });
        }

        console.log(`[CEO-APPROVAL] 🔄 Workflow ${workflowId} needs revision per ${approver}: ${comments}`);
      }

      // Persist approval decision
      await this.persistApprovalDecision(approvalRecord);

      // Emit events for real-time updates
      this.emit('approvalDecision', {
        workflowId,
        decision,
        approver,
        comments,
        approvalRecord,
        unblocked: decision === 'approved'
      });

      return {
        success: true,
        decision,
        approvalRecordId: approvalRecord.id,
        unblocked: decision === 'approved',
        message: decision === 'approved' 
          ? 'Workflow approved and unblocked for completion'
          : decision === 'rejected'
          ? 'Workflow rejected and will remain blocked'
          : 'Workflow returned for revision'
      };

    } catch (error) {
      console.error(`[CEO-APPROVAL] ❌ Failed to process approval decision for ${workflowId}:`, error.message);
      throw new Error(`Failed to process approval: ${error.message}`);
    }
  }

  /**
   * Check if workflow is blocked by CEO approval requirement
   */
  isWorkflowBlocked(workflowId) {
    return this.blockedWorkflows.has(workflowId);
  }

  /**
   * Get pending approval requests for CEO dashboard
   */
  getPendingApprovals() {
    const pending = Array.from(this.pendingApprovals.values())
      .filter(req => req.status === 'pending')
      .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

    return pending.map(req => ({
      id: req.id,
      workflowId: req.workflowId,
      submittedAt: req.submittedAt,
      submittedBy: req.submittedBy,
      directive: req.workflowData.directive,
      manager: req.workflowData.manager,
      qualityScore: req.reviewData.qualityScore,
      riskLevel: req.workflowData.riskLevel,
      estimatedValue: req.workflowData.estimatedValue,
      artifactCount: req.workflowData.artifacts,
      duration: req.workflowData.duration,
      completionRate: req.reviewData.completionRate,
      complianceIssues: req.reviewData.complianceChecks.filter(c => !c.passed).length
    }));
  }

  /**
   * Get approval history for audit trails
   */
  getApprovalHistory(workflowId = null) {
    if (workflowId) {
      return this.approvalHistory.get(workflowId) || null;
    }
    
    return Array.from(this.approvalHistory.values())
      .sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt));
  }

  /**
   * Calculate estimated business value of workflow
   */
  calculateWorkflowValue(workflowData) {
    const baseValue = 100; // Base value for any completed workflow
    const artifactValue = (workflowData.artifacts?.length || 0) * 50;
    const complexityValue = (workflowData.progress?.total || 0) * 25;
    const durationBonus = workflowData.totalDuration > 300000 ? 200 : 100; // Bonus for complex workflows
    
    return baseValue + artifactValue + complexityValue + durationBonus;
  }

  /**
   * Assess risk level of workflow
   */
  assessRiskLevel(workflowData) {
    let riskScore = 0;
    
    // Risk factors
    if ((workflowData.artifacts?.length || 0) > 5) riskScore += 2;
    if (workflowData.directive?.toLowerCase().includes('production')) riskScore += 3;
    if (workflowData.directive?.toLowerCase().includes('deploy')) riskScore += 3;
    if (workflowData.directive?.toLowerCase().includes('delete')) riskScore += 5;
    if (workflowData.directive?.toLowerCase().includes('security')) riskScore += 2;
    if ((workflowData.progress?.total || 0) > 10) riskScore += 1;
    
    if (riskScore >= 7) return 'high';
    if (riskScore >= 4) return 'medium';
    return 'low';
  }

  /**
   * Calculate quality score based on workflow execution
   */
  calculateQualityScore(workflowData) {
    let score = 70; // Base score
    
    // Quality factors
    const completionRate = this.calculateCompletionRate(workflowData);
    score += completionRate * 0.3; // Up to 30 points for completion
    
    if (workflowData.tasks?.some(t => t.type === 'manager_review')) score += 10;
    if (workflowData.artifacts?.length > 0) score += 10;
    if (workflowData.manager && workflowData.manager !== 'Unknown') score += 5;
    if (workflowData.totalDuration && workflowData.totalDuration < 600000) score += 5; // Efficiency bonus
    
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Calculate completion rate
   */
  calculateCompletionRate(workflowData) {
    const completed = workflowData.progress?.completed || 0;
    const total = workflowData.progress?.total || 1;
    return Math.round((completed / total) * 100);
  }

  /**
   * Run compliance checks
   */
  runComplianceChecks(workflowData) {
    const checks = [
      {
        name: 'Manager Review',
        passed: workflowData.tasks?.some(t => t.type === 'manager_review' && t.status === 'completed'),
        required: true,
        description: 'Workflow must have completed manager review'
      },
      {
        name: 'Artifact Documentation',
        passed: (workflowData.artifacts?.length || 0) === 0 || workflowData.artifacts?.every(a => a.name && a.agentName),
        required: true,
        description: 'All artifacts must be properly documented'
      },
      {
        name: 'Task Completion',
        passed: this.calculateCompletionRate(workflowData) === 100,
        required: true,
        description: 'All tasks must be completed'
      },
      {
        name: 'Security Review',
        passed: !workflowData.directive?.toLowerCase().includes('security') || 
                workflowData.tasks?.some(t => t.assignedAgent === 'Cipher'),
        required: false,
        description: 'Security-related workflows should include Cipher review'
      },
      {
        name: 'Quality Assurance',
        passed: this.calculateQualityScore(workflowData) >= 80,
        required: false,
        description: 'Workflow should meet quality standards'
      }
    ];

    return checks;
  }

  /**
   * Notify CEO of pending approvals
   */
  async notifyCEO(approvalRequest) {
    try {
      // In a real implementation, this would send actual notifications
      console.log(`[CEO-APPROVAL] 📧 CEO notification: Workflow ${approvalRequest.workflowId} pending approval`);
      console.log(`[CEO-APPROVAL] 📋 Summary: ${approvalRequest.workflowData.directive}`);
      console.log(`[CEO-APPROVAL] 🎯 Quality: ${approvalRequest.reviewData.qualityScore}%, Risk: ${approvalRequest.workflowData.riskLevel}`);
      
      // Emit notification event for real-time systems
      this.emit('ceoNotification', {
        type: 'approval_required',
        approvalRequestId: approvalRequest.id,
        workflowId: approvalRequest.workflowId,
        urgency: approvalRequest.workflowData.riskLevel === 'high' ? 'high' : 'normal',
        summary: {
          directive: approvalRequest.workflowData.directive,
          manager: approvalRequest.workflowData.manager,
          qualityScore: approvalRequest.reviewData.qualityScore,
          riskLevel: approvalRequest.workflowData.riskLevel
        }
      });

    } catch (error) {
      console.error('[CEO-APPROVAL] ❌ Failed to notify CEO:', error.message);
    }
  }

  /**
   * Persist approval request to database
   */
  async persistApprovalRequest(approvalRequest) {
    try {
      // In a real implementation, this would use a dedicated approvals table
      console.log(`[CEO-APPROVAL] 💾 Persisting approval request ${approvalRequest.id}`);
      
      // For now, we'll store in workflow metadata
      // In production, create dedicated approval_requests table
      
    } catch (error) {
      console.error('[CEO-APPROVAL] ❌ Failed to persist approval request:', error.message);
    }
  }

  /**
   * Persist approval decision to database
   */
  async persistApprovalDecision(approvalRecord) {
    try {
      console.log(`[CEO-APPROVAL] 💾 Persisting approval decision ${approvalRecord.id}`);
      
      // In production, store in approval_decisions table with full audit trail
      
    } catch (error) {
      console.error('[CEO-APPROVAL] ❌ Failed to persist approval decision:', error.message);
    }
  }

  /**
   * Generate approval analytics for CEO dashboard
   */
  getApprovalAnalytics() {
    const allHistory = Array.from(this.approvalHistory.values());
    const pending = Array.from(this.pendingApprovals.values()).filter(r => r.status === 'pending');
    
    const approved = allHistory.filter(r => r.decision === 'approved');
    const rejected = allHistory.filter(r => r.decision === 'rejected');
    const needsRevision = allHistory.filter(r => r.decision === 'needs_revision');
    
    const avgApprovalTime = approved.length > 0 
      ? approved.reduce((sum, r) => {
          const requestTime = new Date(r.approvedAt);
          const submitTime = new Date(this.pendingApprovals.get(r.workflowId)?.submittedAt || r.approvedAt);
          return sum + (requestTime - submitTime);
        }, 0) / approved.length
      : 0;

    return {
      summary: {
        totalRequests: allHistory.length + pending.length,
        pending: pending.length,
        approved: approved.length,
        rejected: rejected.length,
        needsRevision: needsRevision.length,
        avgApprovalTimeMs: avgApprovalTime
      },
      riskDistribution: {
        high: [...allHistory, ...pending].filter(r => 
          (r.workflowData || this.pendingApprovals.get(r.workflowId)?.workflowData)?.riskLevel === 'high'
        ).length,
        medium: [...allHistory, ...pending].filter(r => 
          (r.workflowData || this.pendingApprovals.get(r.workflowId)?.workflowData)?.riskLevel === 'medium'
        ).length,
        low: [...allHistory, ...pending].filter(r => 
          (r.workflowData || this.pendingApprovals.get(r.workflowId)?.workflowData)?.riskLevel === 'low'
        ).length
      },
      qualityDistribution: {
        excellent: [...allHistory, ...pending].filter(r => 
          (r.reviewData || this.pendingApprovals.get(r.workflowId)?.reviewData)?.qualityScore >= 90
        ).length,
        good: [...allHistory, ...pending].filter(r => {
          const score = (r.reviewData || this.pendingApprovals.get(r.workflowId)?.reviewData)?.qualityScore || 0;
          return score >= 80 && score < 90;
        }).length,
        needs_improvement: [...allHistory, ...pending].filter(r => 
          (r.reviewData || this.pendingApprovals.get(r.workflowId)?.reviewData)?.qualityScore < 80
        ).length
      }
    };
  }

  /**
   * Bulk approve/reject multiple workflows
   */
  async bulkApprovalDecision(workflowIds, decision, approver = 'ceo', comments = '') {
    const results = [];
    
    for (const workflowId of workflowIds) {
      try {
        const result = await this.processApprovalDecision(workflowId, decision, approver, comments);
        results.push({ workflowId, success: true, ...result });
      } catch (error) {
        results.push({ workflowId, success: false, error: error.message });
      }
    }
    
    console.log(`[CEO-APPROVAL] 📦 Bulk ${decision} processed: ${results.filter(r => r.success).length}/${results.length} successful`);
    
    return {
      totalProcessed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * Force unblock workflow (emergency override)
   */
  async emergencyUnblock(workflowId, approver, reason) {
    console.warn(`[CEO-APPROVAL] ⚠️  EMERGENCY UNBLOCK: ${workflowId} by ${approver}: ${reason}`);
    
    const emergencyApproval = {
      id: crypto.randomUUID(),
      workflowId,
      decision: 'emergency_approved',
      approver,
      approvedAt: new Date().toISOString(),
      comments: `EMERGENCY UNBLOCK: ${reason}`,
      emergencyOverride: true
    };
    
    this.blockedWorkflows.delete(workflowId);
    this.pendingApprovals.delete(workflowId);
    this.approvalHistory.set(workflowId, emergencyApproval);
    
    // Update database
    if (this.database?.Workflow) {
      await this.database.Workflow.update({
        status: 'completed',
        metadata: {
          emergencyUnblock: true,
          emergencyApprovedBy: approver,
          emergencyReason: reason,
          emergencyApprovedAt: emergencyApproval.approvedAt
        }
      }, { where: { id: workflowId } });
    }
    
    this.emit('emergencyUnblock', { workflowId, approver, reason });
    
    return { success: true, emergencyApprovalId: emergencyApproval.id };
  }

  async shutdown() {
    console.log('[CEO-APPROVAL] Shutting down CEO Approval Manager...');
    this.removeAllListeners();
  }
}

module.exports = CeoApprovalManager;
