const { Connection, Repository, Deployment, Audit } = require('../models');

class GitHubService {
  constructor() {
    this.baseURL = 'https://api.github.com';
  }

  async getConnection(userId) {
    const connection = await Connection.findOne({
      where: { user_id: userId, provider: 'github', status: 'active' }
    });
    
    if (!connection) {
      throw new Error('GitHub connection not found or inactive');
    }
    
    const token = connection.getToken();
    if (!token) {
      throw new Error('GitHub token not available');
    }
    
    return { connection, token };
  }

  // Create repository under user or org
  async createRepository(userId, { name, description = '', privateRepo = true, org = null, auto_init = true }) {
    const { token } = await this.getConnection(userId);
    const body = {
      name,
      description,
      private: !!privateRepo,
      auto_init: !!auto_init
    };
    const endpoint = org ? `/orgs/${org}/repos` : `/user/repos`;
    return this.makeRequest(token, endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  async makeRequest(token, endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ShellCompany-Dashboard',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`GitHub API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    return response.json();
  }

  // Repository operations
  async getRepositories(userId, options = {}) {
    const { token } = await this.getConnection(userId);
    const { type = 'owner', sort = 'updated', per_page = 30, page = 1 } = options;
    
    const repos = await this.makeRequest(token, `/user/repos?type=${type}&sort=${sort}&per_page=${per_page}&page=${page}`);
    // Note: DB persistence is omitted here because the Repository model in this app
    // requires a project_id/owner. We simply return the GitHub API result for display.
    return repos;
  }

  async getRepository(userId, owner, repo) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/repos/${owner}/${repo}`);
  }

  async getBranches(userId, owner, repo) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/repos/${owner}/${repo}/branches`);
  }

  async getCommits(userId, owner, repo, options = {}) {
    const { token } = await this.getConnection(userId);
    const { sha, since, until, per_page = 30, page = 1 } = options;
    
    let endpoint = `/repos/${owner}/${repo}/commits?per_page=${per_page}&page=${page}`;
    if (sha) endpoint += `&sha=${sha}`;
    if (since) endpoint += `&since=${since}`;
    if (until) endpoint += `&until=${until}`;
    
    return this.makeRequest(token, endpoint);
  }

