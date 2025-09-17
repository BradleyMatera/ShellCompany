const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const workspaceManager = require('./workspace-manager');

class LiveAgentInfrastructure {
  constructor(options = {}) {
    this.socketio = options.socketio;
    this.isHeadless = options.isHeadless || false;
    this.agentWorkspaces = new Map();
    this.activeWorkspaces = new Map();
    this.fileWatchers = new Map();
    this.realTimeConnections = new Map();

    // Root directory for all agent workspaces
    this.workspaceRoot = path.join(__dirname, '../agent-workspaces');

    // Use singleton workspace manager instance for real file operations
    this.workspaceManager = workspaceManager;
    
    console.log('✅ Live Agent Infrastructure initialized');
  }

  /**
   * Initialize live workspace for an agent with real file system
   */
  async initializeAgentWorkspace(agentName) {
    try {
      const agentKey = agentName.toLowerCase();
      const workspacePath = path.join(this.workspaceRoot, `${agentKey}-workspace`);
      
      // Ensure workspace directory exists
      await fs.mkdir(workspacePath, { recursive: true });
      
      // Create standard workspace structure
      const standardDirs = [
        'current-task',
        'artifacts', 
        'drafts',
        'resources',
        'tools',
        'logs'
      ];
      
      for (const dir of standardDirs) {
        const dirPath = path.join(workspacePath, dir);
        await fs.mkdir(dirPath, { recursive: true });
      }
      
      // Create workspace metadata
      const workspaceMetadata = {
        agentName,
        workspacePath,
        initialized: new Date().toISOString(),
        fileCount: 0,
        lastActivity: new Date().toISOString(),
        activeFiles: [],
        recentEdits: [],
        fileTree: await this.generateFileTree(workspacePath)
      };
      
      // Create workspace info file
      const workspaceInfoPath = path.join(workspacePath, 'WORKSPACE_INFO.json');
      await fs.writeFile(workspaceInfoPath, JSON.stringify(workspaceMetadata, null, 2));
      
      // Store in memory
      this.agentWorkspaces.set(agentName, workspaceMetadata);
      
      // Start file watcher for real-time updates
      await this.startFileWatcher(agentName, workspacePath);
      
      console.log(`[AGENT-WORKSPACE] Initialized live workspace for ${agentName}: ${workspacePath}`);
      
      // Emit workspace ready event
      this.safeSocketEmit('agent-workspace-initialized', {
        agentName,
        workspacePath: workspacePath.replace(this.workspaceRoot, ''),
        fileTree: workspaceMetadata.fileTree,
        timestamp: new Date().toISOString()
      });
      
      return workspaceMetadata;
    } catch (error) {
      console.error(`[AGENT-WORKSPACE] Failed to initialize workspace for ${agentName}:`, error);
      throw error;
    }
  }

  /**
   * Generate real file tree for agent workspace
   */
  async generateFileTree(workspacePath) {
    try {
      const tree = await this.buildFileTreeRecursive(workspacePath, workspacePath);
      return tree;
    } catch (error) {
      console.error('[FILE-TREE] Error generating file tree:', error);
      return { name: path.basename(workspacePath), type: 'directory', children: [] };
    }
  }

