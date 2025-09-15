// WebSocket broadcast function - will be set during initialization
let broadcastFunction = null;

// Set broadcast function from server initialization
function setBroadcastFunction(broadcastFn) {
  broadcastFunction = broadcastFn;
}

// Console log buffer for history
const LOG_BUFFER_SIZE = 1000;
const logBuffer = [];

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

// Enhanced log function that captures and broadcasts
function captureAndBroadcast(level, args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');

  const logEntry = {
    id: Math.random().toString(36).substr(2, 9),
    timestamp,
    level,
    message,
    source: 'server'
  };

  // Add to buffer
  logBuffer.push(logEntry);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }

  // Broadcast to WebSocket clients
  try {
    if (broadcastFunction) {
      broadcastFunction({
        type: 'console_log',
        data: logEntry
      });
    }
  } catch (error) {
    // Fail silently to avoid recursion
  }

  // Call original console method
  originalConsole[level].apply(console, args);
}

// Override console methods
console.log = (...args) => captureAndBroadcast('log', args);
console.error = (...args) => captureAndBroadcast('error', args);
console.warn = (...args) => captureAndBroadcast('warn', args);
console.info = (...args) => captureAndBroadcast('info', args);

// Capture stdout and stderr
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

process.stdout.write = function(chunk, encoding, fd) {
  if (typeof chunk === 'string' && chunk.trim()) {
    const logEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      level: 'stdout',
      message: chunk.toString().trim(),
      source: 'stdout'
    };

    logBuffer.push(logEntry);
    if (logBuffer.length > LOG_BUFFER_SIZE) {
      logBuffer.shift();
    }

    try {
      if (broadcastFunction) {
        broadcastFunction({
          type: 'console_log',
          data: logEntry
        });
      }
    } catch (error) {
      // Fail silently
    }
  }

  return originalStdoutWrite.apply(process.stdout, arguments);
};

process.stderr.write = function(chunk, encoding, fd) {
  if (typeof chunk === 'string' && chunk.trim()) {
    const logEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      level: 'stderr',
      message: chunk.toString().trim(),
      source: 'stderr'
    };

    logBuffer.push(logEntry);
    if (logBuffer.length > LOG_BUFFER_SIZE) {
      logBuffer.shift();
    }

    try {
      if (broadcastFunction) {
        broadcastFunction({
          type: 'console_log',
          data: logEntry
        });
      }
    } catch (error) {
      // Fail silently
    }
  }

  return originalStderrWrite.apply(process.stderr, arguments);
};

// Export functions
module.exports = {
  getLogBuffer: () => [...logBuffer],
  addLogEntry: (entry) => {
    logBuffer.push(entry);
    if (logBuffer.length > LOG_BUFFER_SIZE) {
      logBuffer.shift();
    }
    try {
      if (broadcastFunction) {
        broadcastFunction({
          type: 'console_log',
          data: entry
        });
      }
    } catch (error) {
      // Fail silently
    }
  },
  setBroadcastFunction
};
