/**
 * Comprehensive initial migration that creates tables to match the current
 * Sequelize model definitions under server/models.
 */
const { DataTypes, literal } = require('sequelize');

module.exports = {
  up: async ({ context: queryInterface }) => {
    // helpers to make migration idempotent in dev environments where partial
    // runs may have created tables or indexes. These will ignore errors that
    // indicate the object already exists.
    const isProd = process.env.NODE_ENV === 'production';

    const safeCreateTable = async (name, def) => {
      try {
        await queryInterface.createTable(name, def);
      } catch (err) {
        if (!isProd && err && err.message && err.message.includes('already exists')) {
          console.warn(`⚠️  createTable skipped; ${name} already exists.`);
        } else {
          throw err;
        }
      }
    };

    const safeAddIndex = async (tableName, fields, options) => {
      try {
        await queryInterface.addIndex(tableName, fields, options || {});
      } catch (err) {
        if (!isProd && err && err.message && err.message.includes('already exists')) {
          console.warn(`⚠️  addIndex skipped; index on ${tableName}(${fields}) already exists.`);
        } else {
          throw err;
        }
      }
    };
    // USERS
  await safeCreateTable('users', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      name: { type: DataTypes.STRING, allowNull: false },
      avatar_url: { type: DataTypes.STRING },
      role: { type: DataTypes.ENUM('owner','admin','contributor','viewer'), allowNull: false, defaultValue: 'viewer' },
      password_hash: { type: DataTypes.STRING },
      github_id: { type: DataTypes.STRING, unique: true },
      google_id: { type: DataTypes.STRING, unique: true },
      last_login_at: { type: DataTypes.DATE },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      settings: { type: DataTypes.JSON, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

    // AGENTS
  await safeCreateTable('agents', {
      id: { type: DataTypes.STRING, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      title: { type: DataTypes.STRING, allowNull: false },
      department: { type: DataTypes.STRING, allowNull: false },
      avatar: { type: DataTypes.STRING, allowNull: false },
      specialization: { type: DataTypes.TEXT, allowNull: false },
      tools: { type: DataTypes.JSON, allowNull: false },
      skills: { type: DataTypes.JSON, allowNull: false },
      preferred_model: { type: DataTypes.STRING, allowNull: false },
      max_cost_per_task: { type: DataTypes.DECIMAL(10,2), allowNull: false },
      status: { type: DataTypes.ENUM('idle','busy','offline'), defaultValue: 'idle' },
      system_prompt: { type: DataTypes.TEXT, allowNull: false },
      tasks_completed: { type: DataTypes.INTEGER, defaultValue: 0 },
      total_cost: { type: DataTypes.DECIMAL(10,2), defaultValue: 0.00 },
      success_rate: { type: DataTypes.DECIMAL(5,2), defaultValue: 100.00 },
      average_duration: { type: DataTypes.INTEGER, defaultValue: 0 },
  last_active: { type: DataTypes.DATE, defaultValue: literal('CURRENT_TIMESTAMP') },
      credentials: { type: DataTypes.JSON },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

    // WORKERS
  await safeCreateTable('workers', {
      id: { type: DataTypes.STRING, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      role: { type: DataTypes.STRING },
      status: { type: DataTypes.STRING, defaultValue: 'offline' },
      pid: { type: DataTypes.INTEGER },
      cwd: { type: DataTypes.STRING },
      last_heartbeat: { type: DataTypes.DATE },
      last_heartbeat_seq: { type: DataTypes.INTEGER, defaultValue: 0 },
      current_command: { type: DataTypes.STRING },
      queue_depth: { type: DataTypes.INTEGER, defaultValue: 0 },
      tools: { type: DataTypes.JSON, defaultValue: [] },
      env_masked: { type: DataTypes.JSON, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

    // PROJECTS
  await safeCreateTable('projects', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT },
      owner_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      status: { type: DataTypes.ENUM('active','archived','deleted'), defaultValue: 'active' },
      settings: { type: DataTypes.JSON, defaultValue: {} },
      file_system_path: { type: DataTypes.STRING },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

  await safeAddIndex('projects', ['owner_id']);
  await safeAddIndex('projects', ['status']);
  await safeAddIndex('projects', ['name']);

    // ENVIRONMENTS
  await safeCreateTable('environments', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
      name: { type: DataTypes.ENUM('development','staging','production'), allowNull: false },
      url: { type: DataTypes.STRING },
      status: { type: DataTypes.ENUM('healthy','deploying','error','stopped'), defaultValue: 'stopped' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

  await safeAddIndex('environments', ['project_id']);
  // unique index on (project_id, name)
  await safeAddIndex('environments', ['project_id','name'], { unique: true });

    // ENV_VARS
  await safeCreateTable('env_vars', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      environment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'environments', key: 'id' } },
      key: { type: DataTypes.STRING, allowNull: false },
      value_encrypted: { type: DataTypes.TEXT, allowNull: false },
      last_pushed_at: { type: DataTypes.DATE },
      providers_pushed: { type: DataTypes.JSON, defaultValue: [] },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

  await safeAddIndex('env_vars', ['environment_id']);
  await safeAddIndex('env_vars', ['environment_id','key'], { unique: true });

    // CONNECTIONS
  await safeCreateTable('connections', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      provider: { type: DataTypes.ENUM('github','google','vercel','netlify','render','aws','openai','gemini','claude'), allowNull: false },
      account_id: { type: DataTypes.STRING },
      team_id: { type: DataTypes.STRING },
      token_encrypted: { type: DataTypes.TEXT, allowNull: false },
      refresh_token_encrypted: { type: DataTypes.TEXT },
      scopes: { type: DataTypes.JSON, defaultValue: [] },
      expires_at: { type: DataTypes.DATE },
      last_checked_at: { type: DataTypes.DATE },
      status: { type: DataTypes.ENUM('active','expired','revoked','error'), defaultValue: 'active' },
      metadata: { type: DataTypes.JSON, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

  await safeAddIndex('connections', ['user_id']);
  await safeAddIndex('connections', ['provider']);
  await safeAddIndex('connections', ['user_id','provider'], { unique: true });
  await safeAddIndex('connections', ['expires_at']);
  await safeAddIndex('connections', ['status']);

    // REPOSITORIES
  await safeCreateTable('repositories', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      project_id: { type: DataTypes.UUID, allowNull: false },
      provider: { type: DataTypes.ENUM('github','gitlab','bitbucket'), defaultValue: 'github' },
      owner: { type: DataTypes.STRING, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      default_branch: { type: DataTypes.STRING, defaultValue: 'main' },
      url: { type: DataTypes.STRING, allowNull: false },
      is_private: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

    // DEPLOYMENTS
  await safeCreateTable('deployments', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      project_id: { type: DataTypes.UUID, allowNull: false },
      environment_id: { type: DataTypes.UUID, allowNull: false },
      provider: { type: DataTypes.ENUM('vercel','netlify','render','aws'), allowNull: false },
      status: { type: DataTypes.ENUM('pending','building','deploying','success','failed','cancelled'), defaultValue: 'pending' },
      url: { type: DataTypes.STRING },
      commit_sha: { type: DataTypes.STRING },
      commit_message: { type: DataTypes.TEXT },
      actor: { type: DataTypes.STRING, allowNull: false },
      started_at: { type: DataTypes.DATE },
      finished_at: { type: DataTypes.DATE },
      logs: { type: DataTypes.TEXT },
      metadata: { type: DataTypes.JSON, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

  await safeAddIndex('deployments', ['project_id']);
  await safeAddIndex('deployments', ['environment_id']);
  await safeAddIndex('deployments', ['status']);
  await safeAddIndex('deployments', ['started_at']);

    // WORKFLOW
  await safeCreateTable('workflows', {
      id: { type: DataTypes.STRING, primaryKey: true },
      directive: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.ENUM('planned','running','completed','failed','paused'), allowNull: false, defaultValue: 'planned' },
      start_time: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      end_time: { type: DataTypes.DATE },
      total_duration: { type: DataTypes.INTEGER },
      tasks: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      estimates: { type: DataTypes.JSON },
      progress: { type: DataTypes.JSON, allowNull: false, defaultValue: { completed: 0, failed: 0, total: 0, percentage: 0 } },
      artifacts: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
      metadata: { type: DataTypes.JSON },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

  await safeAddIndex('workflows', ['status']);
  await safeAddIndex('workflows', ['start_time']);

    // TASKS
  await safeCreateTable('tasks', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      agent_id: { type: DataTypes.STRING, allowNull: false },
      user_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
      project_id: { type: DataTypes.STRING },
      prompt: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.ENUM('pending','running','completed','failed'), defaultValue: 'pending' },
      priority: { type: DataTypes.ENUM('low','medium','high','urgent'), defaultValue: 'medium' },
      result: { type: DataTypes.TEXT },
      error_message: { type: DataTypes.TEXT },
      cost: { type: DataTypes.DECIMAL(10,4), defaultValue: 0.0000 },
      duration: { type: DataTypes.INTEGER },
      workflow_id: { type: DataTypes.STRING },
      started_at: { type: DataTypes.DATE },
      completed_at: { type: DataTypes.DATE },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

    // RUNS
  await safeCreateTable('runs', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      task_id: { type: DataTypes.UUID },
      project_id: { type: DataTypes.STRING, allowNull: false },
      provider: { type: DataTypes.STRING, allowNull: false },
      job_id: { type: DataTypes.STRING },
      url: { type: DataTypes.STRING },
      status: { type: DataTypes.STRING, defaultValue: 'pending' },
      started_at: { type: DataTypes.DATE },
      finished_at: { type: DataTypes.DATE },
      meta_json: { type: DataTypes.JSON, defaultValue: {} },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

    // ARTIFACTS
  await safeCreateTable('artifacts', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      project_id: { type: DataTypes.STRING, allowNull: false },
      path: { type: DataTypes.STRING, allowNull: false },
      sha256: { type: DataTypes.STRING, allowNull: false, unique: true },
      bytes: { type: DataTypes.INTEGER, allowNull: false },
      produced_by_task: { type: DataTypes.UUID },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

    // AUDITS
  await safeCreateTable('audits', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      actor_id: { type: DataTypes.UUID, allowNull: false },
      action: { type: DataTypes.STRING, allowNull: false },
      target: { type: DataTypes.STRING, allowNull: false },
      target_id: { type: DataTypes.STRING },
      metadata: { type: DataTypes.JSON, defaultValue: {} },
      ip_address: { type: DataTypes.STRING },
      user_agent: { type: DataTypes.TEXT },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: literal('CURRENT_TIMESTAMP') }
    });

  await safeAddIndex('audits', ['actor_id']);
  await safeAddIndex('audits', ['action']);
  await safeAddIndex('audits', ['target']);
  await safeAddIndex('audits', ['created_at']);
  },

  down: async ({ context: queryInterface }) => {
    // Drop in reverse order of creation
    await queryInterface.dropTable('audits');
    await queryInterface.dropTable('artifacts');
    await queryInterface.dropTable('runs');
    await queryInterface.dropTable('tasks');
    await queryInterface.dropTable('workflows');
    await queryInterface.dropTable('deployments');
    await queryInterface.dropTable('repositories');
    await queryInterface.dropTable('connections');
    await queryInterface.dropTable('env_vars');
    await queryInterface.dropTable('environments');
    await queryInterface.dropTable('projects');
    await queryInterface.dropTable('workers');
    await queryInterface.dropTable('agents');
    await queryInterface.dropTable('users');
  }
};
