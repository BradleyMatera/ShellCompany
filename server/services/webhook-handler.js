const crypto = require('crypto');
const { Audit, Deployment } = require('../models');
const githubService = require('./github');
const vercelService = require('./vercel');
const netlifyService = require('./netlify');
const renderService = require('./render');
const taskQueue = require('./task-queue');

class WebhookHandler {
  constructor() {
    this.handlers = new Map();
    this.setupHandlers();
  }

  setupHandlers() {
    // GitHub webhook handlers
    this.handlers.set('github.push', this.handleGitHubPush.bind(this));
    this.handlers.set('github.pull_request', this.handleGitHubPullRequest.bind(this));
    this.handlers.set('github.workflow_run', this.handleGitHubWorkflowRun.bind(this));
    this.handlers.set('github.release', this.handleGitHubRelease.bind(this));
    this.handlers.set('github.issues', this.handleGitHubIssues.bind(this));
    this.handlers.set('github.deployment', this.handleGitHubDeployment.bind(this));
    this.handlers.set('github.deployment_status', this.handleGitHubDeploymentStatus.bind(this));

    // Vercel webhook handlers
    this.handlers.set('vercel.deployment.created', this.handleVercelDeployment.bind(this));
    this.handlers.set('vercel.deployment.ready', this.handleVercelDeployment.bind(this));
    this.handlers.set('vercel.deployment.error', this.handleVercelDeployment.bind(this));
    this.handlers.set('vercel.deployment.canceled', this.handleVercelDeployment.bind(this));

    // Netlify webhook handlers
    this.handlers.set('netlify.deploy-building', this.handleNetlifyDeployment.bind(this));
    this.handlers.set('netlify.deploy-succeeded', this.handleNetlifyDeployment.bind(this));
    this.handlers.set('netlify.deploy-failed', this.handleNetlifyDeployment.bind(this));
    this.handlers.set('netlify.deploy-locked', this.handleNetlifyDeployment.bind(this));

    // Render webhook handlers
    this.handlers.set('render.deploy', this.handleRenderDeployment.bind(this));
    this.handlers.set('render.service', this.handleRenderService.bind(this));

    // AWS EventBridge handlers (for production environments)
    this.handlers.set('aws.ecs.task-state-change', this.handleAWSECSTaskStateChange.bind(this));
    this.handlers.set('aws.codedeploy.state-change', this.handleAWSCodeDeployStateChange.bind(this));
  }

  // Main webhook processing method
  async processWebhook(provider, eventType, payload, signature, headers = {}) {
    try {
      // Verify webhook signature
      if (!await this.verifySignature(provider, payload, signature, headers)) {
        throw new Error('Invalid webhook signature');
      }

      const handlerKey = `${provider}.${eventType}`;
      const handler = this.handlers.get(handlerKey);

      if (!handler) {
        console.log(`No handler found for ${handlerKey}`);
        return { processed: false, reason: 'No handler found' };
      }

      console.log(`Processing webhook: ${handlerKey}`);

      const result = await handler(payload, headers);

      // Log successful webhook processing
      await Audit.create({
        actor_id: null,
        action: 'PROCESS_WEBHOOK',
        target: 'webhook',
        target_id: handlerKey,
        metadata: {
          provider,
          event_type: eventType,
          processed: result.processed,
          actions_taken: result.actionsTaken || []
        },
        ip_address: headers['x-forwarded-for'] || '127.0.0.1'
      });

      return result;

    } catch (error) {
      console.error(`Webhook processing failed for ${provider}.${eventType}:`, error);

      await Audit.create({
        actor_id: null,
        action: 'WEBHOOK_ERROR',
        target: 'webhook',
        target_id: `${provider}.${eventType}`,
        metadata: {
          provider,
          event_type: eventType,
          error: error.message
        },
        ip_address: headers['x-forwarded-for'] || '127.0.0.1'
      });

      throw error;
    }
  }

  // Signature verification for different providers
  async verifySignature(provider, payload, signature, headers) {
    switch (provider) {
      case 'github':
        return this.verifyGitHubSignature(payload, signature);
      case 'vercel':
        return this.verifyVercelSignature(payload, signature, headers);
      case 'netlify':
        return this.verifyNetlifySignature(payload, signature);
      case 'render':
        return this.verifyRenderSignature(payload, signature);
      default:
        console.log(`No signature verification for provider: ${provider}`);
        return true; // Allow for testing/development
    }
  }

