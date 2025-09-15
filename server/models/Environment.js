const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Environment = sequelize.define('Environment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'projects',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.ENUM('development', 'staging', 'production'),
      allowNull: false
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('healthy', 'deploying', 'error', 'stopped'),
      defaultValue: 'stopped'
    }
  }, {
    tableName: 'environments',
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'name'], unique: true }
    ]
  });

  return Environment;
};