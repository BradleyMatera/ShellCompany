// Background DB initialization helper. Runs in a separate Node process to avoid
// blocking the main HTTP server event loop during synchronous or native
// initialization steps (such as sqlite schema checks).
require('dotenv').config();
const path = require('path');
const { initializeDatabase } = require('./models');

(async () => {
  try {
    console.log('🔧 DB init child: starting database initialization');
    await initializeDatabase();
    console.log('🔧 DB init child: database initialization complete');
    process.exit(0);
  } catch (err) {
    console.error('🔧 DB init child: failed to initialize database:', err && err.stack || err);
    // keep process alive a short time so logs flush, then exit non-zero
    setTimeout(() => process.exit(1), 1000);
  }
})();
