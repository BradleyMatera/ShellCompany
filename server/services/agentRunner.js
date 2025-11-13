// server/services/agentRunner.js
const { spawn } = require('child_process');
const { Log } = require('../models');

async function runAgent(agent, directive) {
  // Example: spawn a Node.js script for the agent
  const proc = spawn('node', [agent.workspacePath + '/agent.js', JSON.stringify(directive)]);

  proc.stdout.on('data', async (data) => {
    await Log.create({
      agentId: agent.id,
      directiveId: directive.id,
      message: data.toString(),
    });
    // TODO: emit log to WebSocket
  });

  proc.stderr.on('data', async (data) => {
    await Log.create({
      agentId: agent.id,
      directiveId: directive.id,
      message: '[ERROR] ' + data.toString(),
    });
    // TODO: emit log to WebSocket
  });

  proc.on('close', (code) => {
    // TODO: update directive status
    console.log(`Agent process exited with code ${code}`);
  });
}

module.exports = { runAgent };
