/**
 * Docker Templates
 * Dockerfile and plugin runner script templates for sandbox execution
 */

/**
 * Generate Dockerfile for minimal Node.js plugin runner
 */
export function generateDockerfile(): string {
  return `# Minimal Node.js plugin runner for code-to-gate
FROM node:20-alpine

# Create non-root user for security
RUN addgroup -S plugin && adduser -S node -G plugin

# Set working directory
WORKDIR /plugin/work

# Copy plugin runner script
COPY plugin-runner.js /usr/local/bin/plugin-runner.js

# Set permissions
RUN chmod 755 /usr/local/bin/plugin-runner.js

# Switch to non-root user
USER node

# Default entrypoint
ENTRYPOINT ["node", "/usr/local/bin/plugin-runner.js"]
`;
}

/**
 * Generate plugin runner script for container
 */
export function generatePluginRunnerScript(): string {
  return `#!/usr/bin/env node
/**
 * Plugin Runner Script for Docker Container
 * Reads input from CTG_INPUT_FILE, executes plugin, writes output to CTG_OUTPUT_FILE
 */

const fs = require('fs');
const path = require('path');

async function run() {
  const inputFile = process.env.CTG_INPUT_FILE || '/plugin/io/input.json';
  const outputFile = process.env.CTG_OUTPUT_FILE || '/plugin/io/output.json';

  try {
    // Read input
    const input = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

    // Execute plugin (plugin code is mounted at /plugin/code)
    const pluginScript = process.argv[2] || '/plugin/code/index.js';
    const pluginModule = require(pluginScript);

    // Call plugin execute function
    const output = await pluginModule.execute(input);

    // Write output
    fs.writeFileSync(outputFile, JSON.stringify(output), 'utf-8');

    process.exit(0);
  } catch (error) {
    console.error('Plugin execution failed:', error.message);
    process.exit(1);
  }
}

run();
`;
}