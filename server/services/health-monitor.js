const os = require('os');
const fs = require('fs');
const path = require('path');

class HealthMonitor {
  constructor() {
    this.metrics = {
      uptime: 0,
      requests: 0,
      errors: 0,
      activeAgents: 0,
      totalWorkflows: 0,
      activeWorkflows: 0,
      systemResources: {},
      lastUpdate: new Date().toISOString()
    };

    this.startTime = Date.now();
    this.requestCount = 0;
    this.errorCount = 0;

    // Start monitoring
    this.startMetricsCollection();
  }

  startMetricsCollection() {
    // store interval id so it can be cleared during shutdown (useful for tests)
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 30000); // Update every 30 seconds
  }

  updateMetrics() {
    this.metrics = {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      requests: this.requestCount,
      errors: this.errorCount,
      activeAgents: this.getActiveAgentsCount(),
      totalWorkflows: this.getTotalWorkflowsCount(),
      activeWorkflows: this.getActiveWorkflowsCount(),
      systemResources: this.getSystemResources(),
      lastUpdate: new Date().toISOString()
    };
  }

  getActiveAgentsCount() {
    try {
      const aiWorkers = require('./ai-workers');
      const workers = aiWorkers.getWorkers();
      return workers.filter(w => w.status === 'active' || w.status === 'busy').length;
    } catch (error) {
      return 0;
    }
  }

  getTotalWorkflowsCount() {
    try {
      // Check database for total workflows
      const dbPath = path.join(__dirname, '../shellcompany.db');
      if (fs.existsSync(dbPath)) {
        // This would ideally query the database, but for now return estimated
        return this.requestCount > 0 ? Math.floor(this.requestCount / 10) : 0;
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  getActiveWorkflowsCount() {
    // In a production system, this would query active workflows from orchestrator
    return Math.floor(this.getActiveAgentsCount() / 2);
  }

  getSystemResources() {
    const memoryUsage = process.memoryUsage();
    const loadAvg = os.loadavg();

    return {
      cpu: {
        usage: (loadAvg[0] * 100 / os.cpus().length).toFixed(1),
        loadAverage: loadAvg.map(load => load.toFixed(2))
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        process: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          rss: memoryUsage.rss
        }
      },
      storage: this.getStorageInfo(),
      network: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version
      }
    };
  }

  getStorageInfo() {
    try {
      const dbPath = path.join(__dirname, '../shellcompany.db');
      const logPath = path.join(__dirname, '../server.log');

      let dbSize = 0;
      let logSize = 0;

      if (fs.existsSync(dbPath)) {
        dbSize = fs.statSync(dbPath).size;
      }

      if (fs.existsSync(logPath)) {
        logSize = fs.statSync(logPath).size;
      }

      return {
        database: {
          size: dbSize,
          path: dbPath
        },
        logs: {
          size: logSize,
          path: logPath
        }
      };
    } catch (error) {
      return {
        database: { size: 0, path: 'unknown' },
        logs: { size: 0, path: 'unknown' }
      };
    }
  }

  incrementRequests() {
    this.requestCount++;
  }

  incrementErrors() {
    this.errorCount++;
  }

  getHealthStatus() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: this.metrics.uptime,
      version: '1.0.0'
    };

    // Check system health
    const memoryUsage = this.metrics.systemResources.memory?.process?.heapUsed || 0;
    const memoryTotal = this.metrics.systemResources.memory?.total || 1;
    const memoryPercent = (memoryUsage / memoryTotal) * 100;

    const cpuUsage = parseFloat(this.metrics.systemResources.cpu?.usage || 0);

    // Determine health status
    if (memoryPercent > 90 || cpuUsage > 90) {
      health.status = 'critical';
    } else if (memoryPercent > 70 || cpuUsage > 70) {
      health.status = 'warning';
    }

    health.checks = {
      memory: {
        status: memoryPercent > 90 ? 'critical' : memoryPercent > 70 ? 'warning' : 'healthy',
        usage: `${memoryPercent.toFixed(1)}%`
      },
      cpu: {
        status: cpuUsage > 90 ? 'critical' : cpuUsage > 70 ? 'warning' : 'healthy',
        usage: `${cpuUsage}%`
      },
      agents: {
        status: this.metrics.activeAgents > 0 ? 'healthy' : 'warning',
        active: this.metrics.activeAgents
      },
      workflows: {
        status: 'healthy',
        active: this.metrics.activeWorkflows
      }
    };

    return health;
  }

  getDetailedMetrics() {
    return {
      ...this.metrics,
      health: this.getHealthStatus()
    };
  }

  // Middleware for Express to track requests
  requestTracker() {
    const self = this;
    return (req, res, next) => {
      self.incrementRequests();

      // Track errors
      const originalSend = res.send;
      res.send = function(data) {
        if (res.statusCode >= 400) {
          self.incrementErrors();
        }
        return originalSend.call(this, data);
      };

      next();
    };
  }
}

module.exports = new HealthMonitor();

// Add a graceful shutdown function for testing purposes
const _health = module.exports;
if (typeof _health.shutdown !== 'function') {
  _health.shutdown = async function() {
    try {
      if (this.metricsInterval) clearInterval(this.metricsInterval);
    } catch (e) {
      // ignore
    }
  };
}