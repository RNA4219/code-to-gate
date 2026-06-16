import path from "node:path";

import type { ParserAdapter, ParserAdapterResult, ParserRegistry } from "../types/contracts.js";
import type { RepoFile } from "../types/graph.js";
import { initializeTreeSitterGrammars } from "./tree-sitter-initializer.js";

type FileParser = (filePath: string, repoRoot: string, fileId: string) => ParserAdapterResult;
type ContentParser = (content: string, relativePath: string) => ParserAdapterResult;

class FileParserAdapter implements ParserAdapter {
  constructor(
    public readonly language: string,
    public readonly adapterId: string,
    private readonly parseFile: FileParser
  ) {}

  parse(_content: string, filePath: string, repoRoot: string, fileId: string): ParserAdapterResult {
    return this.parseFile(filePath, repoRoot, fileId);
  }

  isAvailable(): boolean {
    return true;
  }
}

class ContentParserAdapter implements ParserAdapter {
  constructor(
    public readonly language: string,
    public readonly adapterId: string,
    private readonly parseContent: ContentParser
  ) {}

  parse(content: string, filePath: string, repoRoot: string, _fileId: string): ParserAdapterResult {
    const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    return this.parseContent(content, relativePath);
  }

  isAvailable(): boolean {
    return true;
  }
}

export class DefaultParserRegistry implements ParserRegistry {
  private readonly parsers = new Map<RepoFile["language"], ParserAdapter>();
  private treeSitterReady = false;

  register(language: RepoFile["language"], parser: ParserAdapter): void {
    this.parsers.set(language, parser);
  }

  setTreeSitterReady(ready: boolean): void {
    this.treeSitterReady = ready;
  }

  getParser(file: RepoFile): ParserAdapter | null {
    return this.parsers.get(file.language) ?? null;
  }

  hasParser(language: RepoFile["language"]): boolean {
    return this.parsers.has(language);
  }

  getRegisteredLanguages(): RepoFile["language"][] {
    return [...this.parsers.keys()];
  }

  isTreeSitterReady(): boolean {
    return this.treeSitterReady;
  }
}

export class EmptyParserRegistry implements ParserRegistry {
  getParser(_file: RepoFile): null {
    return null;
  }

  hasParser(_language: RepoFile["language"]): boolean {
    return false;
  }

  getRegisteredLanguages(): RepoFile["language"][] {
    return [];
  }

  isTreeSitterReady(): boolean {
    return false;
  }
}

export async function createParserRegistry(useTreeSitter = false): Promise<DefaultParserRegistry> {
  const registry = new DefaultParserRegistry();
  const [
    { parseTypeScriptFile },
    { parseJavaScriptFile },
    { parsePythonFile },
    { parseRubyFile },
    { parseRegexLanguageFile },
  ] = await Promise.all([
    import("./ts-adapter.js"),
    import("./js-adapter.js"),
    import("./py-adapter.js"),
    import("./rb-adapter.js"),
    import("./regex-language-adapter.js"),
  ]);

  registry.register("ts", new FileParserAdapter("ts", "ctg-ts-morph-v0", parseTypeScriptFile));
  registry.register("tsx", new FileParserAdapter("tsx", "ctg-ts-morph-v0", parseTypeScriptFile));
  registry.register("js", new FileParserAdapter("js", "ctg-js-morph-v0", parseJavaScriptFile));
  registry.register("jsx", new FileParserAdapter("jsx", "ctg-js-morph-v0", parseJavaScriptFile));
  registry.register("py", new FileParserAdapter("py", "ctg-py-regex-v0", parsePythonFile));
  registry.register("rb", new FileParserAdapter("rb", "ctg-rb-regex-v0", parseRubyFile));

  for (const language of ["go", "rs", "java", "php", "cs", "cpp"] as const) {
    registry.register(
      language,
      new FileParserAdapter(language, `ctg-${language}-regex-v0`, (filePath, repoRoot, fileId) =>
        parseRegexLanguageFile(filePath, repoRoot, fileId, language)
      )
    );
  }

  if (!useTreeSitter) return registry;

  const [
    python,
    ruby,
    go,
    rust,
  ] = await Promise.all([
      import("./py-tree-sitter-adapter.js"),
      import("./rb-tree-sitter-adapter.js"),
      import("./go-tree-sitter-adapter.js"),
      import("./rs-tree-sitter-adapter.js"),
  ]);

  try {
    const report = await initializeTreeSitterGrammars();
    const pyReady = report.available.python;
    const rbReady = report.available.ruby;
    const goReady = report.available.go;
    const rsReady = report.available.rust;

    if (pyReady) registry.register("py", new ContentParserAdapter("py", "ctg-py-tree-sitter-v0", python.parsePythonFileSync));
    if (rbReady) registry.register("rb", new ContentParserAdapter("rb", "ctg-rb-tree-sitter-v0", ruby.parseRubyFileSync));
    if (goReady) registry.register("go", new ContentParserAdapter("go", "ctg-go-tree-sitter-v0", go.parseGoFileSync));
    if (rsReady) registry.register("rs", new ContentParserAdapter("rs", "ctg-rs-tree-sitter-v0", rust.parseRustFileSync));
    registry.setTreeSitterReady(pyReady || rbReady || goReady || rsReady);
  } catch {
    registry.setTreeSitterReady(false);
  }

  return registry;
}
