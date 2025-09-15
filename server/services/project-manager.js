const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class ProjectManager {
  constructor() {
    this.projectsRoot = path.join(__dirname, '../agent-workspaces');
  }

  async getProjectWorkspaces() {
    try {
      const workspaces = [];
      const agentDirs = await fs.readdir(this.projectsRoot);

      for (const agentDir of agentDirs) {
        if (!agentDir.endsWith('-workspace')) continue;

        const agentPath = path.join(this.projectsRoot, agentDir);
        const agentName = agentDir.replace('-workspace', '');

        try {
          const projects = await this.getAgentProjects(agentName, agentPath);
          workspaces.push({
            agent: agentName,
            workspacePath: agentPath,
            projects: projects
          });
        } catch (error) {
          console.error(`Error scanning agent ${agentName}:`, error);
        }
      }

      return workspaces;
    } catch (error) {
      console.error('Failed to scan project workspaces:', error);
      return [];
    }
  }

  async getAgentProjects(agentName, agentPath) {
    const projects = [];
    const items = await fs.readdir(agentPath);

    for (const item of items) {
      const itemPath = path.join(agentPath, item);
      const stats = await fs.stat(itemPath);

      if (stats.isDirectory() && item.endsWith('-project')) {
        const projectInfo = await this.analyzeProject(agentName, item, itemPath);
        projects.push(projectInfo);
      }
    }

    return projects;
  }

  async analyzeProject(agentName, projectName, projectPath) {
    const project = {
      id: `${agentName}-${projectName}`,
      name: projectName,
      agent: agentName,
      path: projectPath,
      relativePath: `${agentName}-workspace/${projectName}`,
      type: this.detectProjectType(projectPath),
      status: 'active',
      files: [],
      artifacts: [],
      metadata: {},
      lastModified: new Date(),
      createdAt: new Date()
    };

    try {
      // Get file structure
      project.files = await this.getProjectFiles(projectPath);

      // Detect project metadata
      project.metadata = await this.detectProjectMetadata(projectPath);

      // Get file stats
      const stats = await fs.stat(projectPath);
      project.lastModified = stats.mtime;
      project.createdAt = stats.birthtime;

      // Analyze project artifacts
      project.artifacts = await this.getProjectArtifacts(projectPath);

      // Determine project status
      project.status = await this.determineProjectStatus(projectPath, project.metadata);

    } catch (error) {
      console.error(`Error analyzing project ${projectName}:`, error);
    }

    return project;
  }

  async getProjectFiles(projectPath, relativePath = '') {
    const files = [];

    try {
      const items = await fs.readdir(projectPath);

      for (const item of items) {
        const itemPath = path.join(projectPath, item);
        const stats = await fs.stat(itemPath);
        const relativeItemPath = relativePath ? `${relativePath}/${item}` : item;

        if (stats.isDirectory()) {
          // Skip node_modules and other common ignore patterns
          if (['node_modules', '.git', '.next', 'dist', 'build'].includes(item)) {
            files.push({
              name: item,
              type: 'directory',
              size: 0,
              path: relativeItemPath,
              isIgnored: true,
              modified: stats.mtime.toISOString()
            });
            continue;
          }

          files.push({
            name: item,
            type: 'directory',
            size: 0,
            path: relativeItemPath,
            modified: stats.mtime.toISOString()
          });

          // Recursively get subdirectory contents (limit depth)
          if (relativePath.split('/').length < 3) {
            const subFiles = await this.getProjectFiles(itemPath, relativeItemPath);
            files.push(...subFiles.map(f => ({ ...f, parentDir: item })));
          }
        } else {
          files.push({
            name: item,
            type: 'file',
            size: stats.size,
            path: relativeItemPath,
            modified: stats.mtime.toISOString(),
            extension: path.extname(item)
          });
        }
      }
    } catch (error) {
      console.error(`Error reading project files at ${projectPath}:`, error);
    }

    return files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async detectProjectMetadata(projectPath) {
    const metadata = {};

    try {
      // Check for package.json
      const packagePath = path.join(projectPath, 'package.json');
      try {
        const packageContent = await fs.readFile(packagePath, 'utf8');
        const packageJson = JSON.parse(packageContent);
        metadata.package = packageJson;
        metadata.name = packageJson.name;
        metadata.description = packageJson.description;
        metadata.version = packageJson.version;
        metadata.dependencies = Object.keys(packageJson.dependencies || {});
        metadata.scripts = Object.keys(packageJson.scripts || {});
      } catch (e) {
        // No package.json or invalid JSON
      }

      // Check for README files
      const readmeFiles = ['README.md', 'readme.md', 'README.txt', 'README'];
      for (const readmeFile of readmeFiles) {
        try {
          const readmePath = path.join(projectPath, readmeFile);
          const readmeContent = await fs.readFile(readmePath, 'utf8');
          metadata.readme = {
            file: readmeFile,
            content: readmeContent.substring(0, 500) // First 500 chars
          };
          break;
        } catch (e) {
          // Continue to next README file
        }
      }

      // Check for project plan files
      const planFiles = ['project-plan.md', 'plan.md', 'PROJECT.md'];
      for (const planFile of planFiles) {
        try {
          const planPath = path.join(projectPath, planFile);
          const planContent = await fs.readFile(planPath, 'utf8');
          metadata.plan = {
            file: planFile,
            content: planContent
          };
          break;
        } catch (e) {
          // Continue to next plan file
        }
      }

      // Check for execution logs
      try {
        const logPath = path.join(projectPath, 'execution.log');
        const logContent = await fs.readFile(logPath, 'utf8');
        metadata.executionLog = logContent;
      } catch (e) {
        // No execution log
      }

    } catch (error) {
      console.error('Error detecting project metadata:', error);
    }

    return metadata;
  }

  detectProjectType(projectPath) {
    const projectName = path.basename(projectPath);

    // Common project type patterns
    if (projectName.includes('dashboard')) return 'dashboard';
    if (projectName.includes('api')) return 'api';
    if (projectName.includes('web') || projectName.includes('site')) return 'website';
    if (projectName.includes('landing')) return 'landing-page';
    if (projectName.includes('general')) return 'general';
    if (projectName.includes('component')) return 'component';
    if (projectName.includes('service')) return 'service';

    return 'project';
  }

  async getProjectArtifacts(projectPath) {
    const artifacts = [];

    try {
      const files = await this.getProjectFiles(projectPath);

      // Common artifact patterns
      const artifactPatterns = [
        { pattern: /\.(html|htm)$/i, type: 'webpage', category: 'output' },
        { pattern: /\.(css|scss|sass)$/i, type: 'stylesheet', category: 'style' },
        { pattern: /\.(js|jsx|ts|tsx)$/i, type: 'code', category: 'source' },
        { pattern: /\.(json)$/i, type: 'data', category: 'config' },
        { pattern: /\.(md|txt)$/i, type: 'documentation', category: 'docs' },
        { pattern: /\.(png|jpg|jpeg|gif|svg)$/i, type: 'image', category: 'assets' },
        { pattern: /package\.json$/i, type: 'package', category: 'config' },
        { pattern: /README/i, type: 'readme', category: 'docs' }
      ];

      for (const file of files) {
        if (file.type === 'file' && !file.isIgnored) {
          for (const { pattern, type, category } of artifactPatterns) {
            if (pattern.test(file.name)) {
              artifacts.push({
                id: `${path.basename(projectPath)}-${file.name}`,
                name: file.name,
                type: type,
                category: category,
                size: file.size,
                path: file.path,
                modified: file.modified,
                downloadPath: `/api/projects/${path.basename(projectPath)}/files/${encodeURIComponent(file.path)}`
              });
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error getting project artifacts:', error);
    }

    return artifacts;
  }

  async determineProjectStatus(projectPath, metadata) {
    // Check execution log for completion
    if (metadata.executionLog && metadata.executionLog.includes('Core functionality implemented')) {
      return 'completed';
    }

    // Check if package.json exists and has dependencies installed
    if (metadata.package) {
      const nodeModulesPath = path.join(projectPath, 'node_modules');
      try {
        await fs.access(nodeModulesPath);
        return 'in-development';
      } catch (e) {
        return 'setup-required';
      }
    }

    // Check for recent modifications
    const stats = await fs.stat(projectPath);
    const daysSinceModified = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceModified > 7) {
      return 'inactive';
    }

    return 'active';
  }

  async getProjectContent(agentName, projectName, filePath) {
    const projectPath = path.join(this.projectsRoot, `${agentName}-workspace`, projectName);
    const fullPath = path.join(projectPath, filePath || '');

    // Security check
    const resolvedPath = path.resolve(fullPath);
    const resolvedProject = path.resolve(projectPath);
    if (!resolvedPath.startsWith(resolvedProject)) {
      throw new Error('Access denied: File outside project directory');
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

  async saveProjectContent(agentName, projectName, filePath, content) {
    const projectPath = path.join(this.projectsRoot, `${agentName}-workspace`, projectName);
    const fullPath = path.join(projectPath, filePath);

    // Security check
    const resolvedPath = path.resolve(fullPath);
    const resolvedProject = path.resolve(projectPath);
    if (!resolvedPath.startsWith(resolvedProject)) {
      throw new Error('Access denied: File outside project directory');
    }

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf8');
      return true;
    } catch (error) {
      console.error(`Failed to save file ${filePath} in ${projectName}:`, error);
      throw error;
    }
  }

  async runProjectCommand(agentName, projectName, command) {
    const projectPath = path.join(this.projectsRoot, `${agentName}-workspace`, projectName);

    // Security: only allow safe commands
    const allowedCommands = [
      'npm install',
      'npm run build',
      'npm run dev',
      'npm run start',
      'npm run test',
      'npm audit',
      'npm outdated',
      'ls',
      'pwd',
      'git status',
      'git log --oneline -10'
    ];

    if (!allowedCommands.some(allowed => command.startsWith(allowed))) {
      throw new Error('Command not allowed for security reasons');
    }

    try {
      const output = execSync(command, {
        cwd: projectPath,
        encoding: 'utf8',
        timeout: 30000 // 30 second timeout
      });
      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        output: error.stdout || error.stderr || ''
      };
    }
  }

  async cloneProject(agentName, projectName, newProjectName) {
    const sourcePath = path.join(this.projectsRoot, `${agentName}-workspace`, projectName);
    const targetPath = path.join(this.projectsRoot, `${agentName}-workspace`, newProjectName);

    try {
      // Check if source exists
      await fs.access(sourcePath);

      // Check if target already exists
      try {
        await fs.access(targetPath);
        throw new Error('Target project already exists');
      } catch (e) {
        // Good, target doesn't exist
      }

      // Copy project recursively
      await this.copyDirectory(sourcePath, targetPath);

      // Update project metadata if package.json exists
      try {
        const packagePath = path.join(targetPath, 'package.json');
        const packageContent = await fs.readFile(packagePath, 'utf8');
        const packageJson = JSON.parse(packageContent);
        packageJson.name = newProjectName;
        await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
      } catch (e) {
        // No package.json or error updating
      }

      return true;
    } catch (error) {
      console.error(`Failed to clone project ${projectName} to ${newProjectName}:`, error);
      throw error;
    }
  }

  async copyDirectory(source, target) {
    await fs.mkdir(target, { recursive: true });
    const items = await fs.readdir(source);

    for (const item of items) {
      const sourcePath = path.join(source, item);
      const targetPath = path.join(target, item);
      const stats = await fs.stat(sourcePath);

      if (stats.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  async deleteProject(agentName, projectName) {
    const projectPath = path.join(this.projectsRoot, `${agentName}-workspace`, projectName);

    try {
      await this.removeDirectory(projectPath);
      return true;
    } catch (error) {
      console.error(`Failed to delete project ${projectName}:`, error);
      throw error;
    }
  }

  async removeDirectory(dirPath) {
    const items = await fs.readdir(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = await fs.stat(itemPath);

      if (stats.isDirectory()) {
        await this.removeDirectory(itemPath);
      } else {
        await fs.unlink(itemPath);
      }
    }

    await fs.rmdir(dirPath);
  }

  async getProjectStats() {
    const workspaces = await this.getProjectWorkspaces();
    const stats = {
      totalProjects: 0,
      projectsByAgent: {},
      projectsByType: {},
      projectsByStatus: {},
      totalFiles: 0,
      totalArtifacts: 0
    };

    for (const workspace of workspaces) {
      stats.projectsByAgent[workspace.agent] = workspace.projects.length;
      stats.totalProjects += workspace.projects.length;

      for (const project of workspace.projects) {
        // Count by type
        stats.projectsByType[project.type] = (stats.projectsByType[project.type] || 0) + 1;

        // Count by status
        stats.projectsByStatus[project.status] = (stats.projectsByStatus[project.status] || 0) + 1;

        // Count files and artifacts
        stats.totalFiles += project.files.length;
        stats.totalArtifacts += project.artifacts.length;
      }
    }

    return stats;
  }
}

module.exports = new ProjectManager();