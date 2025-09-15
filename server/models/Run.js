const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Run = sequelize.define('Run', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    task_id: { type: DataTypes.UUID, allowNull: true },
    project_id: { type: DataTypes.STRING, allowNull: false },
    provider: { type: DataTypes.STRING, allowNull: false },
    job_id: { type: DataTypes.STRING },
    url: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING, defaultValue: 'pending' },
    started_at: { type: DataTypes.DATE },
    finished_at: { type: DataTypes.DATE },
    meta_json: { type: DataTypes.JSON, defaultValue: {} }
  }, {
    tableName: 'runs'
  });

  return Run;
};

