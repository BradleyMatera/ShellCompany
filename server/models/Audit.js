const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Audit = sequelize.define('Audit', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    actor_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false
    },
    target: {
      type: DataTypes.STRING,
      allowNull: false
    },
    target_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    ip_address: {
      type: DataTypes.STRING,
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'audits',
    indexes: [
      { fields: ['actor_id'] },
      { fields: ['action'] },
      { fields: ['target'] },
      { fields: ['created_at'] }
    ]
  });

  return Audit;
};