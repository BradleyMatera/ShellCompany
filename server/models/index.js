const { Sequelize } = require('sequelize');
const path = require('path');

// Initialize Sequelize with SQLite for development
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../shellcompany.db'),
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  define: {
    timestamps: true,
    underscored: true,
  }
});

// Import models
const User = require('./User')(sequelize);
const Project = require('./Project')(sequelize);
const Connection = require('./Connection')(sequelize);
const Environment = require('./Environment')(sequelize);
const EnvVar = require('./EnvVar')(sequelize);
const Repository = require('./Repository')(sequelize);
const Deployment = require('./Deployment')(sequelize);
const Audit = require('./Audit')(sequelize);
const Agent = require('./Agent')(sequelize);
const Task = require('./Task')(sequelize);
const Worker = require('./Worker')(sequelize);
const Run = require('./Run')(sequelize);
const Artifact = require('./Artifact')(sequelize);
const Workflow = require('./Workflow')(sequelize);

// Define associations
User.hasMany(Project, { foreignKey: 'owner_id' });
Project.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });

User.hasMany(Connection, { foreignKey: 'user_id' });
Connection.belongsTo(User, { foreignKey: 'user_id' });

Project.hasMany(Environment, { foreignKey: 'project_id' });
Environment.belongsTo(Project, { foreignKey: 'project_id' });

Environment.hasMany(EnvVar, { foreignKey: 'environment_id' });
EnvVar.belongsTo(Environment, { foreignKey: 'environment_id' });

Project.hasMany(Repository, { foreignKey: 'project_id' });
Repository.belongsTo(Project, { foreignKey: 'project_id' });

Project.hasMany(Deployment, { foreignKey: 'project_id' });
Deployment.belongsTo(Project, { foreignKey: 'project_id' });

Environment.hasMany(Deployment, { foreignKey: 'environment_id' });
Deployment.belongsTo(Environment, { foreignKey: 'environment_id' });

User.hasMany(Audit, { foreignKey: 'actor_id' });
Audit.belongsTo(User, { foreignKey: 'actor_id', as: 'actor' });

// Agent and Task associations
User.hasMany(Task, { foreignKey: 'user_id' });
Task.belongsTo(User, { foreignKey: 'user_id' });

Agent.hasMany(Task, { foreignKey: 'agent_id' });
Task.belongsTo(Agent, { foreignKey: 'agent_id' });

// Runs and Artifacts associations
Project.hasMany(Run, { foreignKey: 'project_id' });
Run.belongsTo(Project, { foreignKey: 'project_id' });

Project.hasMany(Artifact, { foreignKey: 'project_id' });
Artifact.belongsTo(Project, { foreignKey: 'project_id' });

// Initialize database function
async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Sync models / migrations handling
    // For production deployments we require explicit migrations to be run prior to start.
    // This avoids dangerous runtime schema modifications. For local development and tests
    // we allow a safe `sequelize.sync()` to create missing tables, but we no longer
    // attempt `alter: true`.
    if (process.env.NODE_ENV === 'production') {
      console.log('ℹ️  Production environment detected. Please run migrations before starting the app.');
    } else {
      try {
        await sequelize.sync();
        console.log('✅ Database models synchronized (safe sync for non-production).');
      } catch (err) {
        console.warn('⚠️  sequelize.sync() failed:', err.message);
        console.warn('⚠️  You may need to run migrations or inspect the database.');
      }
    }

    // Create default user for autonomous agents
    await User.findOrCreate({
      where: { id: 1 },
      defaults: {
        email: 'system@shellcompany.ai',
        name: 'System User',
        role: 'admin',
        is_active: true
      }
    });
    console.log('✅ Default user ensured.');

    return sequelize;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  User,
  Project,
  Connection,
  Environment,
  EnvVar,
  Repository,
  Deployment,
  Audit,
  Agent,
  Task,
  Worker,
  Run,
  Artifact,
  Workflow,
  initializeDatabase
};
