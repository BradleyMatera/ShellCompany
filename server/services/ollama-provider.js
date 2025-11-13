// Ollama Provider Service
// Integrates with Ollama (local or cloud) for agent execution

const axios = require('axios');

// Example config: update endpoint for local/cloud
const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';
const OLLAMA_TAGS_ENDPOINT = process.env.OLLAMA_TAGS_ENDPOINT || 'http://localhost:11434/api/tags';
/**
 * Get available models from Ollama
 * @returns {Promise<string[]>} Array of model names
 */
async function getModels() {
  try {
    const response = await axios.get(OLLAMA_TAGS_ENDPOINT);
    if (Array.isArray(response.data.models)) {
      return response.data.models.map(m => m.name);
    }
    return [];
  } catch (err) {
    return [];
  }
}

/**
 * Execute an agent directive using Ollama
 * @param {string} agentId
 * @param {string} directive
 * @param {string} modelName
 * @param {object} [options]
 * @returns {Promise<object>} Ollama response
 */
async function execute(agentId, directive, modelName, options = {}) {
  // Compose Ollama request
  const payload = {
    model: modelName || 'llama3',
    prompt: directive,
    ...options,
  };
  try {
    const response = await axios.post(OLLAMA_ENDPOINT, payload);
    return response.data;
  } catch (err) {
    return { error: err.message, details: err.response?.data };
  }
}

module.exports = {
  execute,
  getModels,
};
