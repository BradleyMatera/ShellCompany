const fs = require('fs').promises;
const path = require('path');
const aiWorkers = require('./ai-workers');

class WorkspaceManager {
  constructor() {
    this.workspacesRoot = path.join(__dirname, '../agent-workspaces');
    this.initializeWorkspaces();
  }

  async initializeWorkspaces() {
    try {
      // Ensure workspaces root directory exists
      await fs.mkdir(this.workspacesRoot, { recursive: true });

      // Get all workers and create their workspaces
      const workers = aiWorkers.getWorkers();
      for (const worker of workers) {
        await this.ensureAgentWorkspace(worker.name.toLowerCase());
      }

      console.log('✅ Agent workspaces initialized');
    } catch (error) {
      console.error('Failed to initialize workspaces:', error);
    }
  }

  async ensureAgentWorkspace(agentId) {
    const workspacePath = path.join(this.workspacesRoot, `${agentId}-workspace`);

    try {
      await fs.mkdir(workspacePath, { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'tasks'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'artifacts'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true });

      // Create default files if they don't exist
      const notesFile = path.join(workspacePath, 'notes.md');
      const configFile = path.join(workspacePath, 'config.json');

      try {
        await fs.access(notesFile);
      } catch {
        await fs.writeFile(notesFile, this.getDefaultNotesContent(agentId));
      }

      try {
        await fs.access(configFile);
      } catch {
        await fs.writeFile(configFile, this.getDefaultConfigContent(agentId));
      }

      return workspacePath;
    } catch (error) {
      console.error(`Failed to create workspace for ${agentId}:`, error);
      throw error;
    }
  }

  getDefaultNotesContent(agentId) {
    const worker = aiWorkers.getWorkers().find(w => w.name.toLowerCase() === agentId);
    return `# ${worker?.name || agentId} - Workspace Notes

## Current Tasks
- No active tasks

## Capabilities
${(worker?.specialties || []).map(s => `- ${s}`).join('\n')}

## Recent Activities
- Workspace initialized on ${new Date().toISOString()}

## Notes
Add your notes and observations here...
`;
  }

  getDefaultConfigContent(agentId) {
    const worker = aiWorkers.getWorkers().find(w => w.name.toLowerCase() === agentId);
    return JSON.stringify({
      agent: worker?.name || agentId,
      role: worker?.role || 'AI Assistant',
      status: worker?.status || 'active',
      specialties: worker?.specialties || [],
      workspace: {
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        fileCount: 2
      },
      preferences: {
        autoSave: true,
        notifications: true
      }
    }, null, 2);
  }

  async getAgentEnvironment(agentId) {
    const workspacePath = path.join(this.workspacesRoot, `${agentId}-workspace`);

    try {
      await this.ensureAgentWorkspace(agentId);
      const files = await this.listFiles(workspacePath);

      return {
        agentName: agentId,
        workspacePath: `/agent-workspaces/${agentId}-workspace`,
        files: files
      };
    } catch (error) {
      console.error(`Failed to get environment for ${agentId}:`, error);
      throw error;
    }
  }

  async listFiles(dirPath, relativePath = '') {
    const files = [];
    const items = await fs.readdir(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = await fs.stat(itemPath);
      const relativeName = relativePath ? `${relativePath}/${item}` : item;

      if (stats.isDirectory()) {
        files.push({
          name: item,
          type: 'directory',
          size: 0,
          modified: stats.mtime.toISOString(),
          path: relativeName
        });

        // Get subdirectory contents
        const subFiles = await this.listFiles(itemPath, relativeName);
        files.push(...subFiles.map(f => ({ ...f, parentDir: item })));
      } else {
        files.push({
          name: item,
          type: 'file',
          size: stats.size,
          modified: stats.mtime.toISOString(),
          path: relativeName
        });
      }
    }

    return files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async getFileContent(agentId, filePath) {
    const workspacePath = path.join(this.workspacesRoot, `${agentId}-workspace`);
    const fullPath = path.join(workspacePath, filePath);

    // Security check - ensure file is within workspace
    const resolvedPath = path.resolve(fullPath);
    const resolvedWorkspace = path.resolve(workspacePath);
    if (!resolvedPath.startsWith(resolvedWorkspace)) {
      throw new Error('Access denied: File outside workspace');
    }

    try {
      const content = await fs.readFile(fullPath, 'utf8');
      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('File not found');
      }
      throw error;
    }
  }

  async saveFileContent(agentId, filePath, content) {
    const workspacePath = path.join(this.workspacesRoot, `${agentId}-workspace`);
    const fullPath = path.join(workspacePath, filePath);

    // Security check - ensure file is within workspace
    const resolvedPath = path.resolve(fullPath);
    const resolvedWorkspace = path.resolve(workspacePath);
    if (!resolvedPath.startsWith(resolvedWorkspace)) {
      throw new Error('Access denied: File outside workspace');
    }

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf8');
      return true;
    } catch (error) {
      console.error(`Failed to save file ${filePath} for ${agentId}:`, error);
      throw error;
    }
  }

  async createFile(agentId, filePath, content = '') {
    return this.saveFileContent(agentId, filePath, content);
  }

  async deleteFile(agentId, filePath) {
    const workspacePath = path.join(this.workspacesRoot, `${agentId}-workspace`);
    const fullPath = path.join(workspacePath, filePath);

    // Security check
    const resolvedPath = path.resolve(fullPath);
    const resolvedWorkspace = path.resolve(workspacePath);
    if (!resolvedPath.startsWith(resolvedWorkspace)) {
      throw new Error('Access denied: File outside workspace');
    }

    try {
      await fs.unlink(fullPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('File not found');
      }
      throw error;
    }
  }

  async getWorkspaceStats(agentId) {
    const workspacePath = path.join(this.workspacesRoot, `${agentId}-workspace`);

    try {
      const files = await this.listFiles(workspacePath);
      const fileCount = files.filter(f => f.type === 'file').length;
      const dirCount = files.filter(f => f.type === 'directory').length;
      const totalSize = files
        .filter(f => f.type === 'file')
        .reduce((sum, f) => sum + f.size, 0);

      return {
        fileCount,
        dirCount,
        totalSize,
        lastModified: Math.max(...files.map(f => new Date(f.modified).getTime()))
      };
    } catch (error) {
      return { fileCount: 0, dirCount: 0, totalSize: 0, lastModified: Date.now() };
    }
  }
}

module.exports = new WorkspaceManager();