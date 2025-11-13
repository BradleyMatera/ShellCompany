// server/models/agent.js
module.exports = (sequelize, DataTypes) => {
  const Agent = sequelize.define('Agent', {
    name: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING, defaultValue: 'idle' },
    workspacePath: { type: DataTypes.STRING },
  });
  return Agent;
};

// server/models/directive.js
module.exports = (sequelize, DataTypes) => {
  const Directive = sequelize.define('Directive', {
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING, defaultValue: 'pending' },
    assignedAgentId: { type: DataTypes.INTEGER },
  });
  return Directive;
};

// server/models/project.js
module.exports = (sequelize, DataTypes) => {
  const Project = sequelize.define('Project', {
    name: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'active' },
  });
  return Project;
};

// server/models/log.js
module.exports = (sequelize, DataTypes) => {
  const Log = sequelize.define('Log', {
    agentId: { type: DataTypes.INTEGER },
    directiveId: { type: DataTypes.INTEGER },
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    message: { type: DataTypes.TEXT },
  });
  return Log;
};