  async getPullRequests(userId, owner, repo, state = 'open') {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/repos/${owner}/${repo}/pulls?state=${state}`);
  }

  async getIssues(userId, owner, repo, options = {}) {
    const { token } = await this.getConnection(userId);
    const { state = 'open', labels, assignee, creator, since } = options;
    
    let endpoint = `/repos/${owner}/${repo}/issues?state=${state}`;
    if (labels) endpoint += `&labels=${labels}`;
    if (assignee) endpoint += `&assignee=${assignee}`;
    if (creator) endpoint += `&creator=${creator}`;
    if (since) endpoint += `&since=${since}`;
    
    return this.makeRequest(token, endpoint);
  }

  // Workflow and Actions operations
  async getWorkflows(userId, owner, repo) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/repos/${owner}/${repo}/actions/workflows`);
  }

  async getWorkflowRuns(userId, owner, repo, workflowId = null, options = {}) {
    const { token } = await this.getConnection(userId);
    const { status, branch, event, per_page = 30, page = 1 } = options;
    
    let endpoint;
    if (workflowId) {
      endpoint = `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`;
    } else {
      endpoint = `/repos/${owner}/${repo}/actions/runs`;
    }
    
    endpoint += `?per_page=${per_page}&page=${page}`;
    if (status) endpoint += `&status=${status}`;
    if (branch) endpoint += `&branch=${branch}`;
    if (event) endpoint += `&event=${event}`;
    
    return this.makeRequest(token, endpoint);
  }

  async triggerWorkflow(userId, owner, repo, workflowId, ref, inputs = {}) {
    const { token } = await this.getConnection(userId);
    
    const result = await this.makeRequest(token, `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, inputs })
    });

    // Log the deployment trigger
    await Audit.create({
      actor_id: userId,
      action: 'TRIGGER_WORKFLOW',
      target: `${owner}/${repo}`,
      target_id: workflowId,
      metadata: { ref, inputs, workflow_id: workflowId },
      ip_address: '127.0.0.1' // Will be updated from request context
    });

    return result;
  }

  // Webhook operations
  async getWebhooks(userId, owner, repo) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/repos/${owner}/${repo}/hooks`);
  }

  async createWebhook(userId, owner, repo, webhookConfig) {
    const { token } = await this.getConnection(userId);
    
    const webhook = await this.makeRequest(token, `/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: webhookConfig.events || ['push', 'pull_request', 'issues'],
        config: {
          url: webhookConfig.url,
          content_type: 'json',
          secret: webhookConfig.secret,
          insecure_ssl: '0'
        }
      })
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_WEBHOOK',
      target: `${owner}/${repo}`,
      target_id: webhook.id.toString(),
      metadata: { webhook_url: webhookConfig.url, events: webhookConfig.events },
      ip_address: '127.0.0.1'
    });

    return webhook;
  }

  async deleteWebhook(userId, owner, repo, hookId) {
    const { token } = await this.getConnection(userId);
    
    await this.makeRequest(token, `/repos/${owner}/${repo}/hooks/${hookId}`, {
      method: 'DELETE'
    });

    await Audit.create({
      actor_id: userId,
      action: 'DELETE_WEBHOOK',
      target: `${owner}/${repo}`,
      target_id: hookId.toString(),
      metadata: { hook_id: hookId },
      ip_address: '127.0.0.1'
    });
  }

  // Deployment operations
  async getDeployments(userId, owner, repo, environment = null) {
    const { token } = await this.getConnection(userId);
    
    let endpoint = `/repos/${owner}/${repo}/deployments`;
    if (environment) {
      endpoint += `?environment=${environment}`;
    }
    
    return this.makeRequest(token, endpoint);
  }

  async createDeployment(userId, owner, repo, deploymentData) {
    const { token } = await this.getConnection(userId);
    
    const deployment = await this.makeRequest(token, `/repos/${owner}/${repo}/deployments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: deploymentData.ref,
        environment: deploymentData.environment || 'production',
        description: deploymentData.description || 'Deployment via ShellCompany',
        auto_merge: false,
        required_contexts: [],
        payload: deploymentData.payload || {}
      })
    });

    // Store deployment in database
    const dbDeployment = await Deployment.create({
      user_id: userId,
      repository_id: `${owner}/${repo}`,
      deployment_id: deployment.id.toString(),
      environment: deploymentData.environment || 'production',
      ref: deploymentData.ref,
      sha: deployment.sha,
      status: 'pending',
      metadata: {
        github_deployment: deployment,
        description: deploymentData.description
      }
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_DEPLOYMENT',
      target: `${owner}/${repo}`,
      target_id: deployment.id.toString(),
      metadata: { 
        environment: deploymentData.environment,
        ref: deploymentData.ref,
        sha: deployment.sha
      },
      ip_address: '127.0.0.1'
    });

    return { github: deployment, database: dbDeployment };
  }

  async updateDeploymentStatus(userId, owner, repo, deploymentId, status, options = {}) {
    const { token } = await this.getConnection(userId);
    
    const statusData = {
      state: status, // pending, in_progress, success, error, failure
      description: options.description || `Deployment ${status}`,
      environment_url: options.environment_url,
      log_url: options.log_url
    };

    const result = await this.makeRequest(token, `/repos/${owner}/${repo}/deployments/${deploymentId}/statuses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(statusData)
    });

    // Update database deployment status
    await Deployment.update(
      { 
        status: status,
        deployed_at: status === 'success' ? new Date() : null,
        metadata: {
          environment_url: options.environment_url,
          log_url: options.log_url,
          description: options.description
        }
      },
      { where: { deployment_id: deploymentId.toString() } }
    );

    return result;
  }

  // Organization and team operations
  async getOrganizations(userId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, '/user/orgs');
  }

  async getTeams(userId, org) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/orgs/${org}/teams`);
  }

  // User information
  async getUser(userId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, '/user');
  }

  async getUserById(userId, githubUserId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/user/${githubUserId}`);
  }

  // Collaboration features
  async getCollaborators(userId, owner, repo) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/repos/${owner}/${repo}/collaborators`);
  }

  async addCollaborator(userId, owner, repo, username, permission = 'push') {
    const { token } = await this.getConnection(userId);
    
    await this.makeRequest(token, `/repos/${owner}/${repo}/collaborators/${username}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission })
    });

    await Audit.create({
      actor_id: userId,
      action: 'ADD_COLLABORATOR',
      target: `${owner}/${repo}`,
      target_id: username,
      metadata: { username, permission },
      ip_address: '127.0.0.1'
    });
  }

  // Rate limit monitoring
  async getRateLimit(userId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, '/rate_limit');
  }
}

module.exports = new GitHubService();
