/**
 * Shared tree-sitter runtime.
 *
 * web-tree-sitter must be initialized once per process. The language grammars
 * are loaded by tree-sitter-initializer in a fixed sequential order.
 */

let ParserClass: any = null;
let LanguageClass: any = null;
let initPromise: Promise<void> | null = null;
let initError: Error | null = null;

export async function initializeParser(): Promise<void> {
  if (ParserClass && LanguageClass) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const module = await import("web-tree-sitter");
      ParserClass = module.Parser;
      LanguageClass = module.Language;
      await ParserClass.init();
      initError = null;
    } catch (error) {
      initError = error instanceof Error ? error : new Error(String(error));
      ParserClass = null;
      LanguageClass = null;
      throw initError;
    }
  })();

  return initPromise;
}

export function createParser(): any | null {
  return ParserClass ? new ParserClass() : null;
}

export async function loadLanguage(wasmBuffer: Buffer | null, wasmUrl: string): Promise<any> {
  if (!LanguageClass) {
    throw new Error("tree-sitter Parser.init() has not completed");
  }

  return wasmBuffer ? LanguageClass.load(wasmBuffer) : LanguageClass.load(wasmUrl);
}

export function isParserInitialized(): boolean {
  return ParserClass !== null && LanguageClass !== null;
}

export function getInitError(): Error | null {
  return initError;
}

export function resetTreeSitterRuntimeForTests(): void {
  ParserClass = null;
  LanguageClass = null;
  initPromise = null;
  initError = null;
}
