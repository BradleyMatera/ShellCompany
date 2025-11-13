// server/app-mvp.js
const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./models');
const mvpApi = require('./routes/mvp-api');
const { runAgent } = require('./services/agentRunner');

const app = express();
app.use(bodyParser.json());
app.use('/api', mvpApi);

// Example endpoint to execute agent
app.post('/api/agents/:id/execute', async (req, res) => {
  const { Agent, Directive } = require('./models');
  const agent = await Agent.findByPk(req.params.id);
  const directive = await Directive.findByPk(req.body.directiveId);
  if (!agent || !directive) return res.status(404).send('Agent or directive not found');
  runAgent(agent, directive);
  res.json({ status: 'started' });
});

// TODO: Add WebSocket server for real-time logs

const PORT = process.env.PORT || 3001;
sequelize.sync().then(() => {
  app.listen(PORT, () => {
    console.log(`MVP API server running on port ${PORT}`);
  });
});
