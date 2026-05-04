/**
 * Configuration file loader
 * Based on docs/product-spec-v1.md section 4.1
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CtgConfig, SupportedLanguage } from "./config-schema.js";
import {
  CONFIG_VERSION,
  createDefaultConfig,
  isValidConfigVersion,
  isValidLanguage,
  isValidParserAdapter,
  isValidLlmMode,
  isValidLlmProvider,
  DEFAULT_PARSER_CONFIG,
  DEFAULT_LLM_CONFIG,
  DEFAULT_OUTPUT_CONFIG,
} from "./config-schema.js";

/**
 * Config file locations with priority order
 */
export const CONFIG_LOCATIONS = [
  "ctg.config.yaml", // repo root (priority 2)
  "ctg.config.json", // repo root (priority 3)
];

/**
 * Global config location (lowest priority)
 */
export const GLOBAL_CONFIG_LOCATION = ".ctg/config.yaml";

/**
 * Parse YAML configuration file
 * Simple parser for basic config structure
 */
function parseYamlConfig(content: string): Partial<CtgConfig> {
  const result: Partial<CtgConfig> = {};
  const lines = content.split("\n");

  let currentSection: string | null = null;
  let currentSubSection: string | null = null;
  let currentArray: string[] | null = null;
  let currentPluginIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Detect section changes based on indentation
    const indent = line.length - line.trimStart().length;

    // Root level key: value
    if (indent === 0 && trimmed.includes(":")) {
      const [key, value] = trimmed.split(":").map(s => s.trim());
      currentSection = key;
      currentSubSection = null;
      currentArray = null;

      if (key === "version") {
        result.version = value || CONFIG_VERSION;
      } else if (key === "languages") {
        result.languages = [];
        currentArray = result.languages;
      } else if (key === "exclude") {
        result.exclude = [];
        currentArray = result.exclude;
      } else if (key === "include_generated") {
        result.includeGenerated = value === "true";
      } else if (key === "include_vendored") {
        result.includeVendored = value === "true";
      } else if (key === "parser") {
        result.parser = {};
      } else if (key === "llm") {
        result.llm = { ...DEFAULT_LLM_CONFIG };
      } else if (key === "plugins") {
        result.plugins = [];
      } else if (key === "performance") {
        result.performance = {};
      } else if (key === "output") {
        result.output = { ...DEFAULT_OUTPUT_CONFIG };
      } else if (key === "github") {
        result.github = {};
      }
    }
    // Array items (indented with -)
    else if (trimmed.startsWith("-") && currentArray) {
      const item = trimmed.slice(1).trim();
      currentArray.push(item);
    }
    // Plugin array items with properties
    else if (trimmed.startsWith("-") && currentSection === "plugins") {
      if (!result.plugins) result.plugins = [];
      const pluginMatch = trimmed.match(/- name:\s*"([^"]+)"/);
      if (pluginMatch) {
        result.plugins.push({
          name: pluginMatch[1],
          enabled: true,
        });
        currentPluginIndex = result.plugins.length - 1;
      }
    }
    // Nested properties
    else if (indent > 0 && trimmed.includes(":")) {
      const [key, value] = trimmed.split(":").map(s => s.trim());

      // Parser section (language-specific)
      if (currentSection === "parser" && isValidLanguage(key)) {
        if (!result.parser) result.parser = {};
        const defaultConfig = DEFAULT_PARSER_CONFIG[key as SupportedLanguage];
        if (defaultConfig) {
          result.parser[key as SupportedLanguage] = { ...defaultConfig };
        } else {
          result.parser[key as SupportedLanguage] = { adapter: "ast" as const, fallback: "text" as const };
        }
        currentSubSection = key;
      }
      // Parser adapter/fallback
      else if (currentSection === "parser" && currentSubSection) {
        const langConfig = result.parser?.[currentSubSection as SupportedLanguage];
        if (langConfig) {
          if (key === "adapter" && isValidParserAdapter(value)) {
            langConfig.adapter = value as "ast" | "text";
          } else if (key === "fallback" && isValidParserAdapter(value)) {
            langConfig.fallback = value as "ast" | "text";
          }
        }
      }
      // LLM section
      else if (currentSection === "llm" && result.llm) {
        if (key === "mode" && isValidLlmMode(value)) {
          result.llm.mode = value as "remote" | "local-only" | "none";
        } else if (key === "provider" && isValidLlmProvider(value)) {
          result.llm.provider = value as "openai" | "anthropic" | "ollama" | "llama.cpp";
        } else if (key === "model") {
          result.llm.model = value;
        } else if (key === "api_key_env") {
          result.llm.apiKeyEnv = value;
        } else if (key === "timeout") {
          result.llm.timeout = parseInt(value, 10);
        } else if (key === "retry") {
          result.llm.retry = parseInt(value, 10);
        } else if (key === "min_confidence") {
          result.llm.minConfidence = parseFloat(value);
        } else if (key === "enabled" && currentSubSection === "redaction") {
          if (result.llm.redaction) {
            result.llm.redaction.enabled = value === "true";
          }
        } else if (key === "redaction") {
          result.llm.redaction = { enabled: true };
          currentSubSection = "redaction";
        } else if (key === "patterns" && currentSubSection === "redaction") {
          if (result.llm.redaction) {
            result.llm.redaction.patterns = [];
            currentArray = result.llm.redaction.patterns;
          }
        }
      }
      // Output section
      else if (currentSection === "output" && result.output) {
        if (key === "default_out") {
          result.output.defaultOut = value;
        } else if (key === "formats") {
          result.output.formats = [];
          currentArray = result.output.formats as unknown as string[];
        } else if (key === "compress") {
          result.output.compress = value === "true";
        }
      }
      // Performance section
      else if (currentSection === "performance" && result.performance) {
        if (key === "parallel") {
          result.performance.parallel = value === "true";
        } else if (key === "max_workers") {
          result.performance.maxWorkers = parseInt(value, 10);
        } else if (key === "cache_enabled") {
          result.performance.cacheEnabled = value === "true";
        } else if (key === "cache_dir") {
          result.performance.cacheDir = value;
        }
      }
      // GitHub section
      else if (currentSection === "github" && result.github) {
        if (key === "enabled") {
          result.github.enabled = value === "true";
        } else if (key === "token_env") {
          result.github.tokenEnv = value;
        } else if (key === "app_id_env") {
          result.github.appIdEnv = value;
        } else if (key === "app_key_env") {
          result.github.appKeyEnv = value;
        } else if (key === "pr_comment_enabled") {
          result.github.prCommentEnabled = value === "true";
        } else if (key === "checks_enabled") {
          result.github.checksEnabled = value === "true";
        }
      }
      // Plugin properties (after - name: ...)
      else if (currentSection === "plugins" && currentPluginIndex >= 0 && result.plugins) {
        const plugin = result.plugins[currentPluginIndex];
        if (key === "enabled") {
          plugin.enabled = value === "true";
        } else if (key === "visibility") {
          plugin.visibility = value as "public" | "private";
        }
      }
    }
  }

  return result;
}

