const { Connection, Deployment, Audit } = require('../models');

class RenderService {
  constructor() {
    this.baseURL = 'https://api.render.com/v1';
  }

  async getConnection(userId) {
    const connection = await Connection.findOne({
      where: { user_id: userId, provider: 'render', status: 'active' }
    });

    if (!connection) {
      throw new Error('Render connection not found or inactive');
    }

    const token = connection.getToken();
    if (!token) {
      throw new Error('Render token not available');
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
      throw new Error(`Render API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    return response.json();
  }

  // Service operations
  async getServices(userId, ownerId = null) {
    const { token } = await this.getConnection(userId);

    let endpoint = '/services';
    if (ownerId) {
      endpoint += `?ownerId=${ownerId}`;
    }

    return this.makeRequest(token, endpoint);
  }

  async getService(userId, serviceId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/services/${serviceId}`);
  }

  async createService(userId, serviceData) {
    const { token } = await this.getConnection(userId);

    const service = await this.makeRequest(token, '/services', {
      method: 'POST',
      body: JSON.stringify({
        type: serviceData.type || 'web_service', // web_service, background_worker, static_site
        name: serviceData.name,
        ownerId: serviceData.ownerId,
        repo: serviceData.repo,
        branch: serviceData.branch || 'main',
        buildCommand: serviceData.buildCommand,
        startCommand: serviceData.startCommand,
        env: serviceData.env || 'docker',
        envVars: serviceData.envVars || [],
        serviceDetails: {
          env: serviceData.runtime || 'docker',
          buildCommand: serviceData.buildCommand,
          startCommand: serviceData.startCommand,
          plan: serviceData.plan || 'starter',
          numInstances: serviceData.numInstances || 1,
          region: serviceData.region || 'oregon',
          healthCheckPath: serviceData.healthCheckPath,
          disk: serviceData.disk ? {
            name: serviceData.disk.name,
            sizeGB: serviceData.disk.sizeGB || 1,
            mountPath: serviceData.disk.mountPath
          } : undefined
        }
      })
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_RENDER_SERVICE',
      target: 'render_service',
      target_id: service.service.id,
      metadata: {
        service_name: serviceData.name,
        type: serviceData.type,
        plan: serviceData.plan,
        region: serviceData.region
      },
      ip_address: '127.0.0.1'
    });

    return service;
  }

  async updateService(userId, serviceId, updates) {
    const { token } = await this.getConnection(userId);

    const service = await this.makeRequest(token, `/services/${serviceId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    await Audit.create({
      actor_id: userId,
      action: 'UPDATE_RENDER_SERVICE',
      target: 'render_service',
      target_id: serviceId,
      metadata: updates,
      ip_address: '127.0.0.1'
    });

    return service;
  }

  async deleteService(userId, serviceId) {
    const { token } = await this.getConnection(userId);

    await this.makeRequest(token, `/services/${serviceId}`, {
      method: 'DELETE'
    });

    await Audit.create({
      actor_id: userId,
      action: 'DELETE_RENDER_SERVICE',
      target: 'render_service',
      target_id: serviceId,
      metadata: {},
      ip_address: '127.0.0.1'
    });
  }

  // Deployment operations
  async getDeployments(userId, serviceId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/services/${serviceId}/deploys`);
  }

  async getDeployment(userId, deployId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/deploys/${deployId}`);
  }

  async createDeployment(userId, serviceId, deploymentData = {}) {
    const { token } = await this.getConnection(userId);

    const deployment = await this.makeRequest(token, `/services/${serviceId}/deploys`, {
      method: 'POST',
      body: JSON.stringify({
        clearCache: deploymentData.clearCache || 'do_not_clear'
      })
    });

    // Store deployment in database
    const dbDeployment = await Deployment.create({
      user_id: userId,
      repository_id: deploymentData.repository || '',
      deployment_id: deployment.deploy.id,
      environment: 'production',
      ref: deploymentData.ref || '',
      sha: deploymentData.sha || '',
      status: 'build_in_progress',
      provider: 'render',
      metadata: {
        render_deployment: deployment,
        service_id: serviceId
      }
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_RENDER_DEPLOYMENT',
      target: 'deployment',
      target_id: deployment.deploy.id,
      metadata: {
        service_id: serviceId,
        clear_cache: deploymentData.clearCache
      },
      ip_address: '127.0.0.1'
    });

    return { render: deployment, database: dbDeployment };
  }

  async cancelDeployment(userId, deployId) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/deploys/${deployId}/cancel`, {
      method: 'POST'
    });

    // Update database
    await Deployment.update(
      { status: 'cancelled' },
      { where: { deployment_id: deployId } }
    );

    await Audit.create({
      actor_id: userId,
      action: 'CANCEL_RENDER_DEPLOYMENT',
      target: 'deployment',
      target_id: deployId,
      metadata: {},
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // Service control
  async suspendService(userId, serviceId) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/services/${serviceId}/suspend`, {
      method: 'POST'
    });

    await Audit.create({
      actor_id: userId,
      action: 'SUSPEND_RENDER_SERVICE',
      target: 'render_service',
      target_id: serviceId,
      metadata: {},
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async resumeService(userId, serviceId) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/services/${serviceId}/resume`, {
      method: 'POST'
    });

    await Audit.create({
      actor_id: userId,
      action: 'RESUME_RENDER_SERVICE',
      target: 'render_service',
      target_id: serviceId,
      metadata: {},
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async restartService(userId, serviceId) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/services/${serviceId}/restart`, {
      method: 'POST'
    });

    await Audit.create({
      actor_id: userId,
      action: 'RESTART_RENDER_SERVICE',
      target: 'render_service',
      target_id: serviceId,
      metadata: {},
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async scaleService(userId, serviceId, numInstances) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/services/${serviceId}/scale`, {
      method: 'POST',
      body: JSON.stringify({ numInstances })
    });

    await Audit.create({
      actor_id: userId,
      action: 'SCALE_RENDER_SERVICE',
      target: 'render_service',
      target_id: serviceId,
      metadata: { num_instances: numInstances },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // Environment variables
  async getEnvironmentVariables(userId, serviceId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/services/${serviceId}/env-vars`);
  }

  async updateEnvironmentVariables(userId, serviceId, envVars) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/services/${serviceId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify(envVars)
    });

    await Audit.create({
      actor_id: userId,
      action: 'UPDATE_RENDER_ENV_VARS',
      target: 'env_vars',
      target_id: serviceId,
      metadata: {
        service_id: serviceId,
        var_count: envVars.length
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // Custom domains
  async getCustomDomains(userId, serviceId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/services/${serviceId}/custom-domains`);
  }

  async addCustomDomain(userId, serviceId, domain) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/services/${serviceId}/custom-domains`, {
      method: 'POST',
      body: JSON.stringify({ name: domain })
    });

    await Audit.create({
      actor_id: userId,
      action: 'ADD_RENDER_CUSTOM_DOMAIN',
      target: 'custom_domain',
      target_id: domain,
      metadata: { service_id: serviceId, domain },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async deleteCustomDomain(userId, customDomainId) {
    const { token } = await this.getConnection(userId);

    await this.makeRequest(token, `/custom-domains/${customDomainId}`, {
      method: 'DELETE'
    });

    await Audit.create({
      actor_id: userId,
      action: 'DELETE_RENDER_CUSTOM_DOMAIN',
      target: 'custom_domain',
      target_id: customDomainId,
      metadata: { domain_id: customDomainId },
      ip_address: '127.0.0.1'
    });
  }

  async verifyCustomDomain(userId, customDomainId) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/custom-domains/${customDomainId}/verify`, {
      method: 'POST'
    });

    await Audit.create({
      actor_id: userId,
      action: 'VERIFY_RENDER_CUSTOM_DOMAIN',
      target: 'custom_domain',
      target_id: customDomainId,
      metadata: { domain_id: customDomainId },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // Logs
  async getLogs(userId, serviceId, startTime, endTime, limit = 100) {
    const { token } = await this.getConnection(userId);

    let endpoint = `/services/${serviceId}/logs?limit=${limit}`;
    if (startTime) endpoint += `&startTime=${startTime}`;
    if (endTime) endpoint += `&endTime=${endTime}`;

    return this.makeRequest(token, endpoint);
  }

  async getDeploymentLogs(userId, deployId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/deploys/${deployId}/logs`);
  }

  // Redis instances
  async getRedisInstances(userId, ownerId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/redis?ownerId=${ownerId}`);
  }

  async createRedisInstance(userId, redisData) {
    const { token } = await this.getConnection(userId);

    const redis = await this.makeRequest(token, '/redis', {
      method: 'POST',
      body: JSON.stringify({
        name: redisData.name,
        ownerId: redisData.ownerId,
        plan: redisData.plan || 'starter',
        region: redisData.region || 'oregon',
        maxmemoryPolicy: redisData.maxmemoryPolicy || 'allkeys-lru'
      })
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_RENDER_REDIS',
      target: 'redis_instance',
      target_id: redis.redis.id,
      metadata: {
        name: redisData.name,
        plan: redisData.plan,
        region: redisData.region
      },
      ip_address: '127.0.0.1'
    });

    return redis;
  }

  // PostgreSQL databases
  async getPostgreSQLInstances(userId, ownerId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/postgres?ownerId=${ownerId}`);
  }

  async createPostgreSQLInstance(userId, dbData) {
    const { token } = await this.getConnection(userId);

    const db = await this.makeRequest(token, '/postgres', {
      method: 'POST',
      body: JSON.stringify({
        name: dbData.name,
        ownerId: dbData.ownerId,
        databaseName: dbData.databaseName,
        databaseUser: dbData.databaseUser,
        plan: dbData.plan || 'starter',
        region: dbData.region || 'oregon',
        version: dbData.version || '14'
      })
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_RENDER_POSTGRES',
      target: 'postgres_instance',
      target_id: db.postgres.id,
      metadata: {
        name: dbData.name,
        plan: dbData.plan,
        region: dbData.region,
        version: dbData.version
      },
      ip_address: '127.0.0.1'
    });

    return db;
  }

  // Owners (teams/users)
  async getOwners(userId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, '/owners');
  }

  async getOwner(userId, ownerId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/owners/${ownerId}`);
  }

  // User information
  async getUser(userId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, '/user');
  }

  // Events (audit trail)
  async getEvents(userId, serviceId, limit = 50) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/services/${serviceId}/events?limit=${limit}`);
  }

  // Webhook helper for processing Render webhooks
  async processWebhook(payload, signature) {
    const { resource, data } = payload;

    switch (resource) {
      case 'deploy':
        await this.updateDeploymentStatus(data.deploy.id, this.mapRenderStatus(data.deploy.status));
        break;

      case 'service':
        // Handle service status changes
        console.log(`Service ${data.service.id} status: ${data.service.status}`);
        break;

      default:
        console.log(`Unhandled Render webhook resource: ${resource}`);
    }

    return { processed: true, resource };
  }

  async updateDeploymentStatus(deploymentId, status) {
    await Deployment.update(
      {
        status,
        deployed_at: status === 'live' ? new Date() : null
      },
      { where: { deployment_id: deploymentId, provider: 'render' } }
    );
  }

  mapRenderStatus(renderStatus) {
    const statusMap = {
      'build_in_progress': 'building',
      'update_in_progress': 'building',
      'live': 'live',
      'build_failed': 'failed',
      'update_failed': 'failed',
      'cancelled': 'cancelled',
      'pre_deploy_in_progress': 'building',
      'pre_deploy_failed': 'failed'
    };
    return statusMap[renderStatus] || 'unknown';
  }

  // Health checks
  async getHealthCheck(userId, serviceId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/services/${serviceId}/health`);
  }

  // Metrics
  async getMetrics(userId, serviceId, startTime, endTime) {
    const { token } = await this.getConnection(userId);

    let endpoint = `/services/${serviceId}/metrics`;
    const params = new URLSearchParams();
    if (startTime) params.append('startTime', startTime);
    if (endTime) params.append('endTime', endTime);

    if (params.toString()) {
      endpoint += `?${params.toString()}`;
    }

    return this.makeRequest(token, endpoint);
  }
}

module.exports = new RenderService();