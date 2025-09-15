const { Connection, Deployment, Audit } = require('../models');

class NetlifyService {
  constructor() {
    this.baseURL = 'https://api.netlify.com/api/v1';
  }

  async getConnection(userId) {
    const connection = await Connection.findOne({
      where: { user_id: userId, provider: 'netlify', status: 'active' }
    });

    if (!connection) {
      throw new Error('Netlify connection not found or inactive');
    }

    const token = connection.getToken();
    if (!token) {
      throw new Error('Netlify token not available');
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
      throw new Error(`Netlify API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    return response.json();
  }

  // Site operations
  async getSites(userId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, '/sites');
  }

  async getSite(userId, siteId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/sites/${siteId}`);
  }

  async createSite(userId, siteData) {
    const { token } = await this.getConnection(userId);

    const site = await this.makeRequest(token, '/sites', {
      method: 'POST',
      body: JSON.stringify({
        name: siteData.name,
        custom_domain: siteData.customDomain,
        repo: siteData.repo ? {
          provider: siteData.repo.provider || 'github',
          repo: siteData.repo.repo,
          branch: siteData.repo.branch || 'main',
          cmd: siteData.buildCommand || 'npm run build',
          dir: siteData.publishDirectory || 'dist',
          env: siteData.environmentVariables || {}
        } : undefined
      })
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_NETLIFY_SITE',
      target: 'netlify_site',
      target_id: site.id,
      metadata: {
        site_name: siteData.name,
        repo: siteData.repo?.repo,
        branch: siteData.repo?.branch
      },
      ip_address: '127.0.0.1'
    });

    return site;
  }

  async updateSite(userId, siteId, updates) {
    const { token } = await this.getConnection(userId);

    const site = await this.makeRequest(token, `/sites/${siteId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });

    await Audit.create({
      actor_id: userId,
      action: 'UPDATE_NETLIFY_SITE',
      target: 'netlify_site',
      target_id: siteId,
      metadata: updates,
      ip_address: '127.0.0.1'
    });

    return site;
  }

  async deleteSite(userId, siteId) {
    const { token } = await this.getConnection(userId);

    await this.makeRequest(token, `/sites/${siteId}`, {
      method: 'DELETE'
    });

    await Audit.create({
      actor_id: userId,
      action: 'DELETE_NETLIFY_SITE',
      target: 'netlify_site',
      target_id: siteId,
      metadata: {},
      ip_address: '127.0.0.1'
    });
  }

  // Deployment operations
  async getDeployments(userId, siteId = null) {
    const { token } = await this.getConnection(userId);

    let endpoint = '/deploys';
    if (siteId) {
      endpoint = `/sites/${siteId}/deploys`;
    }

    return this.makeRequest(token, endpoint);
  }

  async getDeployment(userId, deployId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/deploys/${deployId}`);
  }

  async createDeployment(userId, siteId, deploymentData = {}) {
    const { token } = await this.getConnection(userId);

    const deployment = await this.makeRequest(token, `/sites/${siteId}/deploys`, {
      method: 'POST',
      body: JSON.stringify({
        branch: deploymentData.branch || 'main',
        title: deploymentData.title,
        clear_cache: deploymentData.clearCache || false
      })
    });

    // Store deployment in database
    const dbDeployment = await Deployment.create({
      user_id: userId,
      repository_id: deploymentData.repository || '',
      deployment_id: deployment.id,
      environment: deploymentData.environment || 'production',
      ref: deploymentData.branch || 'main',
      sha: deployment.commit_ref || '',
      status: 'building',
      provider: 'netlify',
      metadata: {
        netlify_deployment: deployment,
        site_id: siteId
      }
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_NETLIFY_DEPLOYMENT',
      target: 'deployment',
      target_id: deployment.id,
      metadata: {
        site_id: siteId,
        branch: deploymentData.branch,
        title: deploymentData.title
      },
      ip_address: '127.0.0.1'
    });

    return { netlify: deployment, database: dbDeployment };
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
      action: 'CANCEL_NETLIFY_DEPLOYMENT',
      target: 'deployment',
      target_id: deployId,
      metadata: {},
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async restoreDeployment(userId, deployId) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/deploys/${deployId}/restore`, {
      method: 'POST'
    });

    await Audit.create({
      actor_id: userId,
      action: 'RESTORE_NETLIFY_DEPLOYMENT',
      target: 'deployment',
      target_id: deployId,
      metadata: {},
      ip_address: '127.0.0.1'
    });

    return result;
  }

  // Environment variables
  async getEnvironmentVariables(userId, siteId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/sites/${siteId}/env`);
  }

  async setEnvironmentVariables(userId, siteId, envVars) {
    const { token } = await this.getConnection(userId);

    const result = await this.makeRequest(token, `/sites/${siteId}/env`, {
      method: 'PUT',
      body: JSON.stringify(envVars)
    });

    await Audit.create({
      actor_id: userId,
      action: 'UPDATE_NETLIFY_ENV_VARS',
      target: 'env_vars',
      target_id: siteId,
      metadata: {
        site_id: siteId,
        var_count: Object.keys(envVars).length
      },
      ip_address: '127.0.0.1'
    });

    return result;
  }