/**
 * Parse JSON configuration file
 */
function parseJsonConfig(content: string): Partial<CtgConfig> {
  try {
    return JSON.parse(content) as Partial<CtgConfig>;
  } catch {
    return {};
  }
}

/**
 * Merge parsed config with defaults
 */
function mergeWithDefaults(parsed: Partial<CtgConfig>): CtgConfig {
  const defaults = createDefaultConfig();

  return {
    version: parsed.version || defaults.version,
    languages: parsed.languages?.length ? parsed.languages : defaults.languages,
    exclude: parsed.exclude?.length ? parsed.exclude : defaults.exclude,
    includeGenerated: parsed.includeGenerated ?? defaults.includeGenerated,
    includeVendored: parsed.includeVendored ?? defaults.includeVendored,
    parser: { ...defaults.parser, ...parsed.parser },
    llm: { ...defaults.llm, ...parsed.llm },
    plugins: parsed.plugins?.length ? parsed.plugins : defaults.plugins,
    performance: { ...defaults.performance, ...parsed.performance },
    output: { ...defaults.output, ...parsed.output },
    github: { ...defaults.github, ...parsed.github },
  };
}

/**
 * Validate configuration
 * Returns validation result with errors if any
 */
export function validateConfig(config: CtgConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate version
  if (!isValidConfigVersion(config.version)) {
    errors.push(`Invalid config version: ${config.version}. Expected: ${CONFIG_VERSION}`);
  }

  // Validate languages
  for (const lang of config.languages) {
    if (!isValidLanguage(lang)) {
      errors.push(`Invalid language: ${lang}`);
    }
  }

  // Validate parser configs
  for (const [lang, parserConfig] of Object.entries(config.parser)) {
    if (parserConfig) {
      if (!isValidParserAdapter(parserConfig.adapter)) {
        errors.push(`Invalid parser adapter for ${lang}: ${parserConfig.adapter}`);
      }
      if (parserConfig.fallback && !isValidParserAdapter(parserConfig.fallback)) {
        errors.push(`Invalid parser fallback for ${lang}: ${parserConfig.fallback}`);
      }
    }
  }

  // Validate LLM config
  if (!isValidLlmMode(config.llm.mode)) {
    errors.push(`Invalid LLM mode: ${config.llm.mode}`);
  }
  if (config.llm.provider && !isValidLlmProvider(config.llm.provider)) {
    errors.push(`Invalid LLM provider: ${config.llm.provider}`);
  }
  if (config.llm.timeout !== undefined && config.llm.timeout < 1) {
    errors.push(`Invalid LLM timeout: ${config.llm.timeout}. Must be >= 1`);
  }
  if (config.llm.minConfidence !== undefined && (config.llm.minConfidence < 0 || config.llm.minConfidence > 1)) {
    errors.push(`Invalid LLM min_confidence: ${config.llm.minConfidence}. Must be between 0 and 1`);
  }

  // Validate plugins
  for (const plugin of config.plugins) {
    if (!plugin.name) {
      errors.push(`Plugin missing name`);
    }
  }

  // Validate output
  if (!config.output.defaultOut) {
    errors.push(`Output default_out is required`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Load configuration file
 * Priority: CLI --config > ctg.config.yaml > ctg.config.json > ~/.ctg/config.yaml
 *
 * @param configPath - Explicit config path from CLI (optional)
 * @param cwd - Current working directory (repo root)
 * @returns Loaded and validated configuration
 */
export function loadConfig(
  configPath: string | undefined,
  cwd: string
): { config: CtgConfig; source: string; errors: string[] } {
  const errors: string[] = [];
  let parsedConfig: Partial<CtgConfig> = {};
  let source = "default";

  // Try CLI-specified config first (highest priority)
  if (configPath) {
    const absolutePath = path.resolve(cwd, configPath);
    if (existsSync(absolutePath)) {
      source = absolutePath;
      const content = readFileSync(absolutePath, "utf8");
      if (absolutePath.endsWith(".json")) {
        parsedConfig = parseJsonConfig(content);
      } else {
        parsedConfig = parseYamlConfig(content);
      }
    } else {
      errors.push(`Config file not found: ${configPath}`);
    }
  }

  // Try repo root config files
  if (!source || source === "default") {
    for (const location of CONFIG_LOCATIONS) {
      const absolutePath = path.resolve(cwd, location);
      if (existsSync(absolutePath)) {
        source = absolutePath;
        const content = readFileSync(absolutePath, "utf8");
        if (location.endsWith(".json")) {
          parsedConfig = parseJsonConfig(content);
        } else {
          parsedConfig = parseYamlConfig(content);
        }
        break;
      }
    }
  }

  // Try global config (lowest priority)
  if (!source || source === "default") {
    const globalPath = path.join(process.env.HOME || process.env.USERPROFILE || "", GLOBAL_CONFIG_LOCATION);
    if (existsSync(globalPath)) {
      source = globalPath;
      const content = readFileSync(globalPath, "utf8");
      parsedConfig = parseYamlConfig(content);
    }
  }

  // Merge with defaults and validate
  const config = mergeWithDefaults(parsedConfig);
  const validation = validateConfig(config);

  return {
    config,
    source,
    errors: [...errors, ...validation.errors],
  };
}

/**
 * Get config file path for a given working directory
 * Returns the path of the config file that would be loaded
 */
export function getConfigPath(cwd: string): string | undefined {
  for (const location of CONFIG_LOCATIONS) {
    const absolutePath = path.resolve(cwd, location);
    if (existsSync(absolutePath)) {
      return absolutePath;
    }
  }
  return undefined;
}
