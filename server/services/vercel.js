const { Connection, Deployment, Audit } = require('../models');

class VercelService {
  constructor() {
    this.baseURL = 'https://api.vercel.com';
  }

  async getConnection(userId) {
    const connection = await Connection.findOne({
      where: { user_id: userId, provider: 'vercel', status: 'active' }
    });

    if (!connection) {
      throw new Error('Vercel connection not found or inactive');
    }

    const token = connection.getToken();
    if (!token) {
      throw new Error('Vercel token not available');
    }

    return { connection, token };
  }

  async makeRequest(token, endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Vercel API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    return response.json();
  }

  // Project operations
  async getProjects(userId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, '/v9/projects');
  }

  async getProject(userId, projectId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/v9/projects/${projectId}`);
  }

  async createProject(userId, projectData) {
    const { token } = await this.getConnection(userId);

    const project = await this.makeRequest(token, '/v9/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: projectData.name,
        gitRepository: projectData.gitRepository,
        framework: projectData.framework,
        buildCommand: projectData.buildCommand,
        outputDirectory: projectData.outputDirectory,
        installCommand: projectData.installCommand,
        devCommand: projectData.devCommand,
        environmentVariables: projectData.environmentVariables || []
      })
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_VERCEL_PROJECT',
      target: 'vercel_project',
      target_id: project.id,
      metadata: { project_name: projectData.name, framework: projectData.framework },
      ip_address: '127.0.0.1'
    });

    return project;
  }

  async updateProject(userId, projectId, updates) {
    const { token } = await this.getConnection(userId);

    const project = await this.makeRequest(token, `/v9/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    await Audit.create({
      actor_id: userId,
      action: 'UPDATE_VERCEL_PROJECT',
      target: 'vercel_project',
      target_id: projectId,
      metadata: updates,
      ip_address: '127.0.0.1'
    });

    return project;
  }

  async deleteProject(userId, projectId) {
    const { token } = await this.getConnection(userId);

    await this.makeRequest(token, `/v9/projects/${projectId}`, {
      method: 'DELETE'
    });

    await Audit.create({
      actor_id: userId,
      action: 'DELETE_VERCEL_PROJECT',
      target: 'vercel_project',
      target_id: projectId,
      metadata: {},
      ip_address: '127.0.0.1'
    });
  }

  // Deployment operations
  async getDeployments(userId, projectId = null) {
    const { token } = await this.getConnection(userId);

    let endpoint = '/v6/deployments';
    if (projectId) {
      endpoint += `?projectId=${projectId}`;
    }

    return this.makeRequest(token, endpoint);
  }

  async getDeployment(userId, deploymentId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/v13/deployments/${deploymentId}`);
  }

  async createDeployment(userId, deploymentData) {
    const { token } = await this.getConnection(userId);

    const deployment = await this.makeRequest(token, '/v13/deployments', {
      method: 'POST',
      body: JSON.stringify({
        name: deploymentData.name,
        project: deploymentData.projectId,
        target: deploymentData.target || 'production',
        gitSource: deploymentData.gitSource,
        meta: deploymentData.meta || {}
      })
    });

    // Store deployment in database
    const dbDeployment = await Deployment.create({
      user_id: userId,
      repository_id: deploymentData.repository || '',
      deployment_id: deployment.id,
      environment: deploymentData.target || 'production',
      ref: deploymentData.gitSource?.ref || '',
      sha: deploymentData.gitSource?.sha || '',
      status: 'building',
      provider: 'vercel',
      metadata: {
        vercel_deployment: deployment,
        project_id: deploymentData.projectId
      }
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_VERCEL_DEPLOYMENT',
      target: 'deployment',
      target_id: deployment.id,
      metadata: {
        project_id: deploymentData.projectId,
        target: deploymentData.target,
        ref: deploymentData.gitSource?.ref
      },
      ip_address: '127.0.0.1'
    });

    return { vercel: deployment, database: dbDeployment };
  }

  async cancelDeployment(userId, deploymentId) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/v12/deployments/${deploymentId}/cancel`, {
      method: 'PATCH'
    });

    // Update database
    await Deployment.update(
      { status: 'cancelled' },
      { where: { deployment_id: deploymentId } }
    );

    await Audit.create({
      actor_id: userId,
      action: 'CANCEL_VERCEL_DEPLOYMENT',
      target: 'deployment',
      target_id: deploymentId,
      metadata: {},
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // Environment variables
  async getEnvironmentVariables(userId, projectId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/v9/projects/${projectId}/env`);
  }

  async createEnvironmentVariable(userId, projectId, envVar) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/v9/projects/${projectId}/env`, {
      method: 'POST',
      body: JSON.stringify({
        key: envVar.key,
        value: envVar.value,
        type: envVar.type || 'encrypted',
        target: envVar.target || ['production', 'preview', 'development']
      })
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_VERCEL_ENV_VAR',
      target: 'env_var',
      target_id: result.id,
      metadata: {
        project_id: projectId,
        key: envVar.key,
        target: envVar.target
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async updateEnvironmentVariable(userId, projectId, envId, updates) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/v9/projects/${projectId}/env/${envId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    await Audit.create({
      actor_id: userId,
      action: 'UPDATE_VERCEL_ENV_VAR',
      target: 'env_var',
      target_id: envId,
      metadata: { project_id: projectId, ...updates },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async deleteEnvironmentVariable(userId, projectId, envId) {
    const { token } = await this.getConnection(userId);

    await this.makeRequest(token, `/v9/projects/${projectId}/env/${envId}`, {
      method: 'DELETE'
    });

    await Audit.create({
      actor_id: userId,
      action: 'DELETE_VERCEL_ENV_VAR',
      target: 'env_var',
      target_id: envId,
      metadata: { project_id: projectId },
      ip_address: '127.0.0.1'
    });
  }

  // Domains
  async getDomains(userId, projectId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/v9/projects/${projectId}/domains`);
  }

  async addDomain(userId, projectId, domain) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/v9/projects/${projectId}/domains`, {
      method: 'POST',
      body: JSON.stringify({ name: domain })
    });

    await Audit.create({
      actor_id: userId,
      action: 'ADD_VERCEL_DOMAIN',
      target: 'domain',
      target_id: domain,
      metadata: { project_id: projectId, domain },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async removeDomain(userId, projectId, domain) {
    const { token } = await this.getConnection(userId);

    await this.makeRequest(token, `/v9/projects/${projectId}/domains/${domain}`, {
      method: 'DELETE'
    });

    await Audit.create({
      actor_id: userId,
      action: 'REMOVE_VERCEL_DOMAIN',
      target: 'domain',
      target_id: domain,
      metadata: { project_id: projectId, domain },
      ip_address: '127.0.0.1'
    });
  }

  // Logs
  async getDeploymentLogs(userId, deploymentId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/v2/deployments/${deploymentId}/events`);
  }

  // Teams
  async getTeams(userId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, '/v2/teams');
  }

  async getTeam(userId, teamId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/v2/teams/${teamId}`);
  }

  // User info
  async getUser(userId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, '/v2/user');
  }

  // Webhook helper for processing Vercel webhooks
  async processWebhook(payload, signature) {
    const { type, data } = payload;

    switch (type) {
      case 'deployment.created':
      case 'deployment.ready':
      case 'deployment.error':
      case 'deployment.canceled':
        await this.updateDeploymentStatus(data.deployment.id, this.mapVercelStatus(type));
        break;

      default:
        console.log(`Unhandled Vercel webhook type: ${type}`);
    }

    return { processed: true, type };
  }

  async updateDeploymentStatus(deploymentId, status) {
    await Deployment.update(
      {
        status,
        deployed_at: status === 'ready' ? new Date() : null
      },
      { where: { deployment_id: deploymentId, provider: 'vercel' } }
    );
  }

  mapVercelStatus(webhookType) {
    const statusMap = {
      'deployment.created': 'building',
      'deployment.ready': 'ready',
      'deployment.error': 'error',
      'deployment.canceled': 'cancelled'
    };
    return statusMap[webhookType] || 'unknown';
  }
}

module.exports = new VercelService();