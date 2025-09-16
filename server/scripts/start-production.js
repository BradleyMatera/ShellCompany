#!/usr/bin/env node

const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  console.log(`🚀 ShellCompany Production Server`);
  console.log(`📦 Master ${process.pid} is running`);
  console.log(`⚡ Starting ${numCPUs} workers...`);

  // Run migrations before forking workers. If migrations fail we should not
  // start worker processes.
  (async () => {
    try {
      const { runMigrations } = require('../migration-runner');
      await runMigrations();
      console.log('✅ Migrations applied, forking workers');

      // Fork workers
      for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
      }
    } catch (err) {
      console.error('❌ Failed to apply migrations during production start:', err && err.stack || err);
      process.exit(1);
    }
  })();

  cluster.on('exit', (worker, code, signal) => {
    console.log(`💥 Worker ${worker.process.pid} died`);
    console.log('🔄 Starting a new worker...');
    cluster.fork();
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
  });

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    process.exit(0);
  });

} else {
  // Worker process
  process.env.NODE_ENV = 'production';
  // Ensure migrations are applied before starting the app in production.
  // We run migrations from the master process below before forking; for
  // additional safety we also attempt to run here if invoked directly.
  const { runMigrations } = require('../migration-runner');

  runMigrations().then(() => {
    require('../index.js');
    console.log(`👷 Worker ${process.pid} started`);
  }).catch(err => {
    console.error('❌ Worker failed to run migrations:', err && err.stack || err);
    process.exit(1);
  });
}