const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Artifact = sequelize.define('Artifact', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.STRING, allowNull: false },
    path: { type: DataTypes.STRING, allowNull: false },
    sha256: { type: DataTypes.STRING, allowNull: false, unique: true },
    bytes: { type: DataTypes.INTEGER, allowNull: false },
    produced_by_task: { type: DataTypes.UUID, allowNull: true }
  }, {
    tableName: 'artifacts'
  });

  return Artifact;
};

