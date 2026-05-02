/**
 * FN Seeded Smells - Predefined seeded smells for FN evaluation
 */

import type { Severity, FindingCategory } from "../types/artifacts.js";
import type { SeededSmell } from "./fn-evaluator-types.js";

/**
 * Default seeded smells list from product-acceptance-v1.md
 */
export const DEFAULT_SEEDED_SMELLS: SeededSmell[] = [
  {
    seeded_id: "S001",
    rule_id: "CLIENT_TRUSTED_PRICE",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/api/order/create.ts",
    line: 15,
    description: "Client price is trusted without server-side validation",
    severity: "critical",
    category: "payment",
  },
  {
    seeded_id: "S002",
    rule_id: "WEAK_AUTH_GUARD",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/auth/guard.ts",
    line: 6,
    description: "Authorization guard only checks token presence",
    severity: "high",
    category: "auth",
  },
  {
    seeded_id: "S003",
    rule_id: "MISSING_SERVER_VALIDATION",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/api/order/create.ts",
    line: 18,
    description: "Order request body used without validation",
    severity: "high",
    category: "validation",
  },
  {
    seeded_id: "S004",
    rule_id: "UNTESTED_CRITICAL_PATH",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/api/order/create.ts",
    description: "Checkout order entrypoint has no direct test coverage",
    severity: "high",
    category: "testing",
  },
  {
    seeded_id: "S005",
    rule_id: "WEAK_AUTH_GUARD",
    fixture: "demo-auth-js",
    expected_detection: true,
    path: "src/routes/admin.js",
    line: 5,
    description: "Admin route uses user guard instead of admin guard",
    severity: "high",
    category: "auth",
  },
  {
    seeded_id: "S006",
    rule_id: "TRY_CATCH_SWALLOW",
    fixture: "demo-auth-js",
    expected_detection: true,
    path: "src/services/audit-log.js",
    line: 8,
    description: "Audit logging failure is swallowed",
    severity: "medium",
    category: "maintainability",
  },
  {
    seeded_id: "S007",
    rule_id: "ENV_DIRECT_ACCESS",
    fixture: "demo-auth-js",
    expected_detection: true,
    path: "src/config/env.js",
    description: "Direct environment variable access without validation",
    severity: "medium",
    category: "config",
  },
  {
    seeded_id: "S008",
    rule_id: "RAW_SQL",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/db/query.ts",
    description: "Raw SQL query without parameterization",
    severity: "high",
    category: "data",
  },
  {
    seeded_id: "S009",
    rule_id: "UNSAFE_DELETE",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/api/user/delete.ts",
    description: "Delete endpoint without authorization check",
    severity: "critical",
    category: "auth",
  },
  {
    seeded_id: "S010",
    rule_id: "HIGH_FANOUT_CHANGE",
    fixture: "demo-shop-ts",
    expected_detection: true,
    path: "src/shared/utils.ts",
    description: "High fanout change (diff mode required)",
    severity: "medium",
    category: "maintainability",
  },
];

/**
 * Get seeded smells by fixture
 */
export function getSeededSmellsByFixture(
  smells: SeededSmell[],
  fixture: string
): SeededSmell[] {
  return smells.filter((s) => s.fixture === fixture);
}

/**
 * Get seeded smells by rule
 */
export function getSeededSmellsByRule(
  smells: SeededSmell[],
  ruleId: string
): SeededSmell[] {
  return smells.filter((s) => s.rule_id === ruleId);
}

/**
 * Validate seeded smells configuration
 */
export function validateSeededSmells(smells: unknown[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (let i = 0; i < smells.length; i++) {
    const smell = smells[i] as Record<string, unknown>;

    if (!smell.seeded_id || typeof smell.seeded_id !== "string") {
      errors.push(`smells[${i}]. seeded_id is required and must be a string`);
    }

    if (!smell.rule_id || typeof smell.rule_id !== "string") {
      errors.push(`smells[${i}].rule_id is required and must be a string`);
    }

    if (!smell.fixture || typeof smell.fixture !== "string") {
      errors.push(`smells[${i}].fixture is required and must be a string`);
    }

    if (!smell.path || typeof smell.path !== "string") {
      errors.push(`smells[${i}].path is required and must be a string`);
    }

    if (
      smell.severity &&
      !["low", "medium", "high", "critical"].includes(smell.severity as string)
    ) {
      errors.push(`smells[${i}].severity must be low, medium, high, or critical`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate seeded smells configuration template
 */
export function generateSeededSmellsTemplate(
  fixtures: string[] = ["demo-shop-ts", "demo-auth-js"]
): string {
  const lines = [
    "# Seeded Smells Configuration",
    "# Define expected code smells for FN evaluation",
    "",
    "seeded_smells:",
  ];

  const commonRules = [
    { rule_id: "CLIENT_TRUSTED_PRICE", category: "payment", severity: "critical" },
    { rule_id: "WEAK_AUTH_GUARD", category: "auth", severity: "high" },
    { rule_id: "MISSING_SERVER_VALIDATION", category: "validation", severity: "high" },
    { rule_id: "UNTESTED_CRITICAL_PATH", category: "testing", severity: "high" },
    { rule_id: "TRY_CATCH_SWALLOW", category: "maintainability", severity: "medium" },
  ];

  for (const fixture of fixtures) {
    for (const rule of commonRules) {
      lines.push(`  - seeded_id: "" # Unique ID like S001`);
      lines.push(`    rule_id: ${rule.rule_id}`);
      lines.push(`    fixture: ${fixture}`);
      lines.push(`    path: "" # File path`);
      lines.push(`    line: 1 # Optional line number`);
      lines.push(`    description: "" # Smell description`);
      lines.push(`    severity: ${rule.severity}`);
      lines.push(`    category: ${rule.category}`);
      lines.push(`    expected_detection: true`);
      lines.push("");
    }
  }

  return lines.join("\n");
}