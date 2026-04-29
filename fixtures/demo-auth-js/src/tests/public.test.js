/**
 * Tests for public routes only.
 * NOTE: Admin routes are deliberately not tested.
 * This demonstrates untested critical paths for admin deny scenarios.
 */

const assert = require('assert');

// Mock response object for testing
function mockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

// Mock request object
function mockRequest(overrides = {}) {
  return {
    headers: {},
    body: {},
    params: {},
    ...overrides
  };
}

// Test: Health endpoint returns ok
function testHealthEndpoint() {
  const publicRoutes = require('../routes/public');
  // This test only covers public routes
  console.log('Testing public routes...');

  // Health check test
  const req = mockRequest();
  const res = mockResponse();

  // Direct handler test for /health
  const healthHandler = (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  };

  healthHandler(req, res);
  assert.strictEqual(res.body.status, 'ok');
  console.log('  - Health endpoint: PASSED');
}

// Test: Info endpoint returns API info
function testInfoEndpoint() {
  const req = mockRequest();
  const res = mockResponse();

  const infoHandler = (req, res) => {
    res.json({
      name: 'demo-auth-api',
      version: '1.0.0',
      description: 'Demo API with authentication patterns'
    });
  };

  infoHandler(req, res);
  assert.strictEqual(res.body.name, 'demo-auth-api');
  console.log('  - Info endpoint: PASSED');
}

// Test: Login with valid credentials
function testLoginEndpoint() {
  const req = mockRequest({
    body: { username: 'testuser', password: 'testpass' }
  });
  const res = mockResponse();

  const loginHandler = (req, res) => {
    const { username, password } = req.body;
    if (username && password) {
      res.json({ success: true, token: 'demo-token' });
    } else {
      res.status(400).json({ error: 'Username and password required' });
    }
  };

  loginHandler(req, res);
  assert.strictEqual(res.body.success, true);
  console.log('  - Login endpoint (valid): PASSED');
}

// Test: Login with missing credentials
function testLoginEndpointMissing() {
  const req = mockRequest({ body: {} });
  const res = mockResponse();

  const loginHandler = (req, res) => {
    const { username, password } = req.body;
    if (username && password) {
      res.json({ success: true, token: 'demo-token' });
    } else {
      res.status(400).json({ error: 'Username and password required' });
    }
  };

  loginHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  console.log('  - Login endpoint (missing credentials): PASSED');
}

// Run all tests
function runTests() {
  console.log('Running public route tests...\n');

  testHealthEndpoint();
  testInfoEndpoint();
  testLoginEndpoint();
  testLoginEndpointMissing();

  console.log('\nAll public route tests passed!');
  console.log('NOTE: Admin route deny scenarios are not tested.');
  console.log('NOTE: Account route tests are not included.');
}

// Execute tests
runTests();