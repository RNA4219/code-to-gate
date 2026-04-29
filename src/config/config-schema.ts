/**
 * Configuration file schema and default values
 * Based on docs/product-spec-v1.md section 4
 */

import type { Severity, FindingCategory } from "../types/artifacts.js";

export const CONFIG_VERSION = "ctg/v1alpha1";

/**
 * Supported language identifiers
 */
export type SupportedLanguage = "ts" | "tsx" | "js" | "jsx" | "py";

/**
 * Parser adapter types
 */
export type ParserAdapter = "ast" | "text";

/**
 * LLM mode options
 */
export type LlmMode = "remote" | "local-only" | "none";

/**
 * LLM provider options
 */
export type LlmProvider = "openai" | "anthropic" | "ollama" | "llama.cpp";

/**
 * Parser configuration per language
 */
export interface ParserConfig {
  adapter: ParserAdapter;
  fallback?: ParserAdapter;
}

/**
 * LLM redaction patterns
 */
export interface LlmRedactionConfig {
  enabled: boolean;
  patterns?: string[];
}

/**
 * LLM configuration
 */
export interface LlmConfig {
  mode: LlmMode;
  provider?: LlmProvider;
  model?: string;
  apiKeyEnv?: string;
  timeout?: number;
  retry?: number;
  minConfidence?: number;
  redaction?: LlmRedactionConfig;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  name: string;
  enabled: boolean;
  visibility?: "public" | "private";
  path?: string;
}

/**
 * Performance configuration
 */
export interface PerformanceConfig {
  parallel?: boolean;
  maxWorkers?: number;
  cacheEnabled?: boolean;
  cacheDir?: string;
}

/**
 * Output configuration
 */
export interface OutputConfig {
  defaultOut: string;
  formats?: ("json" | "yaml" | "md" | "mermaid")[];
  compress?: boolean;
}

/**
 * GitHub configuration
 */
export interface GitHubConfig {
  enabled?: boolean;
  tokenEnv?: string;
  appIdEnv?: string;
  appKeyEnv?: string;
  prCommentEnabled?: boolean;
  checksEnabled?: boolean;
}

/**
 * Full configuration schema
 */
export interface CtgConfig {
  version: string;
  languages: SupportedLanguage[];
  exclude: string[];
  includeGenerated?: boolean;
  includeVendored?: boolean;
  parser: Partial<Record<SupportedLanguage, ParserConfig>>;
  llm: LlmConfig;
  plugins: PluginConfig[];
  performance?: PerformanceConfig;
  output: OutputConfig;
  github?: GitHubConfig;
}

/**
 * Default parser configuration
 */
export const DEFAULT_PARSER_CONFIG: Partial<Record<SupportedLanguage, ParserConfig>> = {
  ts: { adapter: "ast", fallback: "text" },
  tsx: { adapter: "ast", fallback: "text" },
  js: { adapter: "ast", fallback: "text" },
  jsx: { adapter: "ast", fallback: "text" },
  py: { adapter: "ast", fallback: "text" },
};

/**
 * Default LLM configuration
 */
export const DEFAULT_LLM_CONFIG: LlmConfig = {
  mode: "remote",
  provider: "openai",
  model: "gpt-4.1",
  apiKeyEnv: "OPENAI_API_KEY",
  timeout: 60,
  retry: 3,
  minConfidence: 0.6,
  redaction: {
    enabled: true,
    patterns: ["api_key", "token", "password", "secret"],
  },
};

/**
 * Default output configuration
 */
export const DEFAULT_OUTPUT_CONFIG: OutputConfig = {
  defaultOut: ".qh",
  formats: ["json", "yaml"],
  compress: false,
};

/**
 * Default exclude patterns
 */
export const DEFAULT_EXCLUDE_PATTERNS: string[] = [
  "node_modules/",
  "dist/",
  "build/",
  "*.test.*",
  "*.spec.*",
  "*.generated.*",
];

/**
 * Default languages
 */
export const DEFAULT_LANGUAGES: SupportedLanguage[] = ["ts", "js"];

/**
 * Default plugins
 */
export const DEFAULT_PLUGINS: PluginConfig[] = [
  { name: "@code-to-gate/lang-ts", enabled: true },
  { name: "@code-to-gate/rules-core", enabled: true },
];

/**
 * Create default configuration
 */
export function createDefaultConfig(): CtgConfig {
  return {
    version: CONFIG_VERSION,
    languages: DEFAULT_LANGUAGES,
    exclude: DEFAULT_EXCLUDE_PATTERNS,
    includeGenerated: false,
    includeVendored: false,
    parser: DEFAULT_PARSER_CONFIG,
    llm: DEFAULT_LLM_CONFIG,
    plugins: DEFAULT_PLUGINS,
    performance: {
      parallel: true,
      maxWorkers: 4,
      cacheEnabled: true,
      cacheDir: ".qh/cache",
    },
    output: DEFAULT_OUTPUT_CONFIG,
    github: {
      enabled: true,
      tokenEnv: "GITHUB_TOKEN",
      prCommentEnabled: true,
      checksEnabled: true,
    },
  };
}

/**
 * Validate configuration version
 */
export function isValidConfigVersion(version: string): boolean {
  return version === CONFIG_VERSION;
}

/**
 * Validate language
 */
export function isValidLanguage(lang: string): boolean {
  const validLanguages: SupportedLanguage[] = ["ts", "tsx", "js", "jsx", "py"];
  return validLanguages.includes(lang as SupportedLanguage);
}

/**
 * Validate parser adapter
 */
export function isValidParserAdapter(adapter: string): boolean {
  return ["ast", "text"].includes(adapter);
}

/**
 * Validate LLM mode
 */
export function isValidLlmMode(mode: string): boolean {
  return ["remote", "local-only", "none"].includes(mode);
}

/**
 * Validate LLM provider
 */
export function isValidLlmProvider(provider: string): boolean {
  return ["openai", "anthropic", "ollama", "llama.cpp"].includes(provider);
}