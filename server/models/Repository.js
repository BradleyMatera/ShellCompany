const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Repository = sequelize.define('Repository', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    provider: {
      type: DataTypes.ENUM('github', 'gitlab', 'bitbucket'),
      defaultValue: 'github'
    },
    owner: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    default_branch: {
      type: DataTypes.STRING,
      defaultValue: 'main'
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false
    },
    is_private: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'repositories'
  });

  return Repository;
};