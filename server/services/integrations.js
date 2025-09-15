const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class IntegrationService {
  constructor() {
    this.integrations = {
      github: new GitHubIntegration(),
      vercel: new VercelIntegration(),
      anthropic: new AnthropicIntegration(),
      openai: new OpenAIIntegration(),
      google: new GoogleIntegration()
    };
  }

  async getIntegration(name) {
    const integration = this.integrations[name];
    if (!integration) {
      throw new Error(`Integration ${name} not found`);
    }
    return integration;
  }

  async testAllIntegrations() {
    const results = {};
    for (const [name, integration] of Object.entries(this.integrations)) {
      try {
        results[name] = await integration.testConnection();
      } catch (error) {
        results[name] = { success: false, error: error.message };
      }
    }
    return results;
  }
}

class GitHubIntegration {
  constructor() {
    this.apiKey = process.env.GITHUB_TOKEN;
    this.baseUrl = 'https://api.github.com';
    this.owner = process.env.GITHUB_OWNER || 'shellcompany';
  }

  async testConnection() {
    try {
      const response = await this.makeRequest('/user');
      return {
        success: true,
        user: response.login,
        rateLimit: {
          remaining: response.headers['x-ratelimit-remaining'],
          reset: new Date(response.headers['x-ratelimit-reset'] * 1000)
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createRepository(name, description = '', isPrivate = false) {
    try {
      const response = await this.makeRequest('/user/repos', 'POST', {
        name,
        description,
        private: isPrivate,
        auto_init: true,
        gitignore_template: 'Node'
      });

      return {
        success: true,
        repository: {
          name: response.name,
          fullName: response.full_name,
          url: response.html_url,
          cloneUrl: response.clone_url,
          sshUrl: response.ssh_url
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createPullRequest(repo, title, body, head, base = 'main') {
    try {
      const response = await this.makeRequest(`/repos/${this.owner}/${repo}/pulls`, 'POST', {
        title,
        body,
        head,
        base
      });

      return {
        success: true,
        pullRequest: {
          number: response.number,
          url: response.html_url,
          title: response.title,
          state: response.state
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createIssue(repo, title, body, labels = []) {
    try {
      const response = await this.makeRequest(`/repos/${this.owner}/${repo}/issues`, 'POST', {
        title,
        body,
        labels
      });

      return {
        success: true,
        issue: {
          number: response.number,
          url: response.html_url,
          title: response.title,
          state: response.state
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getRepositories() {
    try {
      const response = await this.makeRequest('/user/repos?sort=updated&per_page=50');
      return {
        success: true,
        repositories: response.map(repo => ({
          name: repo.name,
          fullName: repo.full_name,
          url: repo.html_url,
          private: repo.private,
          updatedAt: repo.updated_at,
          language: repo.language
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getCommits(repo, branch = 'main', limit = 10) {
    try {
      const response = await this.makeRequest(
        `/repos/${this.owner}/${repo}/commits?sha=${branch}&per_page=${limit}`
      );

      return {
        success: true,
        commits: response.map(commit => ({
          sha: commit.sha,
          message: commit.commit.message,
          author: commit.commit.author.name,
          date: commit.commit.author.date,
          url: commit.html_url
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    if (!this.apiKey) {
      throw new Error('GitHub API key not configured');
    }

    const config = {
      method,
      url: `${this.baseUrl}${endpoint}`,
      headers: {
        'Authorization': `token ${this.apiKey}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ShellCompany-Agent'
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  }
}

class VercelIntegration {
  constructor() {
    this.apiKey = process.env.VERCEL_TOKEN;
    this.baseUrl = 'https://api.vercel.com';
    this.teamId = process.env.VERCEL_TEAM_ID;
  }

  async testConnection() {
    try {
      const response = await this.makeRequest('/v2/user');
      return {
        success: true,
        user: {
          id: response.user.id,
          username: response.user.username,
          email: response.user.email
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deployProject(projectPath, name) {
    try {
      const files = await this.prepareFiles(projectPath);

      const response = await this.makeRequest('/v13/deployments', 'POST', {
        name,
        files,
        projectSettings: {
          framework: 'nextjs',
          buildCommand: 'npm run build',
          outputDirectory: '.next'
        }
      });

      return {
        success: true,
        deployment: {
          id: response.id,
          url: response.url,
          status: response.readyState,
          createdAt: response.createdAt
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getDeployments(limit = 20) {
    try {
      const response = await this.makeRequest(`/v6/deployments?limit=${limit}`);

      return {
        success: true,
        deployments: response.deployments.map(deployment => ({
          id: deployment.uid,
          name: deployment.name,
          url: deployment.url,
          status: deployment.state,
          createdAt: deployment.createdAt,
          building: deployment.building,
          ready: deployment.ready
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getProjects() {
    try {
      const response = await this.makeRequest('/v9/projects');

      return {
        success: true,
        projects: response.projects.map(project => ({
          id: project.id,
          name: project.name,
          framework: project.framework,
          updatedAt: project.updatedAt,
          targets: project.targets
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getDomains() {
    try {
      const response = await this.makeRequest('/v5/domains');

      return {
        success: true,
        domains: response.domains.map(domain => ({
          name: domain.name,
          verified: domain.verified,
          createdAt: domain.createdAt
        }))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async prepareFiles(projectPath) {
    const files = {};
    const addFile = async (filePath, relativePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        files[relativePath] = {
          file: content
        };
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
      }
    };

    const walkDir = async (dir, baseDir = dir) => {
      const items = await fs.readdir(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.relative(baseDir, fullPath);

        if (item.startsWith('.') || item === 'node_modules') continue;

        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          await walkDir(fullPath, baseDir);
        } else {
          await addFile(fullPath, relativePath);
        }
      }
    };

    await walkDir(projectPath);
    return files;
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    if (!this.apiKey) {
      throw new Error('Vercel API key not configured');
    }

    const config = {
      method,
      url: `${this.baseUrl}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    if (this.teamId) {
      config.params = { teamId: this.teamId };
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  }
}

class AnthropicIntegration {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.baseUrl = 'https://api.anthropic.com';
  }

  async testConnection() {
    try {
      const response = await this.makeRequest('/v1/messages', 'POST', {
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hello' }]
      });

      return {
        success: true,
        model: 'claude-3-haiku-20240307',
        tokensUsed: response.usage.output_tokens
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sendMessage(messages, model = 'claude-3-sonnet-20240229', maxTokens = 4000) {
    try {
      const response = await this.makeRequest('/v1/messages', 'POST', {
        model,
        max_tokens: maxTokens,
        messages
      });

      return {
        success: true,
        content: response.content[0].text,
        usage: response.usage,
        model: response.model
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const config = {
      method,
      url: `${this.baseUrl}${endpoint}`,
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  }
}

class OpenAIIntegration {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseUrl = 'https://api.openai.com/v1';
  }

  async testConnection() {
    try {
      const response = await this.makeRequest('/models');

      return {
        success: true,
        modelsAvailable: response.data.length,
        gpt4Available: response.data.some(model => model.id.includes('gpt-4'))
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sendMessage(messages, model = 'gpt-4-turbo-preview', maxTokens = 4000) {
    try {
      const response = await this.makeRequest('/chat/completions', 'POST', {
        model,
        messages,
        max_tokens: maxTokens
      });

      return {
        success: true,
        content: response.choices[0].message.content,
        usage: response.usage,
        model: response.model
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const config = {
      method,
      url: `${this.baseUrl}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  }
}

class GoogleIntegration {
  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  async testConnection() {
    try {
      const response = await this.makeRequest('/models');

      return {
        success: true,
        modelsAvailable: response.models?.length || 0,
        geminiAvailable: response.models?.some(model => model.name.includes('gemini')) || false
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sendMessage(message, model = 'gemini-1.5-pro-latest', maxTokens = 4000) {
    try {
      const response = await this.makeRequest(`/models/${model}:generateContent`, 'POST', {
        contents: [{ parts: [{ text: message }] }],
        generationConfig: { maxOutputTokens: maxTokens }
      });

      return {
        success: true,
        content: response.candidates[0].content.parts[0].text,
        usage: response.usageMetadata,
        model
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    if (!this.apiKey) {
      throw new Error('Google API key not configured');
    }

    const config = {
      method,
      url: `${this.baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${this.apiKey}`,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  }
}

module.exports = {
  IntegrationService,
  GitHubIntegration,
  VercelIntegration,
  AnthropicIntegration,
  OpenAIIntegration,
  GoogleIntegration
};