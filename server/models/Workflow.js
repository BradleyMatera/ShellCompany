const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Workflow = sequelize.define('Workflow', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    directive: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('planned', 'running', 'completed', 'failed', 'paused'),
      defaultValue: 'planned',
      allowNull: false
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    total_duration: {
      type: DataTypes.INTEGER, // milliseconds
      allowNull: true
    },
    tasks: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: []
    },
    estimates: {
      type: DataTypes.JSON,
      allowNull: true
    },
    progress: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        completed: 0,
        failed: 0,
        total: 0,
        percentage: 0
      }
    },
    artifacts: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    tableName: 'workflows',
    indexes: [
      {
        fields: ['status']
      },
      {
        fields: ['start_time']
      }
    ]
  });

  return Workflow;
};