  verifyGitHubSignature(payload, signature) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) return true; // Allow if no secret configured

    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  verifyVercelSignature(payload, signature, headers) {
    const secret = process.env.VERCEL_WEBHOOK_SECRET;
    if (!secret) return true;

    const bodySignature = crypto
      .createHmac('sha1', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === bodySignature;
  }

  verifyNetlifySignature(payload, signature) {
    const secret = process.env.NETLIFY_WEBHOOK_SECRET;
    if (!secret) return true;

    const expectedSignature = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload) + secret)
      .digest('hex');

    return signature === expectedSignature;
  }

  verifyRenderSignature(payload, signature) {
    const secret = process.env.RENDER_WEBHOOK_SECRET;
    if (!secret) return true;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === expectedSignature;
  }

  // GitHub webhook handlers
  async handleGitHubPush(payload) {
    const { repository, ref, commits, pusher } = payload;
    const actionsTaken = [];

    // Trigger CI/CD pipeline for main branch pushes
    if (ref === 'refs/heads/main' || ref === 'refs/heads/master') {
      // Create autonomous task to handle the push
      await taskQueue.addTask({
        userId: 1, // System user - would need to map GitHub user to system user
        projectId: repository.name,
        type: 'ci_cd',
        priority: 'high',
        prompt: `New push to ${repository.full_name} main branch. Commits: ${commits.map(c => c.message).join(', ')}. Run CI/CD pipeline: build, test, and deploy if tests pass.`,
        tools: ['git', 'command', 'http'],
        constraints: {
          model: { preferredModel: 'claude', maxCost: 2.0 }
        },
        metadata: {
          repository: repository.full_name,
          ref,
          commits: commits.map(c => ({ id: c.id, message: c.message, author: c.author.name })),
          pusher: pusher.name
        }
      });

      actionsTaken.push('Created CI/CD task');
    }

    // Auto-deploy to development environment for develop branch
    if (ref === 'refs/heads/develop') {
      await taskQueue.addTask({
        userId: 1,
        projectId: repository.name,
        type: 'auto_deploy',
        priority: 'normal',
        prompt: `Deploy ${repository.full_name} develop branch to development environment.`,
        tools: ['git', 'command', 'http'],
        metadata: {
          repository: repository.full_name,
          ref,
          environment: 'development'
        }
      });

      actionsTaken.push('Created auto-deploy task for development');
    }

    return { processed: true, actionsTaken };
  }

  async handleGitHubPullRequest(payload) {
    const { action, pull_request, repository } = payload;
    const actionsTaken = [];

    switch (action) {
      case 'opened':
      case 'synchronize':
        // Run tests and create preview deployment
        await taskQueue.addTask({
          userId: 1,
          projectId: repository.name,
          type: 'pr_check',
          priority: 'normal',
          prompt: `Pull request ${action} for ${repository.full_name} PR #${pull_request.number}. Run tests, security checks, and create preview deployment. Comment results on PR.`,
          tools: ['git', 'command', 'http'],
          metadata: {
            repository: repository.full_name,
            pr_number: pull_request.number,
            pr_title: pull_request.title,
            pr_author: pull_request.user.login,
            head_sha: pull_request.head.sha
          }
        });

        actionsTaken.push('Created PR check task');
        break;

      case 'closed':
        if (pull_request.merged) {
          // PR was merged - trigger deployment to staging
          await taskQueue.addTask({
            userId: 1,
            projectId: repository.name,
            type: 'staging_deploy',
            priority: 'high',
            prompt: `PR #${pull_request.number} merged to ${repository.full_name}. Deploy to staging environment and run smoke tests.`,
            tools: ['git', 'command', 'http'],
            metadata: {
              repository: repository.full_name,
              pr_number: pull_request.number,
              merge_sha: pull_request.merge_commit_sha
            }
          });

          actionsTaken.push('Created staging deployment task');
        }
        break;
    }

    return { processed: true, actionsTaken };
  }

  async handleGitHubWorkflowRun(payload) {
    const { action, workflow_run, repository } = payload;
    const actionsTaken = [];

    if (action === 'completed') {
      const { conclusion, head_branch, head_sha } = workflow_run;

      if (conclusion === 'failure') {
        // Create task to investigate and potentially fix the failure
        await taskQueue.addTask({
          userId: 1,
          projectId: repository.name,
          type: 'investigate_failure',
          priority: 'high',
          prompt: `Workflow "${workflow_run.name}" failed in ${repository.full_name} on branch ${head_branch}. Investigate the failure, analyze logs, and suggest fixes.`,
          tools: ['git', 'command', 'http'],
          metadata: {
            repository: repository.full_name,
            workflow_name: workflow_run.name,
            branch: head_branch,
            sha: head_sha,
            conclusion
          }
        });

        actionsTaken.push('Created failure investigation task');
      } else if (conclusion === 'success' && head_branch === 'main') {
        // Successful main branch workflow - proceed with production deployment
        await taskQueue.addTask({
          userId: 1,
          projectId: repository.name,
          type: 'production_deploy',
          priority: 'high',
          prompt: `Main branch workflow succeeded for ${repository.full_name}. Deploy to production environment with proper monitoring and rollback readiness.`,
          tools: ['git', 'command', 'http'],
          metadata: {
            repository: repository.full_name,
            workflow_name: workflow_run.name,
            sha: head_sha
          }
        });

        actionsTaken.push('Created production deployment task');
      }
    }

    return { processed: true, actionsTaken };
  }

  async handleGitHubRelease(payload) {
    const { action, release, repository } = payload;
    const actionsTaken = [];

    if (action === 'published') {
      // Create task to handle release deployment and notifications
      await taskQueue.addTask({
        userId: 1,
        projectId: repository.name,
        type: 'release_deploy',
        priority: 'high',
        prompt: `New release ${release.tag_name} published for ${repository.full_name}. Deploy to production, update documentation, send notifications to stakeholders.`,
        tools: ['git', 'command', 'http'],
        metadata: {
          repository: repository.full_name,
          tag_name: release.tag_name,
          release_name: release.name,
          is_prerelease: release.prerelease
        }
      });

      actionsTaken.push('Created release deployment task');
    }

    return { processed: true, actionsTaken };
  }

  async handleGitHubIssues(payload) {
    const { action, issue, repository } = payload;
    const actionsTaken = [];

    if (action === 'opened' && issue.labels.some(label => label.name === 'bug')) {
      // Auto-triage and investigate bug reports
      await taskQueue.addTask({
        userId: 1,
        projectId: repository.name,
        type: 'bug_triage',
        priority: 'normal',
        prompt: `New bug report #${issue.number} in ${repository.full_name}: "${issue.title}". Analyze the issue, check for duplicates, gather system information, and provide initial triage.`,
        tools: ['git', 'command', 'http'],
        metadata: {
          repository: repository.full_name,
          issue_number: issue.number,
          issue_title: issue.title,
          issue_author: issue.user.login
        }
      });

      actionsTaken.push('Created bug triage task');
    }

    return { processed: true, actionsTaken };
  }

  async handleGitHubDeployment(payload) {
    const { deployment, repository } = payload;

    // Update deployment tracking
    await Deployment.update(
      {
        status: 'pending',
        metadata: { github_deployment: deployment }
      },
      { where: { deployment_id: deployment.id.toString() } }
    );

    return { processed: true, actionsTaken: ['Updated deployment status'] };
  }

  async handleGitHubDeploymentStatus(payload) {
    const { deployment_status, deployment } = payload;

    // Update deployment status
    await Deployment.update(
      {
        status: deployment_status.state,
        deployed_at: deployment_status.state === 'success' ? new Date() : null
      },
      { where: { deployment_id: deployment.id.toString() } }
    );

    return { processed: true, actionsTaken: ['Updated deployment status'] };
  }

  // Vercel webhook handlers
  async handleVercelDeployment(payload) {
    const actionsTaken = [];

    // Process using Vercel service
    const result = await vercelService.processWebhook(payload);
    actionsTaken.push('Updated Vercel deployment status');

    // Create follow-up tasks based on deployment status
    if (payload.type === 'deployment.ready') {
      await taskQueue.addTask({
        userId: 1,
        projectId: payload.data.deployment.meta?.githubRepo || 'unknown',
        type: 'deployment_verification',
        priority: 'normal',
        prompt: `Vercel deployment ready at ${payload.data.deployment.url}. Run smoke tests and verify functionality.`,
        tools: ['http', 'command'],
        metadata: {
          deployment_url: payload.data.deployment.url,
          deployment_id: payload.data.deployment.id,
          provider: 'vercel'
        }
      });

      actionsTaken.push('Created deployment verification task');
    } else if (payload.type === 'deployment.error') {
      await taskQueue.addTask({
        userId: 1,
        projectId: payload.data.deployment.meta?.githubRepo || 'unknown',
        type: 'deployment_debug',
        priority: 'high',
        prompt: `Vercel deployment failed for ${payload.data.deployment.id}. Investigate logs, identify root cause, and suggest fixes.`,
        tools: ['http', 'command'],
        metadata: {
          deployment_id: payload.data.deployment.id,
          provider: 'vercel'
        }
      });

      actionsTaken.push('Created deployment debug task');
    }

    return { processed: true, actionsTaken };
  }

  // Netlify webhook handlers
  async handleNetlifyDeployment(payload) {
    const actionsTaken = [];

    // Process using Netlify service
    const result = await netlifyService.processWebhook(payload);
    actionsTaken.push('Updated Netlify deployment status');

    if (payload.state === 'ready') {
      await taskQueue.addTask({
        userId: 1,
        projectId: payload.site_id,
        type: 'deployment_verification',
        priority: 'normal',
        prompt: `Netlify deployment ready at ${payload.deploy_ssl_url}. Run smoke tests and verify functionality.`,
        tools: ['http', 'command'],
        metadata: {
          deployment_url: payload.deploy_ssl_url,
          deploy_id: payload.id,
          provider: 'netlify'
        }
      });

      actionsTaken.push('Created deployment verification task');
    }

    return { processed: true, actionsTaken };
  }

  // Render webhook handlers
  async handleRenderDeployment(payload) {
    const actionsTaken = [];

    // Process using Render service
    const result = await renderService.processWebhook(payload);
    actionsTaken.push('Updated Render deployment status');

    return { processed: true, actionsTaken };
  }

  async handleRenderService(payload) {
    const { data } = payload;
    const actionsTaken = [];

    if (data.service.status === 'suspended') {
      // Service was suspended - investigate and potentially restore
      await taskQueue.addTask({
        userId: 1,
        projectId: data.service.name,
        type: 'service_recovery',
        priority: 'high',
        prompt: `Render service ${data.service.name} was suspended. Investigate the cause and restore service if appropriate.`,
        tools: ['http', 'command'],
        metadata: {
          service_id: data.service.id,
          service_name: data.service.name,
          provider: 'render'
        }
      });

      actionsTaken.push('Created service recovery task');
    }

    return { processed: true, actionsTaken };
  }

  // AWS webhook handlers (EventBridge events)
  async handleAWSECSTaskStateChange(payload) {
    const { detail } = payload;
    const actionsTaken = [];

    if (detail.lastStatus === 'STOPPED' && detail.desiredStatus === 'RUNNING') {
      // Task stopped unexpectedly - investigate
      await taskQueue.addTask({
        userId: 1,
        projectId: detail.group || 'unknown',
        type: 'ecs_investigation',
        priority: 'high',
        prompt: `ECS task ${detail.taskArn} stopped unexpectedly. Investigate logs, check health, and restart if needed.`,
        tools: ['command', 'http'],
        metadata: {
          task_arn: detail.taskArn,
          cluster_arn: detail.clusterArn,
          stop_reason: detail.stopReason,
          provider: 'aws-ecs'
        }
      });

      actionsTaken.push('Created ECS investigation task');
    }

    return { processed: true, actionsTaken };
  }

  async handleAWSCodeDeployStateChange(payload) {
    const { detail } = payload;
    const actionsTaken = [];

    if (detail.state === 'FAILURE') {
      // CodeDeploy failed - investigate and potentially rollback
      await taskQueue.addTask({
        userId: 1,
        projectId: detail.applicationName,
        type: 'deploy_rollback',
        priority: 'high',
        prompt: `AWS CodeDeploy failed for ${detail.applicationName}. Investigate failure, assess impact, and execute rollback if necessary.`,
        tools: ['command', 'http'],
        metadata: {
          application_name: detail.applicationName,
          deployment_id: detail.deploymentId,
          failure_reason: detail.errorInformation?.errorMessage,
          provider: 'aws-codedeploy'
        }
      });

      actionsTaken.push('Created deploy rollback task');
    }

    return { processed: true, actionsTaken };
  }

  // Utility methods
  async registerWebhook(provider, repoOrService, events = []) {
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL || 'https://api.shellcompany.ai'}/webhooks/${provider}`;

    switch (provider) {
      case 'github':
        // Use GitHub service to create webhook
        const githubResult = await githubService.createWebhook(1, repoOrService.owner, repoOrService.repo, {
          url: webhookUrl,
          events: events.length > 0 ? events : ['push', 'pull_request', 'workflow_run', 'release', 'issues'],
          secret: process.env.GITHUB_WEBHOOK_SECRET
        });
        return githubResult;

      case 'vercel':
        // Vercel webhooks are configured in the Vercel dashboard
        console.log(`Vercel webhook should be configured manually at: ${webhookUrl}`);
        return { configured_manually: true, url: webhookUrl };

      case 'netlify':
        // Netlify build hooks
        const netlifyResult = await netlifyService.createBuildHook(1, repoOrService.siteId, {
          title: 'ShellCompany Webhook',
          branch: 'main'
        });
        return netlifyResult;

      default:
        throw new Error(`Webhook registration not supported for provider: ${provider}`);
    }
  }

  // Get webhook statistics
  getStatistics() {
    // This would return webhook processing stats
    // In production, implement proper metrics collection
    return {
      handlers_registered: this.handlers.size,
      providers_supported: ['github', 'vercel', 'netlify', 'render', 'aws'],
      last_processed: new Date(),
      total_processed: 0 // Would be tracked in production
    };
  }
}

module.exports = new WebhookHandler();