  /**
   * Recursively build file tree structure
   */
  async buildFileTreeRecursive(currentPath, rootPath) {
    const stats = await fs.stat(currentPath);
    const name = path.basename(currentPath);
    const relativePath = path.relative(rootPath, currentPath);
    
    if (stats.isDirectory()) {
      const children = [];
      try {
        const entries = await fs.readdir(currentPath);
        
        for (const entry of entries) {
          // Skip hidden files and system files
          if (entry.startsWith('.') && entry !== '.gitkeep') continue;
          
          const childPath = path.join(currentPath, entry);
          try {
            const childNode = await this.buildFileTreeRecursive(childPath, rootPath);
            children.push(childNode);
          } catch (error) {
            // Skip files/dirs that can't be read
            console.warn(`[FILE-TREE] Skipping ${childPath}:`, error.message);
          }
        }
        
        // Sort children: directories first, then files
        children.sort((a, b) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });
      } catch (error) {
        console.warn(`[FILE-TREE] Cannot read directory ${currentPath}:`, error.message);
      }
      
      return {
        name,
        type: 'directory',
        path: relativePath || '.',
        children,
        size: children.length,
        modified: stats.mtime.toISOString()
      };
    } else {
      return {
        name,
        type: 'file',
        path: relativePath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        extension: path.extname(name).toLowerCase(),
        isEditable: this.isEditableFile(name)
      };
    }
  }

  /**
   * Check if file is editable in agent environment
   */
  isEditableFile(filename) {
    const editableExtensions = [
      '.md', '.txt', '.json', '.js', '.jsx', '.ts', '.tsx',
      '.html', '.css', '.scss', '.sass', '.xml', '.yaml', '.yml',
      '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs', '.rb',
      '.php', '.sh', '.bash', '.zsh', '.sql', '.env'
    ];
    
    const ext = path.extname(filename).toLowerCase();
    return editableExtensions.includes(ext) || !ext; // Include files without extensions
  }

  /**
   * Start real-time file watcher for agent workspace
   */
  async startFileWatcher(agentName, workspacePath) {
    try {
      const chokidar = require('chokidar');
      
      const watcher = chokidar.watch(workspacePath, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true
      });
      
      watcher
        .on('add', (filePath) => this.handleFileAdded(agentName, filePath))
        .on('change', (filePath) => this.handleFileChanged(agentName, filePath))
        .on('unlink', (filePath) => this.handleFileDeleted(agentName, filePath))
        .on('addDir', (dirPath) => this.handleDirectoryAdded(agentName, dirPath))
        .on('unlinkDir', (dirPath) => this.handleDirectoryDeleted(agentName, dirPath));
      
      this.fileWatchers.set(agentName, watcher);
      console.log(`[FILE-WATCHER] Started watching ${agentName} workspace: ${workspacePath}`);
    } catch (error) {
      console.error(`[FILE-WATCHER] Failed to start watcher for ${agentName}:`, error);
    }
  }

  /**
   * Handle file added event
   */
  async handleFileAdded(agentName, filePath) {
    try {
      const workspace = this.agentWorkspaces.get(agentName);
      if (!workspace) return;
      
      const relativePath = path.relative(workspace.workspacePath, filePath);
      const stats = await fs.stat(filePath);
      
      // Update workspace metadata
      workspace.fileCount++;
      workspace.lastActivity = new Date().toISOString();
      workspace.fileTree = await this.generateFileTree(workspace.workspacePath);
      
      // Emit real-time update
      this.safeSocketEmit('agent-file-added', {
        agentName,
        filePath: relativePath,
        size: stats.size,
        timestamp: new Date().toISOString(),
        fileTree: workspace.fileTree
      });
      
      console.log(`[FILE-WATCHER] File added in ${agentName} workspace: ${relativePath}`);
    } catch (error) {
      console.error(`[FILE-WATCHER] Error handling file added for ${agentName}:`, error);
    }
  }

  /**
   * Handle file changed event
   */
  async handleFileChanged(agentName, filePath) {
    try {
      const workspace = this.agentWorkspaces.get(agentName);
      if (!workspace) return;
      
      const relativePath = path.relative(workspace.workspacePath, filePath);
      const stats = await fs.stat(filePath);
      
      // Update workspace metadata
      workspace.lastActivity = new Date().toISOString();
      workspace.recentEdits.unshift({
        file: relativePath,
        timestamp: new Date().toISOString(),
        size: stats.size
      });
      
      // Keep only recent 10 edits
      if (workspace.recentEdits.length > 10) {
        workspace.recentEdits = workspace.recentEdits.slice(0, 10);
      }
      
      // Emit real-time update
      this.safeSocketEmit('agent-file-changed', {
        agentName,
        filePath: relativePath,
        size: stats.size,
        timestamp: new Date().toISOString(),
        recentEdits: workspace.recentEdits
      });
      
      console.log(`[FILE-WATCHER] File changed in ${agentName} workspace: ${relativePath}`);
    } catch (error) {
      console.error(`[FILE-WATCHER] Error handling file changed for ${agentName}:`, error);
    }
  }

  /**
   * Handle file deleted event
   */
  async handleFileDeleted(agentName, filePath) {
    try {
      const workspace = this.agentWorkspaces.get(agentName);
      if (!workspace) return;
      
      const relativePath = path.relative(workspace.workspacePath, filePath);
      
      // Update workspace metadata
      workspace.fileCount = Math.max(0, workspace.fileCount - 1);
      workspace.lastActivity = new Date().toISOString();
      workspace.fileTree = await this.generateFileTree(workspace.workspacePath);
      
      // Emit real-time update
      this.safeSocketEmit('agent-file-deleted', {
        agentName,
        filePath: relativePath,
        timestamp: new Date().toISOString(),
        fileTree: workspace.fileTree
      });
      
      console.log(`[FILE-WATCHER] File deleted in ${agentName} workspace: ${relativePath}`);
    } catch (error) {
      console.error(`[FILE-WATCHER] Error handling file deleted for ${agentName}:`, error);
    }
  }

  /**
   * Handle directory added event
   */
  async handleDirectoryAdded(agentName, dirPath) {
    try {
      const workspace = this.agentWorkspaces.get(agentName);
      if (!workspace) return;
      
      const relativePath = path.relative(workspace.workspacePath, dirPath);
      workspace.lastActivity = new Date().toISOString();
      workspace.fileTree = await this.generateFileTree(workspace.workspacePath);
      
      this.safeSocketEmit('agent-directory-added', {
        agentName,
        dirPath: relativePath,
        timestamp: new Date().toISOString(),
        fileTree: workspace.fileTree
      });
      
      console.log(`[FILE-WATCHER] Directory added in ${agentName} workspace: ${relativePath}`);
    } catch (error) {
      console.error(`[FILE-WATCHER] Error handling directory added for ${agentName}:`, error);
    }
  }

  /**
   * Handle directory deleted event
   */
  async handleDirectoryDeleted(agentName, dirPath) {
    try {
      const workspace = this.agentWorkspaces.get(agentName);
      if (!workspace) return;
      
      const relativePath = path.relative(workspace.workspacePath, dirPath);
      workspace.lastActivity = new Date().toISOString();
      workspace.fileTree = await this.generateFileTree(workspace.workspacePath);
      
      this.safeSocketEmit('agent-directory-deleted', {
        agentName,
        dirPath: relativePath,
        timestamp: new Date().toISOString(),
        fileTree: workspace.fileTree
      });
      
      console.log(`[FILE-WATCHER] Directory deleted in ${agentName} workspace: ${relativePath}`);
    } catch (error) {
      console.error(`[FILE-WATCHER] Error handling directory deleted for ${agentName}:`, error);
    }
  }

  /**
   * Read file content from agent workspace
   */
  async readAgentFile(agentName, relativePath) {
    try {
      const workspace = this.agentWorkspaces.get(agentName);
      if (!workspace) {
        console.error(`[AGENT-FILE] Workspace not found for agent: ${agentName}`);
        throw new Error(`Agent workspace not found: ${agentName}`);
      }

      const fullPath = path.join(workspace.workspacePath, relativePath);
      const resolvedPath = path.resolve(fullPath);
      const resolvedWorkspace = path.resolve(workspace.workspacePath);

      console.log(`[AGENT-FILE] Attempting to read file for agent '${agentName}':`);
      console.log(`  Requested relative path: ${relativePath}`);
      console.log(`  Resolved file path:     ${resolvedPath}`);
      console.log(`  Workspace root:         ${resolvedWorkspace}`);

      if (!resolvedPath.startsWith(resolvedWorkspace)) {
        console.error(`[AGENT-FILE] Access denied: Path outside workspace`);
        throw new Error('Access denied: Path outside workspace');
      }

      // Check if file exists
      let stats;
      try {
        stats = await fs.stat(fullPath);
      } catch (err) {
        console.error(`[AGENT-FILE] File not found: ${resolvedPath}`);
        throw new Error('File not found: ' + resolvedPath);
      }
      if (!stats.isFile()) {
        console.error(`[AGENT-FILE] Path is not a file: ${resolvedPath}`);
        throw new Error('Path is not a file: ' + resolvedPath);
      }

      // Read file content
      let content;
      try {
        content = await fs.readFile(fullPath, 'utf8');
      } catch (err) {
        console.error(`[AGENT-FILE] Error reading file content: ${resolvedPath}`, err);
        throw new Error('Failed to read file content: ' + resolvedPath);
      }

      // Update access tracking
      workspace.lastActivity = new Date().toISOString();
      if (!workspace.activeFiles.includes(relativePath)) {
        workspace.activeFiles.push(relativePath);
        if (workspace.activeFiles.length > 5) {
          workspace.activeFiles = workspace.activeFiles.slice(-5);
        }
      }

      return {
        path: relativePath,
        content,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        encoding: 'utf8',
        isEditable: this.isEditableFile(path.basename(relativePath))
      };
    } catch (error) {
      console.error(`[AGENT-FILE] Error reading file for agent '${agentName}', path '${relativePath}':`, error);
      throw error;
    }
  }

  /**
   * Write file content to agent workspace
   */
  async writeAgentFile(agentName, relativePath, content, metadata = {}) {
    try {
      const workspace = this.agentWorkspaces.get(agentName);
      if (!workspace) {
        throw new Error(`Agent workspace not found: ${agentName}`);
      }
      
      const fullPath = path.join(workspace.workspacePath, relativePath);
      
      // Security check - ensure path is within workspace
      const resolvedPath = path.resolve(fullPath);
      const resolvedWorkspace = path.resolve(workspace.workspacePath);
      
      if (!resolvedPath.startsWith(resolvedWorkspace)) {
        throw new Error('Access denied: Path outside workspace');
      }
      
      // Ensure directory exists
      const dirPath = path.dirname(fullPath);
      await fs.mkdir(dirPath, { recursive: true });
      
      // Write file content
      await fs.writeFile(fullPath, content, 'utf8');
      
      // Get file stats
      const stats = await fs.stat(fullPath);
      
      // Update workspace metadata
      workspace.lastActivity = new Date().toISOString();
      workspace.recentEdits.unshift({
        file: relativePath,
        timestamp: new Date().toISOString(),
        size: stats.size,
        action: 'written',
        author: metadata.author || 'user'
      });
      
      // Keep only recent 10 edits
      if (workspace.recentEdits.length > 10) {
        workspace.recentEdits = workspace.recentEdits.slice(0, 10);
      }
      
      // Update file tree
      workspace.fileTree = await this.generateFileTree(workspace.workspacePath);
      
      // Emit real-time update
      this.safeSocketEmit('agent-file-written', {
        agentName,
        filePath: relativePath,
        size: stats.size,
        author: metadata.author || 'user',
        timestamp: new Date().toISOString(),
        fileTree: workspace.fileTree
      });
      
      console.log(`[AGENT-FILE] File written in ${agentName} workspace: ${relativePath} (${stats.size} bytes)`);
      
      return {
        path: relativePath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        success: true
      };
    } catch (error) {
      console.error(`[AGENT-FILE] Error writing file ${relativePath} for ${agentName}:`, error);
      throw error;
    }
  }

  /**
   * Create new file in agent workspace
   */
  async createAgentFile(agentName, relativePath, content = '', metadata = {}) {
    try {
      // Check if file already exists
      const workspace = this.agentWorkspaces.get(agentName);
      if (workspace) {
        const fullPath = path.join(workspace.workspacePath, relativePath);
        try {
          await fs.access(fullPath);
          throw new Error('File already exists');
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error; // Re-throw if it's not a "file doesn't exist" error
          }
          // File doesn't exist, proceed with creation
        }
      }
      
      return await this.writeAgentFile(agentName, relativePath, content, {
        ...metadata,
        action: 'created'
      });
    } catch (error) {
      console.error(`[AGENT-FILE] Error creating file ${relativePath} for ${agentName}:`, error);
      throw error;
    }
  }

  /**
   * Delete file from agent workspace
   */
  async deleteAgentFile(agentName, relativePath) {
    try {
      const workspace = this.agentWorkspaces.get(agentName);
      if (!workspace) {
        throw new Error(`Agent workspace not found: ${agentName}`);
      }
      
      const fullPath = path.join(workspace.workspacePath, relativePath);
      
      // Security check - ensure path is within workspace
      const resolvedPath = path.resolve(fullPath);
      const resolvedWorkspace = path.resolve(workspace.workspacePath);
      
      if (!resolvedPath.startsWith(resolvedWorkspace)) {
        throw new Error('Access denied: Path outside workspace');
      }
      
      // Delete file
      await fs.unlink(fullPath);
      
      // Update workspace metadata
      workspace.lastActivity = new Date().toISOString();
      workspace.fileCount = Math.max(0, workspace.fileCount - 1);
      
      // Remove from active files
      workspace.activeFiles = workspace.activeFiles.filter(f => f !== relativePath);
      
      // Update file tree
      workspace.fileTree = await this.generateFileTree(workspace.workspacePath);
      
      console.log(`[AGENT-FILE] File deleted from ${agentName} workspace: ${relativePath}`);
      
      return { success: true, path: relativePath };
    } catch (error) {
      console.error(`[AGENT-FILE] Error deleting file ${relativePath} for ${agentName}:`, error);
      throw error;
    }
  }

  /**
   * Get agent workspace status and file tree
   */
  async getAgentWorkspaceStatus(agentName) {
    try {
      let workspace = this.agentWorkspaces.get(agentName);
      
      if (!workspace) {
        // Initialize workspace if it doesn't exist
        workspace = await this.initializeAgentWorkspace(agentName);
      }
      
      // Refresh file tree
      workspace.fileTree = await this.generateFileTree(workspace.workspacePath);
      
      return {
        agentName,
        status: 'active',
        workspacePath: workspace.workspacePath.replace(this.workspaceRoot, ''),
        fileCount: workspace.fileCount,
        lastActivity: workspace.lastActivity,
        activeFiles: workspace.activeFiles,
        recentEdits: workspace.recentEdits,
        fileTree: workspace.fileTree,
        initialized: workspace.initialized
      };
    } catch (error) {
      console.error(`[AGENT-WORKSPACE] Error getting status for ${agentName}:`, error);
      return {
        agentName,
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get all agent workspace statuses
   */
  async getAllAgentWorkspaceStatuses() {
    const statuses = {};
    
    // Get all agent names from existing workspaces
    const agentNames = Array.from(this.agentWorkspaces.keys());
    
    // Also scan for any workspace directories that might exist
    try {
      const workspaceDirs = await fs.readdir(this.workspaceRoot);
      for (const dir of workspaceDirs) {
        if (dir.endsWith('-workspace')) {
          const agentName = dir.replace('-workspace', '');
          const capitalizedAgentName = agentName.charAt(0).toUpperCase() + agentName.slice(1);
          if (!agentNames.includes(capitalizedAgentName)) {
            agentNames.push(capitalizedAgentName);
          }
        }
      }
    } catch (error) {
      console.warn('[AGENT-WORKSPACE] Could not scan workspace root:', error);
    }
    
    // Get status for each agent
    for (const agentName of agentNames) {
      try {
        statuses[agentName] = await this.getAgentWorkspaceStatus(agentName);
      } catch (error) {
        statuses[agentName] = {
          agentName,
          status: 'error',
          error: error.message
        };
      }
    }
    
    return statuses;
  }

  /**
   * Execute command in agent workspace
   */
  async executeAgentCommand(agentName, command, workingDir = '.') {
    try {
      const workspace = this.agentWorkspaces.get(agentName);
      if (!workspace) {
        throw new Error(`Agent workspace not found: ${agentName}`);
      }
      
      const { spawn } = require('child_process');
      const cwd = path.join(workspace.workspacePath, workingDir);
      
      return new Promise((resolve, reject) => {
        const child = spawn('bash', ['-c', command], {
          cwd,
          stdio: 'pipe'
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('close', (exitCode) => {
          const result = {
            command,
            exitCode,
            stdout,
            stderr,
            success: exitCode === 0,
            timestamp: new Date().toISOString(),
            workingDir
          };
          
          // Update workspace activity
          workspace.lastActivity = new Date().toISOString();
          
          // Emit command result
          this.safeSocketEmit('agent-command-executed', {
            agentName,
            ...result
          });
          
          resolve(result);
        });
        
        child.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      console.error(`[AGENT-COMMAND] Error executing command for ${agentName}:`, error);
      throw error;
    }
  }

  /**
   * Safe socket emit with headless test compatibility
   */
  safeSocketEmit(event, data) {
    try {
      if (this.isHeadless) {
        // In headless mode, log the event instead of emitting
        console.log(`[SOCKET-HEADLESS] ${event}:`, JSON.stringify(data, null, 2));
        return true;
      }
      
      if (this.socketio && typeof this.socketio.emit === 'function') {
        this.socketio.emit(event, data);
        return true;
      } else {
        console.log(`[SOCKET-UNAVAILABLE] ${event}:`, 'socketio not available');
        return false;
      }
    } catch (error) {
      console.error(`[SOCKET-ERROR] Failed to emit ${event}:`, error.message);
      return false;
    }
  }

  /**
   * Shutdown agent infrastructure and cleanup
   */
  async shutdown() {
    try {
      // Stop all file watchers
      for (const [agentName, watcher] of this.fileWatchers) {
        try {
          await watcher.close();
          console.log(`[FILE-WATCHER] Stopped watcher for ${agentName}`);
        } catch (error) {
          console.warn(`[FILE-WATCHER] Error stopping watcher for ${agentName}:`, error);
        }
      }
      
      this.fileWatchers.clear();
      this.agentWorkspaces.clear();
      this.activeWorkspaces.clear();
      this.realTimeConnections.clear();
      
      console.log('✅ Live Agent Infrastructure shutdown complete');
    } catch (error) {
      console.error('[AGENT-INFRASTRUCTURE] Error during shutdown:', error);
    }
  }
}

module.exports = LiveAgentInfrastructure;
