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

    // Sync all models
    // NOTE: In development we previously used `alter: true` to try to migrate schema in-place.
    // That can cause destructive ALTER/DROP operations that fail when foreign key constraints
    // exist (SQLite will error with SQLITE_CONSTRAINT). For production readiness we should
    // avoid `alter: true` at runtime and instead run explicit migrations. Here we attempt a
    // best-effort `alter` in development, but fall back to a safe `sync()` if it fails.
    try {
      if (process.env.NODE_ENV === 'development') {
        await sequelize.sync({ alter: true });
        console.log('✅ Database models synchronized (alter).');
      } else {
        // In non-development environments, do a non-altering sync to avoid runtime schema changes
        await sequelize.sync();
        console.log('✅ Database models synchronized (safe sync).');
      }
    } catch (err) {
      console.warn('⚠️  Model sync with alter failed:', err.message);
      console.warn('⚠️  Falling back to safe sequelize.sync() to avoid destructive schema changes.');
      await sequelize.sync();
      console.log('✅ Database models synchronized (fallback safe sync).');
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
