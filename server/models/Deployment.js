const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Deployment = sequelize.define('Deployment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    environment_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    provider: {
      type: DataTypes.ENUM('vercel', 'netlify', 'render', 'aws'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'building', 'deploying', 'success', 'failed', 'cancelled'),
      defaultValue: 'pending'
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true
    },
    commit_sha: {
      type: DataTypes.STRING,
      allowNull: true
    },
    commit_message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    actor: {
      type: DataTypes.STRING,
      allowNull: false
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    finished_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    logs: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'deployments',
    indexes: [
      { fields: ['project_id'] },
      { fields: ['environment_id'] },
      { fields: ['status'] },
      { fields: ['started_at'] }
    ]
  });

  return Deployment;
};