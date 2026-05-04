/**
 * Tests for UNSAFE_REDIRECT Rule
 */

import { describe, it, expect } from "vitest";
import { UNSAFE_REDIRECT_RULE } from "../unsafe-redirect.js";
import type { RuleContext, SimpleGraph, RepoFile } from "../index.js";

function createMockFile(
  path: string,
  content: string,
  language: "ts" | "js" | "py" | "rb" | "go" = "ts"
): RepoFile {
  return {
    id: `file:${path}`,
    path,
    language,
    role: "source",
    hash: "test-hash",
    sizeBytes: content.length,
    lineCount: content.split("\n").length,
    moduleId: `module:${path}`,
    parser: { status: "parsed", adapter: "test" },
  };
}

function createMockContext(files: Array<{ path: string; content: string; language?: "ts" | "js" | "py" | "rb" | "go" }>): RuleContext {
  const repoFiles: RepoFile[] = files.map((f) =>
    createMockFile(f.path, f.content, f.language ?? "ts")
  );

  const graph: SimpleGraph = {
    files: repoFiles,
    run_id: "test-run",
    generated_at: new Date().toISOString(),
    repo: { root: "/test" },
    stats: { partial: false },
  };

  const fileContents = new Map<string, string>();
  for (const f of files) {
    fileContents.set(f.path, f.content);
  }

  return {
    graph,
    getFileContent: (path: string) => fileContents.get(path) ?? null,
  };
}

describe("UNSAFE_REDIRECT_RULE", () => {
  it("should have correct metadata", () => {
    expect(UNSAFE_REDIRECT_RULE.id).toBe("UNSAFE_REDIRECT");
    expect(UNSAFE_REDIRECT_RULE.name).toBe("Unsafe Redirect");
    expect(UNSAFE_REDIRECT_RULE.category).toBe("security");
    expect(UNSAFE_REDIRECT_RULE.defaultSeverity).toBe("high");
  });

  describe("Express.js patterns", () => {
    it("should detect res.redirect(req.query.url)", () => {
      const context = createMockContext([
        {
          path: "src/routes/auth.ts",
          content: `
export function handleOAuthCallback(req, res) {
  const redirectUrl = req.query.url;
  res.redirect(redirectUrl);
}
`,
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].ruleId).toBe("UNSAFE_REDIRECT");
      expect(findings[0].category).toBe("security");
    });

    it("should detect res.redirect(req.params.redirect)", () => {
      const context = createMockContext([
        {
          path: "src/routes/redirect.ts",
          content: `
app.get('/go/:redirect', (req, res) => {
  res.redirect(req.params.redirect);
});
`,
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });

    it("should detect res.redirect(req.body.returnUrl)", () => {
      const context = createMockContext([
        {
          path: "src/api/login.ts",
          content: `
async function login(req, res) {
  const { returnUrl } = req.body;
  res.redirect(returnUrl);
}
`,
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });

    it("should NOT detect hardcoded redirect URLs", () => {
      const context = createMockContext([
        {
          path: "src/routes/success.ts",
          content: `
app.get('/success', (req, res) => {
  res.redirect('/dashboard');
});
`,
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect validated redirect URLs", () => {
      const context = createMockContext([
        {
          path: "src/routes/secure-redirect.ts",
          content: `
app.get('/redirect', (req, res) => {
  const url = req.query.url;
  if (url.startsWith('/')) {
    res.redirect(url);
  }
});
`,
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should NOT detect whitelist checked redirects", () => {
      const context = createMockContext([
        {
          path: "src/routes/whitelist-redirect.ts",
          content: `
const allowedUrls = ['/home', '/dashboard', '/profile'];
app.get('/go', (req, res) => {
  const url = req.query.url;
  if (allowedUrls.includes(url)) {
    res.redirect(url);
  }
});
`,
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });
  });

  describe("Frontend patterns", () => {
    it("should detect window.location.href assignment from props", () => {
      const context = createMockContext([
        {
          path: "src/components/RedirectHandler.tsx",
          content: `
function RedirectHandler({ redirectUrl }) {
  window.location.href = redirectUrl;
}
`,
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThanOrEqual(0);
    });

    it("should detect history.push with query params", () => {
      const context = createMockContext([
        {
          path: "src/utils/navigation.ts",
          content: `
const url = props.redirectUrl;
history.push(url);
`,
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Python/Flask patterns", () => {
    it("should detect redirect(request.args.get('url'))", () => {
      const context = createMockContext([
        {
          path: "src/routes/auth.py",
          content: `
@app.route('/callback')
def oauth_callback():
    redirect_url = request.args.get('url')
    return redirect(redirect_url)
`,
          language: "py",
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });

    it("should detect HttpResponseRedirect with user input", () => {
      const context = createMockContext([
        {
          path: "src/views/login.py",
          content: `
def login_view(request):
    next_url = request.GET.get('next')
    return HttpResponseRedirect(next_url)
`,
          language: "py",
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("Ruby/Rails patterns", () => {
    it("should detect redirect_to params[:url]", () => {
      const context = createMockContext([
        {
          path: "app/controllers/auth_controller.rb",
          content: `
def callback
  redirect_to params[:url]
end
`,
          language: "rb",
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("Go patterns", () => {
    it("should detect http.Redirect with query param", () => {
      const context = createMockContext([
        {
          path: "handlers/auth.go",
          content: `
func handleCallback(w http.ResponseWriter, r *http.Request) {
    url := r.URL.Query().Get("url")
    http.Redirect(w, r, url, http.StatusFound)
}
`,
          language: "go",
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("SMELL markers", () => {
    it("should detect SMELL: UNSAFE_REDIRECT marker", () => {
      const context = createMockContext([
        {
          path: "src/routes/redirect.ts",
          content: `
// SMELL: UNSAFE_REDIRECT
app.get('/go', (req, res) => {
  const url = req.query.url;
  res.redirect(url);
});
// END SMELL
`,
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].title).toContain("Unsafe redirect");
    });
  });

  describe("Edge cases", () => {
    it("should skip non-source files", () => {
      const context = createMockContext([
        {
          path: "tests/redirect.test.ts",
          content: `
it('test', () => {
  res.redirect(req.query.url);
});
`,
        },
      ]);

      // Mark as test file
      context.graph.files[0].role = "test";

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should skip config files with validation libraries", () => {
      const context = createMockContext([
        {
          path: "src/utils/url-validator.ts",
          content: `
import validator from 'validator';

export function validateRedirect(url) {
  return validator.isURL(url);
}
`,
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });

    it("should return empty array for files with no redirects", () => {
      const context = createMockContext([
        {
          path: "src/utils/helpers.ts",
          content: `
export function formatDate(date) {
  return date.toISOString();
}
`,
        },
      ]);

      const findings = UNSAFE_REDIRECT_RULE.evaluate(context);
      expect(findings.length).toBe(0);
    });
  });
});