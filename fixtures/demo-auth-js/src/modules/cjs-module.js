/**
 * CommonJS module patterns for testing.
 */

// CommonJS require statements
const path = require('path');
const fs = require('fs');
const util = require('util');

// Destructured require
const { readFile, writeFile } = fs.promises;

// Named function exports
function readConfig(configPath) {
  const fullPath = path.resolve(configPath);
  return readFile(fullPath, 'utf8').then(JSON.parse);
}

function writeConfig(configPath, config) {
  const fullPath = path.resolve(configPath);
  return writeFile(fullPath, JSON.stringify(config, null, 2));
}

function mergeConfig(base, override) {
  return { ...base, ...override };
}

// Async function export
async function loadConfigAsync(configPath) {
  try {
    const content = await readFile(configPath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Failed to load config: ${err.message}`);
    return {};
  }
}

// Arrow function exports
const validateConfig = (config) => {
  return config && typeof config === 'object';
};

const getDefaultConfig = () => ({
  port: 3000,
  host: 'localhost',
  debug: false
});

// Class export
class ConfigManager {
  constructor(initialConfig = {}) {
    this.config = initialConfig;
  }

  get(key) {
    return this.config[key];
  }

  set(key, value) {
    this.config[key] = value;
    return this;
  }

  async load(path) {
    this.config = await loadConfigAsync(path);
    return this;
  }

  save(path) {
    return writeConfig(path, this.config);
  }

  validate() {
    return validateConfig(this.config);
  }
}

// Generator function export
function* configKeys(config) {
  for (const key of Object.keys(config)) {
    yield key;
  }
}

// Multiple export patterns
module.exports = {
  readConfig,
  writeConfig,
  mergeConfig,
  loadConfigAsync,
  validateConfig,
  getDefaultConfig,
  ConfigManager,
  configKeys
};

// Also export individual functions
module.exports.readConfig = readConfig;
module.exports.writeConfig = writeConfig;