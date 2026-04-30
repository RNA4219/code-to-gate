#!/usr/bin/env node
/**
 * Plugin Runner Script for Docker Container
 *
 * This script is the entrypoint for plugin execution in Docker containers.
 * It reads input from CTG_INPUT_FILE (or stdin), executes the plugin,
 * and writes output to CTG_OUTPUT_FILE (or stdout).
 *
 * Usage:
 *   node plugin-runner.js --plugin <path> [--input <file>] [--output <file>]
 *
 * Environment Variables:
 *   CTG_INPUT_FILE  - Path to input JSON file
 *   CTG_OUTPUT_FILE - Path to output JSON file
 *   CTG_PLUGIN_PATH - Path to plugin code (default: /plugin/code)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PLUGIN_MOUNT_PATH = process.env.CTG_PLUGIN_PATH || '/plugin/code';
const DEFAULT_INPUT_FILE = '/plugin/io/input.json';
const DEFAULT_OUTPUT_FILE = '/plugin/io/output.json';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    plugin: null,
    input: process.env.CTG_INPUT_FILE || DEFAULT_INPUT_FILE,
    output: process.env.CTG_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plugin' || args[i] === '-p') {
      options.plugin = args[++i];
    } else if (args[i] === '--input' || args[i] === '-i') {
      options.input = args[++i];
    } else if (args[i] === '--output' || args[i] === '-o') {
      options.output = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      options.help = true;
    } else if (!options.plugin && !args[i].startsWith('-')) {
      // First non-option argument is plugin path
      options.plugin = args[i];
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Plugin Runner for code-to-gate Docker Sandbox

Usage:
  node plugin-runner.js [options] <plugin-path>

Options:
  --plugin, -p <path>   Path to plugin code (default: /plugin/code)
  --input, -i <file>    Input JSON file (default: /plugin/io/input.json)
  --output, -o <file>   Output JSON file (default: /plugin/io/output.json)
  --help, -h            Show this help message

Environment Variables:
  CTG_INPUT_FILE        Path to input JSON file
  CTG_OUTPUT_FILE       Path to output JSON file
  CTG_PLUGIN_PATH       Path to plugin code

Example:
  node plugin-runner.js /plugin/code/index.js
`);
}

/**
 * Read input from file or stdin
 */
async function readInput(inputPath) {
  try {
    const content = fs.readFileSync(inputPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (inputPath === DEFAULT_INPUT_FILE && !fs.existsSync(inputPath)) {
      // Try reading from stdin
      return await readStdin();
    }
    throw new Error(`Failed to read input from ${inputPath}: ${error.message}`);
  }
}

/**
 * Read from stdin
 */
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error(`Failed to parse stdin JSON: ${error.message}`));
      }
    });
    process.stdin.on('error', reject);
  });
}

/**
 * Write output to file or stdout
 */
function writeOutput(outputPath, output) {
  const content = JSON.stringify(output);

  if (outputPath === '/dev/stdout' || outputPath === 'stdout') {
    console.log(content);
    return;
  }

  try {
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, content, 'utf-8');
  } catch (error) {
    // Fallback to stdout if file write fails
    console.log(content);
  }
}

/**
 * Load and execute plugin
 */
async function executePlugin(pluginPath, input) {
  // Resolve plugin path
  const resolvedPath = pluginPath.startsWith('/')
    ? pluginPath
    : path.join(PLUGIN_MOUNT_PATH, pluginPath);

  // Check if plugin exists
  if (!fs.existsSync(resolvedPath)) {
    // Try common variations
    const indexPath = path.join(resolvedPath, 'index.js');
    const mainPath = path.join(resolvedPath, 'main.js');

    if (fs.existsSync(indexPath)) {
      resolvedPath = indexPath;
    } else if (fs.existsSync(mainPath)) {
      resolvedPath = mainPath;
    } else {
      throw new Error(`Plugin not found at ${resolvedPath}`);
    }
  }

  // Load plugin module
  const pluginModule = require(resolvedPath);

  // Validate plugin structure
  if (!pluginModule.execute && typeof pluginModule !== 'function') {
    throw new Error('Plugin must export an execute function');
  }

  // Execute plugin
  const executeFn = typeof pluginModule === 'function'
    ? pluginModule
    : pluginModule.execute;

  const output = await executeFn(input);

  // Validate output version
  if (!output || !output.version) {
    throw new Error('Plugin output must include version field');
  }

  if (output.version !== 'ctg.plugin-output/v1') {
    throw new Error(`Invalid output version: ${output.version}`);
  }

  return output;
}

/**
 * Create error output
 */
function createErrorOutput(error) {
  return {
    version: 'ctg.plugin-output/v1',
    errors: [{
      code: 'PLUGIN_ERROR',
      message: error.message,
      details: {
        stack: error.stack,
      },
    }],
  };
}

/**
 * Main entrypoint
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Resolve plugin path
  const pluginPath = options.plugin || PLUGIN_MOUNT_PATH;

  try {
    // Read input
    const input = await readInput(options.input);

    // Execute plugin
    const output = await executePlugin(pluginPath, input);

    // Write output
    writeOutput(options.output, output);

    process.exit(0);
  } catch (error) {
    // Write error output
    const errorOutput = createErrorOutput(error);
    writeOutput(options.output, errorOutput);

    // Log error to stderr
    console.error(`Plugin execution failed: ${error.message}`);

    process.exit(1);
  }
}

// Run main
main();