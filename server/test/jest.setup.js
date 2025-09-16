// Jest global setup for server tests
// Mock uuid.v4 to avoid ESM parsing issues from uuid package in some Node/Jest setups
jest.mock('uuid', () => ({
  v4: () => `test-uuid-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
}));

// Ensure tests run in test env
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Increase default timeout if needed for CI flaky machine
jest.setTimeout(30000);
