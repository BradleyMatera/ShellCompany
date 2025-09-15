const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Worker = sequelize.define('Worker', {
    id: { type: DataTypes.STRING, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING, defaultValue: 'offline' },
    pid: { type: DataTypes.INTEGER, allowNull: true },
    cwd: { type: DataTypes.STRING },
    last_heartbeat: { type: DataTypes.DATE },
    last_heartbeat_seq: { type: DataTypes.INTEGER, defaultValue: 0 },
    current_command: { type: DataTypes.STRING },
    queue_depth: { type: DataTypes.INTEGER, defaultValue: 0 },
    tools: { type: DataTypes.JSON, defaultValue: [] },
    env_masked: { type: DataTypes.JSON, defaultValue: {} }
  }, {
    tableName: 'workers'
  });

  return Worker;
};

