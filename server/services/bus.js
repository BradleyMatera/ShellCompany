const { EventEmitter } = require('events');

// Simple process-local event bus used to bridge services and WebSocket broadcasting
const bus = new EventEmitter();

module.exports = bus;

