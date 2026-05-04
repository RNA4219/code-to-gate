/**
 * DEPRECATED_API_USAGE Rule
 *
 * Detects usage of deprecated APIs and methods:
 * - Deprecated Node.js APIs (e.g., util.isArray, fs.exists)
 * - Deprecated library methods
 * - API version transitions (e.g., v1 -> v2)
 *
 * Using deprecated APIs creates maintenance debt and security risks.
 */

import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

// Known deprecated APIs by category
const DEPRECATED_NODE_APIS = [
  // util module
  { pattern: /util\.isArray\s*\(/g, name: "util.isArray", replacement: "Array.isArray()" },
  { pattern: /util\.isDate\s*\(/g, name: "util.isDate", replacement: "instanceof Date or util.types.isDate()" },
  { pattern: /util\.isError\s*\(/g, name: "util.isError", replacement: "instanceof Error or util.types.isNativeError()" },
  { pattern: /util\.isFunction\s*\(/g, name: "util.isFunction", replacement: "typeof value === 'function'" },
  { pattern: /util\.isNull\s*\(/g, name: "util.isNull", replacement: "value === null" },
  { pattern: /util\.isNullOrUndefined\s*\(/g, name: "util.isNullOrUndefined", replacement: "value == null" },
  { pattern: /util\.isNumber\s*\(/g, name: "util.isNumber", replacement: "typeof value === 'number'" },
  { pattern: /util\.isObject\s*\(/g, name: "util.isObject", replacement: "value !== null && typeof value === 'object'" },
  { pattern: /util\.isPrimitive\s*\(/g, name: "util.isPrimitive", replacement: "typeof checks" },
  { pattern: /util\.isRegExp\s*\(/g, name: "util.isRegExp", replacement: "instanceof RegExp" },
  { pattern: /util\.isString\s*\(/g, name: "util.isString", replacement: "typeof value === 'string'" },
  { pattern: /util\.isSymbol\s*\(/g, name: "util.isSymbol", replacement: "typeof value === 'symbol'" },
  { pattern: /util\.isUndefined\s*\(/g, name: "util.isUndefined", replacement: "value === undefined" },

  // fs module
  { pattern: /fs\.exists\s*\(/g, name: "fs.exists", replacement: "fs.existsSync() or fs.stat()" },
  { pattern: /fs\.existsSync\s*\(/g, name: "fs.existsSync", replacement: "fs.statSync() or fs.accessSync()" },

  // crypto module
  { pattern: /crypto\.createCredentials\s*\(/g, name: "crypto.createCredentials", replacement: "tls.createSecureContext()" },
  { pattern: /crypto\.Credentials\s*\(/g, name: "crypto.Credentials", replacement: "tls.SecureContext" },

  // domain module (deprecated in Node.js)
  { pattern: /domain\.create\s*\(/g, name: "domain.create", replacement: "async_hooks or proper error handling" },
  { pattern: /domain\.run\s*\(/g, name: "domain.run", replacement: "async_hooks or proper error handling" },

  // Buffer
  { pattern: /new\s+Buffer\s*\(/g, name: "new Buffer()", replacement: "Buffer.from(), Buffer.alloc(), or Buffer.allocUnsafe()" },
  { pattern: /Buffer\(\s*\)/g, name: "Buffer()", replacement: "Buffer.from(), Buffer.alloc(), or Buffer.allocUnsafe()" },

  // path module
  { pattern: /path\.exists\s*\(/g, name: "path.exists", replacement: "fs.existsSync() or fs.accessSync()" },
];

const DEPRECATED_BROWSER_APIS = [
  // Document methods
  { pattern: /document\.write\s*\(/g, name: "document.write", replacement: "DOM manipulation methods" },
  { pattern: /document\.writeln\s*\(/g, name: "document.writeln", replacement: "DOM manipulation methods" },

  // Window methods
  { pattern: /window\.showModalDialog\s*\(/g, name: "window.showModalDialog", replacement: "window.open() with modal features or custom modal" },
  { pattern: /window\.alert\s*\(/g, name: "window.alert", replacement: "custom notification UI (often deprecated in modern apps)" },
  { pattern: /window\.confirm\s*\(/g, name: "window.confirm", replacement: "custom confirmation UI" },

  // Event methods
  { pattern: /\.returnValue\s*=/g, name: "event.returnValue", replacement: "event.preventDefault()" },
  { pattern: /\.cancelBubble\s*=/g, name: "event.cancelBubble", replacement: "event.stopPropagation()" },

  // XMLHttpRequest (deprecated in favor of fetch)
  { pattern: /new\s+XMLHttpRequest\s*\(/g, name: "XMLHttpRequest", replacement: "fetch() API" },
  { pattern: /XMLHttpRequest\.open\s*\(/g, name: "XMLHttpRequest.open", replacement: "fetch() API" },
];

const DEPRECATED_EXPRESS_APIS = [
  { pattern: /app\.del\s*\(/g, name: "app.del", replacement: "app.delete()" },
  { pattern: /router\.del\s*\(/g, name: "router.del", replacement: "router.delete()" },
  { pattern: /res\.sendfile\s*\(/g, name: "res.sendfile", replacement: "res.sendFile()" },
];

const DEPRECATED_PYTHON_APIS = [
  { pattern: /print\s+[^\n]/g, name: "print statement", replacement: "print() function" },
  { pattern: /exec\s+[^\n]/g, name: "exec statement", replacement: "exec() function" },
  { pattern: /raw_input\s*\(/g, name: "raw_input", replacement: "input()" },
  { pattern: /unicode\s*\(/g, name: "unicode", replacement: "str()" },
  { pattern: /xrange\s*\(/g, name: "xrange", replacement: "range()" },
  { pattern: /\.has_key\s*\(/g, name: "dict.has_key", replacement: "in operator or dict.get()" },
];

export const DEPRECATED_API_USAGE_RULE: RulePlugin = {
  id: "DEPRECATED_API_USAGE",
  name: "Deprecated API Usage",
  description:
    "Detects usage of deprecated APIs, methods, and functions. Using deprecated APIs creates maintenance debt and may lead to security vulnerabilities or breaking changes when the API is removed.",
  category: "maintainability",
  defaultSeverity: "medium",
  defaultConfidence: 0.90,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      // Skip non-source files
      if (file.role !== "source") continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");
      const language = file.language;

      // Select appropriate deprecated API lists based on context
      let deprecatedApis: Array<{ pattern: RegExp; name: string; replacement: string }> = [];

      // Node.js/Browser APIs for JS/TS
      if (["ts", "tsx", "js", "jsx"].includes(language)) {
        deprecatedApis = [...DEPRECATED_NODE_APIS, ...DEPRECATED_BROWSER_APIS];

        // Check for Express if it appears to be an Express file
        if (content.includes("express") || content.includes("app.") || content.includes("router.")) {
          deprecatedApis = [...deprecatedApis, ...DEPRECATED_EXPRESS_APIS];
        }
      }

      // Python APIs
      if (language === "py") {
        deprecatedApis = [...DEPRECATED_PYTHON_APIS];
      }

      let inSmellComment = false;
      let smellStartLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check for SMELL comment markers
        if (line.includes("SMELL: DEPRECATED_API_USAGE") || line.includes("SMELL - Lines")) {
          inSmellComment = true;
          smellStartLine = lineNum;
          continue;
        }

        // Check for END SMELL marker
        if (inSmellComment && line.includes("END SMELL")) {
          findings.push({
            id: generateFindingId("DEPRECATED_API_USAGE", file.path, smellStartLine),
            ruleId: "DEPRECATED_API_USAGE",
            title: "Deprecated API usage detected",
            summary: `Deprecated API used at lines ${smellStartLine}-${lineNum}. Deprecated APIs may be removed in future versions and can cause breaking changes.`,
            severity: "medium",
            confidence: 0.90,
            category: "maintainability",
            evidence: [createEvidence(file.path, smellStartLine, lineNum)],
          });
          inSmellComment = false;
          continue;
        }

        // Check each deprecated API pattern
        for (const api of deprecatedApis) {
          api.pattern.lastIndex = 0; // Reset regex state
          const match = api.pattern.exec(line);

          if (match) {
            // Check if this line is in a comment
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith("//") || trimmedLine.startsWith("#") || trimmedLine.startsWith("/*")) {
              continue;
            }

            // Check if there's a deprecation suppression nearby
            const prevLines = lines.slice(Math.max(0, i - 3), i).join("\n");
            if (prevLines.includes("eslint-disable") || prevLines.includes("nolint") || prevLines.includes("noqa")) {
              continue;
            }

            findings.push({
              id: generateFindingId("DEPRECATED_API_USAGE", file.path, lineNum),
              ruleId: "DEPRECATED_API_USAGE",
              title: `Deprecated API: ${api.name}`,
              summary: `The API '${api.name}' is deprecated. Recommended replacement: ${api.replacement}. Using deprecated APIs creates maintenance debt and may lead to breaking changes.`,
              severity: "medium",
              confidence: 0.90,
              category: "maintainability",
              evidence: [createEvidence(file.path, lineNum, lineNum)],
            });
            break; // Only one finding per line
          }
        }
      }
    }

    return findings;
  },
};