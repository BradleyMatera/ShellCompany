module.exports = {
  // Server configuration
  port: process.env.PORT || 3001,

  // CORS configuration for production
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  },

  // Database configuration
  database: {
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },

  // AI Workers configuration
  aiWorkers: {
    refreshInterval: 30000, // 30 seconds
    healthCheckInterval: 60000, // 1 minute
    maxQueueDepth: 10
  },

  // Workflow orchestrator
  orchestrator: {
    maxConcurrentWorkflows: 5,
    workflowTimeout: 600000, // 10 minutes
    artifactRetention: 30 // days
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
    sessionSecret: process.env.SESSION_SECRET || 'fallback-session-secret',
    bcryptRounds: 12
  },

  // Monitoring
  monitoring: {
    enableMetrics: true,
    logLevel: process.env.LOG_LEVEL || 'info',
    heartbeatInterval: 30000
  },

  // Feature flags
  features: {
    autonomousExecution: true,
    realTimeUpdates: true,
    artifactDownload: true,
    agentEnvironments: true
  }
};