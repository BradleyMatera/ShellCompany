const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs').promises;

class FileWatcherService {
  constructor(io) {
    this.io = io;
    this.watchers = new Map();
    this.projectRoot = path.resolve(__dirname, '../../');
    this.fileChanges = [];
    this.isWatching = false;
  }

  startWatching() {
    if (this.isWatching) return;

    console.log('Starting file watcher on project root:', this.projectRoot);

    const watcher = chokidar.watch(this.projectRoot, {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/*.log',
        '**/.*',
        '**/coverage/**',
        '**/.next/**'
      ],
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      depth: 10
    });

    watcher
      .on('add', (filepath) => this.handleFileChange('add', filepath))
      .on('change', (filepath) => this.handleFileChange('change', filepath))
      .on('unlink', (filepath) => this.handleFileChange('delete', filepath))
      .on('addDir', (dirpath) => this.handleFileChange('addDir', dirpath))
      .on('unlinkDir', (dirpath) => this.handleFileChange('deleteDir', dirpath))
      .on('error', (error) => console.error('File watcher error:', error))
      .on('ready', () => {
        console.log('File watcher ready');
        this.isWatching = true;
        this.broadcastWatcherStatus();
      });

    this.watchers.set('main', watcher);
  }

  stopWatching() {
    this.watchers.forEach(watcher => watcher.close());
    this.watchers.clear();
    this.isWatching = false;
    this.broadcastWatcherStatus();
    console.log('File watcher stopped');
  }

  async handleFileChange(eventType, filepath) {
    const relativePath = path.relative(this.projectRoot, filepath);
    const timestamp = Date.now();

    let fileInfo = {
      event: eventType,
      path: relativePath,
      fullPath: filepath,
      timestamp,
      size: null,
      extension: path.extname(filepath),
      isDirectory: eventType.includes('Dir')
    };

    if (!fileInfo.isDirectory && (eventType === 'add' || eventType === 'change')) {
      try {
        const stats = await fs.stat(filepath);
        fileInfo.size = stats.size;
        fileInfo.modified = stats.mtime;

        if (this.shouldReadFileContent(filepath)) {
          const content = await fs.readFile(filepath, 'utf8');
          fileInfo.contentPreview = content.substring(0, 500);
          fileInfo.lineCount = content.split('\n').length;
        }
      } catch (error) {
        console.error('Error reading file stats:', error);
      }
    }

    this.fileChanges.unshift(fileInfo);

    if (this.fileChanges.length > 100) {
      this.fileChanges = this.fileChanges.slice(0, 100);
    }

    this.broadcastFileChange(fileInfo);

    if (this.shouldTriggerAgentNotification(fileInfo)) {
      this.notifyAgents(fileInfo);
    }
  }

  shouldReadFileContent(filepath) {
    const textExtensions = ['.js', '.ts', '.tsx', '.jsx', '.json', '.md', '.txt', '.css', '.scss', '.html', '.vue'];
    const extension = path.extname(filepath).toLowerCase();
    return textExtensions.includes(extension);
  }

  shouldTriggerAgentNotification(fileInfo) {
    const criticalFiles = [
      'package.json',
      'tsconfig.json',
      '.env',
      'docker-compose.yml',
      'Dockerfile'
    ];

    const criticalExtensions = ['.js', '.ts', '.tsx', '.jsx'];

    return criticalFiles.includes(path.basename(fileInfo.path)) ||
           criticalExtensions.includes(fileInfo.extension) ||
           fileInfo.path.includes('src/') ||
           fileInfo.path.includes('server/');
  }

  broadcastFileChange(fileInfo) {
    if (this.io) {
      this.io.emit('file-change', fileInfo);

      this.io.emit('console-update', {
        type: 'file-change',
        timestamp: fileInfo.timestamp,
        message: `${fileInfo.event.toUpperCase()}: ${fileInfo.path}`,
        data: fileInfo
      });
    }
  }

  broadcastWatcherStatus() {
    if (this.io) {
      this.io.emit('watcher-status', {
        isWatching: this.isWatching,
        watchedPaths: Array.from(this.watchers.keys()),
        projectRoot: path.relative(process.cwd(), this.projectRoot)
      });
    }
  }

  async notifyAgents(fileInfo) {
    const notification = {
      type: 'file_system_change',
      event: fileInfo.event,
      path: fileInfo.path,
      timestamp: fileInfo.timestamp,
      metadata: {
        extension: fileInfo.extension,
        size: fileInfo.size,
        isDirectory: fileInfo.isDirectory
      }
    };

    if (this.io) {
      this.io.emit('agent-notification', notification);
    }

    console.log(`Agent notification sent for ${fileInfo.event}: ${fileInfo.path}`);
  }

  getRecentChanges(limit = 20) {
    return this.fileChanges.slice(0, limit);
  }

  getWatcherStatus() {
    return {
      isWatching: this.isWatching,
      watchedPaths: Array.from(this.watchers.keys()),
      projectRoot: this.projectRoot,
      recentChanges: this.getRecentChanges(10)
    };
  }

  addCustomWatch(watchPath, identifier) {
    if (this.watchers.has(identifier)) {
      console.log(`Watcher ${identifier} already exists`);
      return false;
    }

    const watcher = chokidar.watch(watchPath, {
      persistent: true,
      ignoreInitial: true
    });

    watcher
      .on('all', (eventType, filepath) => {
        this.handleFileChange(`${identifier}_${eventType}`, filepath);
      })
      .on('error', (error) => {
        console.error(`Custom watcher ${identifier} error:`, error);
      });

    this.watchers.set(identifier, watcher);
    return true;
  }

  removeCustomWatch(identifier) {
    if (this.watchers.has(identifier)) {
      this.watchers.get(identifier).close();
      this.watchers.delete(identifier);
      return true;
    }
    return false;
  }

  async getDirStructure(dirPath = this.projectRoot, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) return null;

    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) return null;

      const items = await fs.readdir(dirPath);
      const structure = {
        name: path.basename(dirPath),
        path: path.relative(this.projectRoot, dirPath),
        type: 'directory',
        children: []
      };

      for (const item of items) {
        if (item.startsWith('.') && item !== '.env') continue;
        if (item === 'node_modules') continue;

        const itemPath = path.join(dirPath, item);
        const itemStats = await fs.stat(itemPath);

        if (itemStats.isDirectory()) {
          const subStructure = await this.getDirStructure(itemPath, maxDepth, currentDepth + 1);
          if (subStructure) {
            structure.children.push(subStructure);
          }
        } else {
          structure.children.push({
            name: item,
            path: path.relative(this.projectRoot, itemPath),
            type: 'file',
            size: itemStats.size,
            modified: itemStats.mtime,
            extension: path.extname(item)
          });
        }
      }

      return structure;
    } catch (error) {
      console.error('Error reading directory structure:', error);
      return null;
    }
  }
}

module.exports = FileWatcherService;