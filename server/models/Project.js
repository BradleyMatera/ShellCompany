const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Project = sequelize.define('Project', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    owner_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('active', 'archived', 'deleted'),
      defaultValue: 'active'
    },
    settings: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    file_system_path: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    tableName: 'projects',
    indexes: [
      { fields: ['owner_id'] },
      { fields: ['status'] },
      { fields: ['name'] }
    ]
  });

  return Project;
};