  async deleteEnvironmentVariable(userId, siteId, key) {
    const { token } = await this.getConnection(userId);

    await this.makeRequest(token, `/sites/${siteId}/env/${key}`, {
      method: 'DELETE'
    });

    await Audit.create({
      actor_id: userId,
      action: 'DELETE_NETLIFY_ENV_VAR',
      target: 'env_var',
      target_id: key,
      metadata: { site_id: siteId, key },
      ip_address: '127.0.0.1'
    });
  }

  // Build hooks
  async getBuildHooks(userId, siteId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/sites/${siteId}/build_hooks`);
  }

  async createBuildHook(userId, siteId, hookData) {
    const { token } = await this.getConnection(userId);

    const hook = await this.makeRequest(token, `/sites/${siteId}/build_hooks`, {
      method: 'POST',
      body: JSON.stringify({
        title: hookData.title,
        branch: hookData.branch || 'main'
      })
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_NETLIFY_BUILD_HOOK',
      target: 'build_hook',
      target_id: hook.id,
      metadata: {
        site_id: siteId,
        title: hookData.title,
        branch: hookData.branch
      },
      ip_address: '127.0.0.1'
    });

    return hook;
  }

  async deleteBuildHook(userId, hookId) {
    const { token } = await this.getConnection(userId);

    await this.makeRequest(token, `/build_hooks/${hookId}`, {
      method: 'DELETE'
    });

    await Audit.create({
      actor_id: userId,
      action: 'DELETE_NETLIFY_BUILD_HOOK',
      target: 'build_hook',
      target_id: hookId,
      metadata: { hook_id: hookId },
      ip_address: '127.0.0.1'
    });
  }

  // Forms
  async getForms(userId, siteId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/sites/${siteId}/forms`);
  }

  async getFormSubmissions(userId, formId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/forms/${formId}/submissions`);
  }

  // Functions
  async getFunctions(userId, siteId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/sites/${siteId}/functions`);
  }

  async getFunction(userId, siteId, functionName) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/sites/${siteId}/functions/${functionName}`);
  }

  async invokeFunctionLog(userId, deployId, functionName) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/deploys/${deployId}/functions/${functionName}/log`);
  }

  // DNS
  async getDnsRecords(userId, zoneId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, `/dns_zones/${zoneId}/dns_records`);
  }

  async createDnsRecord(userId, zoneId, recordData) {
    const { token } = await this.getConnection(userId);

    const record = await this.makeRequest(token, `/dns_zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: recordData.type,
        hostname: recordData.hostname,
        value: recordData.value,
        ttl: recordData.ttl || 3600
      })
    });

    await Audit.create({
      actor_id: userId,
      action: 'CREATE_NETLIFY_DNS_RECORD',
      target: 'dns_record',
      target_id: record.id,
      metadata: {
        zone_id: zoneId,
        type: recordData.type,
        hostname: recordData.hostname
      },
      ip_address: '127.0.0.1'
    });

    return record;
  }

  // Analytics
  async getAnalytics(userId, siteId, from, to) {
    const { token } = await this.getConnection(userId);

    let endpoint = `/sites/${siteId}/analytics/pageviews`;
    if (from || to) {
      const params = new URLSearchParams();
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      endpoint += `?${params.toString()}`;
    }

    return this.makeRequest(token, endpoint);
  }

  // User/Account info
  async getUser(userId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, '/user');
  }

  async getAccounts(userId) {
    const { token } = await this.getConnection(userId);
    return this.makeRequest(token, '/accounts');
  }

  // Build logs
  async getBuildLog(userId, deployId) {
    const { token } = await this.getConnection(userId);

    const response = await fetch(`${this.baseURL}/deploys/${deployId}/log`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch build log: ${response.status}`);
    }

    return response.text();
  }

  // Webhook helper for processing Netlify webhooks
  async processWebhook(payload, signature) {
    const { state, context, deploy_id } = payload;

    if (deploy_id) {
      await this.updateDeploymentStatus(deploy_id, this.mapNetlifyStatus(state));
    }

    return { processed: true, state, context };
  }

  async updateDeploymentStatus(deploymentId, status) {
    await Deployment.update(
      {
        status,
        deployed_at: status === 'ready' ? new Date() : null
      },
      { where: { deployment_id: deploymentId, provider: 'netlify' } }
    );
  }

  mapNetlifyStatus(state) {
    const statusMap = {
      'building': 'building',
      'ready': 'ready',
      'error': 'error',
      'cancelled': 'cancelled',
      'preparing': 'building',
      'enqueued': 'queued'
    };
    return statusMap[state] || 'unknown';
  }

  // File upload for manual deploys
  async uploadFiles(userId, siteId, files) {
    const { token } = await this.getConnection(userId);

    const formData = new FormData();
    for (const [path, content] of Object.entries(files)) {
      formData.append('files', new Blob([content]), path);
    }

    const response = await fetch(`${this.baseURL}/sites/${siteId}/deploys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`File upload failed: ${response.status}`);
    }

    const deployment = await response.json();

    await Audit.create({
      actor_id: userId,
      action: 'UPLOAD_NETLIFY_FILES',
      target: 'deployment',
      target_id: deployment.id,
      metadata: {
        site_id: siteId,
        file_count: Object.keys(files).length
      },
      ip_address: '127.0.0.1'
    });

    return deployment;
  }
}

module.exports = new NetlifyService();