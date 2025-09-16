// Jest global teardown helper — standardized test teardown for server tests

// Attempt to require the app entrypoint and call app.shutdown() after all tests
// This file is included via `setupFilesAfterEnv` so its top-level code can register
// an `afterAll` handler that runs once per test environment.

afterAll(async () => {
  try {
    // Try to require the app module (when tests import server/index.js it exports the app)
    const app = require('../index');
    if (app && typeof app.shutdown === 'function') {
      // Some tests may call shutdown earlier; guard against double-calls
      await app.shutdown();
    }
  } catch (err) {
    // If app cannot be required or shutdown fails, log but don't fail tests here
    // Tests should still assert on behavior; shutdown is best-effort in teardown.
    // eslint-disable-next-line no-console
    console.warn('jest.teardown: app.shutdown() failed or app not present:', err && err.message);
  }
});
