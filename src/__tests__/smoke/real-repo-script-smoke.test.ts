import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  new URL("../../../scripts/real-repo-test.sh", import.meta.url),
  "utf8",
);

describe("real repo test script", () => {
  it("uses the supported deterministic local analyze contract", () => {
    expect(script).not.toContain("--llm-mode none");
    expect(script).toMatch(
      /if node "\$CTG_CLI" analyze .* --llm-mode local-only --llm-provider deterministic 2>&1; then/,
    );
  });

  it("passes required policy and artifact inputs to readiness", () => {
    expect(script).toContain(
      'readiness "$test_dir" --policy "$POLICY_FILE" --from "$analyze_output" --out "$readiness_output"',
    );
  });

  it("records expected non-zero exits without tripping global errexit", () => {
    expect(script).not.toContain("run_allowing_expected_failure");
    expect(script.match(/if node "\$CTG_CLI" (?:scan|analyze|readiness)\b/g)).toHaveLength(3);
    expect(script).toContain('SCHEMA_FAILURES="$failures"');
    expect(script).toMatch(
      /if \[\[ \$passed -eq \$total_tests \]\]; then\s+REPO_TEST_EXIT=0\s+else\s+REPO_TEST_EXIT=1\s+fi\s+\s*return 0/,
    );
    expect(script).toMatch(
      /test_repo "\$repo_name" "\$repo_config"\s+if \[\[ \$REPO_TEST_EXIT -eq 0 \]\]/,
    );
  });
});
