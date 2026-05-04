/**
 * UNSAFE_REDIRECT Rule
 *
 * Detects unsafe redirect patterns where user-supplied URLs are used
 * directly without validation or whitelisting:
 * - res.redirect(req.query.url)
 * - window.location.href = userInput
 * - Response.redirect(userSuppliedUrl)
 *
 * This is a security vulnerability that enables open redirect attacks.
 */

import type { RulePlugin, RuleContext, Finding } from "./index.js";
import { createEvidence, generateFindingId } from "./index.js";

export const UNSAFE_REDIRECT_RULE: RulePlugin = {
  id: "UNSAFE_REDIRECT",
  name: "Unsafe Redirect",
  description:
    "Detects redirect operations that use user-supplied URLs directly without validation or whitelisting. Open redirect vulnerabilities can be used for phishing attacks and to bypass authorization checks.",
  category: "security",
  defaultSeverity: "high",
  defaultConfidence: 0.80,

  evaluate(context: RuleContext): Finding[] {
    const findings: Finding[] = [];

    for (const file of context.graph.files) {
      // Skip non-source files
      if (file.role !== "source") continue;
      if (!["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "php"].includes(file.language)) continue;

      const content = context.getFileContent(file.path);
      if (!content) continue;

      const lines = content.split("\n");

      // Patterns for unsafe redirects
      const redirectPatterns = {
        ts: [
          // Express/Node.js: res.redirect(req.query.url)
          /(?:res|response)\s*\.\s*redirect\s*\(\s*(?:req|request|ctx|context)\s*\.\s*(?:query|params|body)\s*\.\s*(?:url|redirect|redirectUrl|redirect_uri|target|destination|next|returnUrl|return_url|callback|callbackUrl)/g,
          // res.redirect(variable) where variable is likely user input
          /(?:res|response)\s*\.\s*redirect\s*\(\s*(?:redirectUrl|returnUrl|targetUrl|nextUrl|callbackUrl|url)[^,)]*\)/g,
          // res.redirect(`${userInput}`)
          /(?:res|response)\s*\.\s*redirect\s*\(\s*`?\$\{[^}]+\}`?\s*\)/g,
          // window.location.href = userInput (frontend)
          /(?:window|document)\s*\.\s*location\s*(?:\.\s*href)?\s*=\s*(?:req|request|query|params|props|state)[^;]+/g,
          // history.push(userUrl)
          /(?:history|router)\s*\.\s*push\s*\(\s*(?:props|state|query|params)[^)]+\)/g,
        ],
        js: [
          // Express/Node.js patterns
          /(?:res|response)\s*\.\s*redirect\s*\(\s*(?:req|request|ctx)\s*\.\s*(?:query|params|body)\s*\.\s*(?:url|redirect|target|destination|next|returnUrl)/g,
          // res.redirect(variable) where variable is likely user input
          /(?:res|response)\s*\.\s*redirect\s*\(\s*(?:redirectUrl|returnUrl|targetUrl|nextUrl|url)[^,)]*\)/g,
          // window.location patterns
          /(?:window|document)\s*\.\s*location\s*(?:\.\s*href)?\s*=\s*[^(const|let|var)]/g,
          // Direct redirect from query params
          /\.redirect\s*\(\s*[^"'][^,)]*(?:query|params|body|input)/g,
        ],
        py: [
          // Flask/Django: redirect(request.args.get('url'))
          /(?:redirect|HttpResponseRedirect)\s*\(\s*(?:request|req)\s*\.\s*(?:args|GET|params|form|data)\s*\.\s*get\s*\(\s*['"](?:url|redirect|target|destination|next|return_url|callback)/g,
          // redirect(user_input)
          /(?:redirect|HttpResponseRedirect)\s*\(\s*(?:user_input|redirect_url|target_url|url|next_url)[^)]*\)/g,
        ],
        rb: [
          // Ruby/Rails: redirect_to params[:url]
          /redirect_to\s+(?:params|request)\[:(?:url|redirect|target|destination|next|return_url|callback)\]/g,
          // redirect_to user_url
          /redirect_to\s+(?:user_url|target_url|redirect_url|url|next_url)/g,
        ],
        go: [
          // Go: http.Redirect(w, r, url, ...)
          /http\.Redirect\s*\([^,]*,\s*[^,]*,\s*(?:url|redirectUrl|targetUrl|userUrl)[^,)]*,/g,
          // http.Redirect(w, r, r.URL.Query().Get("url"), ...)
          /http\.Redirect\s*\([^,]*,\s*[^,]*,\s*(?:r|request)\s*\.\s*URL\s*\.\s*Query\s*\(\s*\)\s*\.\s*Get\s*\(\s*['"](?:url|redirect|target|destination|next|return)/g,
          // c.Redirect(userUrl)
          /\.Redirect\s*\(\s*(?:url|redirectUrl|targetUrl|userUrl)/g,
        ],
        rs: [
          // Rust: redirect(user_url)
          /redirect\s*\(\s*(?:user_url|target_url|redirect_url|url)/g,
        ],
        php: [
          // PHP: header("Location: " . $_GET['url'])
          /header\s*\(\s*['"]Location:\s*['"]\s*\.\s*\$_GET\[['"](?:url|redirect|target|destination|next|return)/g,
          // redirect($userInput)
          /(?:redirect|header)\s*\(\s*\$(?:url|redirectUrl|targetUrl|userUrl|request|input)/g,
        ],
      };

      // Patterns that indicate safe redirect usage
      const safePatterns = [
        // Whitelist check
        /(?:whitelist|allowed|safe|valid|permitted).*(?:url|redirect|domain|host)/i,
        /(?:url|redirect|domain|host).*(?:whitelist|allowed|safe|valid|permitted)/i,
        // URL validation
        /(?:validate|verify|sanitize|check).*(?:url|redirect|target)/i,
        /(?:url|redirect|target).*(?:validate|verify|sanitize|check)/i,
        // Relative path check
        /\.startsWith\s*\(\s*['"]\/['"]/,
        /\.startsWith\s*\(\s*['"]https:\/\/['"]/,
        /isRelativeUrl|isInternalUrl|isValidRedirect/,
        // Hardcoded URLs (safe)
        /(?:res|response)\s*\.\s*redirect\s*\(\s*['"][\/\.\w\-]+['"]\s*\)/,
        /(?:window|document)\s*\.\s*location\s*=\s*['"][\/\.\w\-]+['"]/,
      ];

      // Check for imports of validation libraries
      const hasValidationLibrary = content.includes("validator") ||
        content.includes("valid-url") ||
        content.includes("url-validator") ||
        content.includes("sanitize");

      // Skip if this file handles redirect validation
      const isRedirectHandlerFile =
        file.path.includes("redirect") ||
        file.path.includes("validation") ||
        file.path.includes("sanitize");

      if (isRedirectHandlerFile && hasValidationLibrary) continue;

      let inSmellComment = false;
      let smellStartLine = 0;

      const langPatterns = redirectPatterns[file.language as keyof typeof redirectPatterns] || redirectPatterns.ts;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check for SMELL comment markers
        if (line.includes("SMELL: UNSAFE_REDIRECT") || line.includes("SMELL - Lines")) {
          inSmellComment = true;
          smellStartLine = lineNum;
          continue;
        }

        // Check for END SMELL marker
        if (inSmellComment && line.includes("END SMELL")) {
          findings.push({
            id: generateFindingId("UNSAFE_REDIRECT", file.path, smellStartLine),
            ruleId: "UNSAFE_REDIRECT",
            title: "Unsafe redirect from user-supplied URL",
            summary: `Redirect operation using user-supplied URL without validation at line ${smellStartLine}-${lineNum}. This could enable open redirect attacks.`,
            severity: "high",
            confidence: 0.85,
            category: "security",
            evidence: [createEvidence(file.path, smellStartLine, lineNum)],
          });
          inSmellComment = false;
          continue;
        }

        // Skip if line has safe patterns
        const hasSafePattern = safePatterns.some(p => p.test(line));
        if (hasSafePattern) continue;

        // Check each redirect pattern
        for (const pattern of langPatterns) {
          pattern.lastIndex = 0; // Reset regex state
          const match = pattern.exec(line);

          if (match) {
            // Check if there's validation nearby (within 5 lines)
            const prevLines = lines.slice(Math.max(0, i - 5), i).join("\n");
            const nextLines = lines.slice(i + 1, Math.min(lines.length, i + 5)).join("\n");
            const context = prevLines + "\n" + line + "\n" + nextLines;

            const hasNearbyValidation =
              context.includes("whitelist") ||
              context.includes("allowedUrls") ||
              context.includes("validUrl") ||
              context.includes("safeRedirect") ||
              context.includes("validateUrl") ||
              context.includes("startsWith('/')") ||
              context.includes("startsWith('https')");

            if (!hasNearbyValidation) {
              // Extract the context for evidence
              const startLine = Math.max(1, lineNum - 2);
              const endLine = Math.min(lines.length, lineNum + 2);

              findings.push({
                id: generateFindingId("UNSAFE_REDIRECT", file.path, lineNum),
                ruleId: "UNSAFE_REDIRECT",
                title: "Unsafe redirect from user-supplied URL",
                summary: `Redirect operation at line ${lineNum} uses potentially user-supplied URL without validation. Open redirect vulnerabilities can be exploited for phishing attacks.`,
                severity: "high",
                confidence: 0.80,
                category: "security",
                evidence: [createEvidence(file.path, startLine, endLine)],
              });
            }
            break; // Only one finding per line
          }
        }
      }
    }

    return findings;
  },
};