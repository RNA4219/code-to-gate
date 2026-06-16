import { createParser, getInitError, initializeParser, isParserInitialized, loadLanguage, resetTreeSitterRuntimeForTests } from "./tree-sitter-runtime.js";
import { resolveWasmPath, loadWasmBuffer } from "./tree-sitter-wasm-resolver.js";

export type TreeSitterLanguage = "python" | "ruby" | "go" | "rust";

export interface TreeSitterLanguageInitResult {
  language: TreeSitterLanguage;
  available: boolean;
  adapterId: string;
  error?: string;
}

export interface TreeSitterInitializationFailure {
  language: TreeSitterLanguage;
  code: "TREE_SITTER_INIT_FAILED";
  message: string;
}

export interface TreeSitterInitializationReport {
  requested: boolean;
  parserInitialized: boolean;
  available: Record<TreeSitterLanguage, boolean>;
  languages: TreeSitterLanguageInitResult[];
  failures: TreeSitterInitializationFailure[];
  totalTimeMs: number;
  error?: string;
}

const TREE_SITTER_LANGUAGES: TreeSitterLanguage[] = ["python", "ruby", "go", "rust"];

const ADAPTER_IDS: Record<TreeSitterLanguage, string> = {
  python: "ctg-py-tree-sitter-v0",
  ruby: "ctg-rb-tree-sitter-v0",
  go: "ctg-go-tree-sitter-v0",
  rust: "ctg-rs-tree-sitter-v0",
};

const loadedLanguages = new Map<TreeSitterLanguage, any>();
const languageResults = new Map<TreeSitterLanguage, TreeSitterLanguageInitResult>();
let initializationPromise: Promise<TreeSitterInitializationReport> | null = null;

function emptyAvailability(): Record<TreeSitterLanguage, boolean> {
  return { python: false, ruby: false, go: false, rust: false };
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[A-Za-z]:[\\/][^\s"'`]+/g, "<path>").split(/\r?\n/)[0];
}

function buildReport(startTime: number, parserInitialized: boolean, error?: string): TreeSitterInitializationReport {
  const available = emptyAvailability();
  const languages = TREE_SITTER_LANGUAGES.map((language) => {
    const result = languageResults.get(language) ?? {
      language,
      available: loadedLanguages.has(language),
      adapterId: ADAPTER_IDS[language],
    };
    available[language] = result.available;
    return result;
  });

  const failures = languages
    .filter((result) => !result.available)
    .map((result) => ({
      language: result.language,
      code: "TREE_SITTER_INIT_FAILED" as const,
      message: result.error ?? `${result.language} tree-sitter initialization failed`,
    }));

  return {
    requested: true,
    parserInitialized,
    available,
    languages,
    failures,
    totalTimeMs: Date.now() - startTime,
    error,
  };
}

export async function initializeTreeSitterGrammars(verbose = false): Promise<TreeSitterInitializationReport> {
  const startTime = Date.now();

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      await initializeParser();
    } catch (error) {
      const message = `Parser init failed: ${sanitizeError(error)}`;
      for (const language of TREE_SITTER_LANGUAGES) {
        languageResults.set(language, { language, available: false, adapterId: ADAPTER_IDS[language], error: message });
      }
      return buildReport(startTime, false, message);
    }

    for (const language of TREE_SITTER_LANGUAGES) {
      const loadStart = Date.now();
      try {
        const languageObj = await loadLanguage(loadWasmBuffer(language), resolveWasmPath(language));
        loadedLanguages.set(language, languageObj);
        languageResults.set(language, { language, available: true, adapterId: ADAPTER_IDS[language] });

        if (verbose) {
          console.log(JSON.stringify({ phase: "tree-sitter-grammar-load", language, success: true, timeMs: Date.now() - loadStart }));
        }
      } catch (error) {
        const message = sanitizeError(error);
        languageResults.set(language, {
          language,
          available: false,
          adapterId: ADAPTER_IDS[language],
          error: message,
        });

        if (verbose) {
          console.log(JSON.stringify({ phase: "tree-sitter-grammar-load", language, success: false, error: message, timeMs: Date.now() - loadStart }));
        }
      }
    }

    return buildReport(startTime, isParserInitialized(), getInitError()?.message);
  })();

  return initializationPromise;
}

export function getLoadedLanguage(language: TreeSitterLanguage): any | null {
  return loadedLanguages.get(language) ?? null;
}

export function isLanguageAvailable(language: TreeSitterLanguage): boolean {
  return loadedLanguages.has(language);
}

export function createParserWithLanguage(language: TreeSitterLanguage): any | null {
  const langObj = loadedLanguages.get(language);
  if (!langObj) {
    return null;
  }

  const parser = createParser();
  if (!parser) {
    return null;
  }

  parser.setLanguage(langObj);
  return parser;
}

export function getLanguageInitStatus(language: TreeSitterLanguage): TreeSitterLanguageInitResult | null {
  return languageResults.get(language) ?? null;
}

export function isInitializationComplete(): boolean {
  return initializationPromise !== null;
}

export function resetInitialization(): void {
  loadedLanguages.clear();
  languageResults.clear();
  initializationPromise = null;
  resetTreeSitterRuntimeForTests();
}
