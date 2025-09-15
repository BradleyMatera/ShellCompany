const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Agent = sequelize.define('Agent', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    department: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    specialization: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tools: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    skills: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    preferred_model: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    max_cost_per_task: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('idle', 'busy', 'offline'),
      defaultValue: 'idle',
    },
    system_prompt: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tasks_completed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    total_cost: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
    },
    success_rate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 100.00,
    },
    average_duration: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    last_active: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    credentials: {
      // Optional per-agent provider keys: { openai: 'sk-...', claude: '...', gemini: '...' }
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    timestamps: true,
    underscored: true,
  });

  return Agent;
};
