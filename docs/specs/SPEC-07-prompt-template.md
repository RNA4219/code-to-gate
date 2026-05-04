# SPEC-07: Prompt Template Library

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 3 days

---

## 1. Purpose

Create a customizable prompt template library allowing users to define custom LLM prompts for specific use cases.

---

## 2. Scope

### Included
- Template file format definition
- Template loading and parsing
- Variable interpolation in templates
- Template versioning

### Excluded
- Template UI editor (future)
- Template sharing platform (future)
- LLM fine-tuning (separate concern)

---

## 3. Current State

**Status**: Hardcoded prompts in code

**Current Prompts Location**: Embedded in `src/llm/*.ts` files

**Problem**: Users cannot customize prompts without modifying source code.

---

## 4. Proposed Implementation

### Template File Format

```yaml
# prompts/security-analysis.yaml
apiVersion: ctg/v1
kind: prompt-template
name: security-analysis
version: 1.0.0
description: "Security-focused finding analysis prompt"

variables:
  - name: findings
    type: array
    required: true
  - name: repoName
    type: string
    required: true
  - name: maxTokens
    type: number
    default: 4096

systemPrompt: |
  You are a security expert analyzing code findings.
  Repository: {{repoName}}
  
  Focus on:
  - Security implications
  - Attack vectors
  - Remediation recommendations
  
  Provide analysis in JSON format with:
  - severity_assessment
  - attack_scenario
  - remediation_steps

userPrompt: |
  Analyze the following findings for security implications:
  
  {{#each findings}}
  - Rule: {{this.ruleId}}
    Location: {{this.location}}
    Summary: {{this.summary}}
  {{/each}}
  
  Provide structured analysis.
```

### Template Directory Structure

```
prompts/
├── built-in/
│   ├── security-analysis.yaml
│   ├── summary-generation.yaml
│   ├── risk-narrative.yaml
│   └── test-suggestion.yaml
├── custom/
│   └── user-defined templates
└── README.md
```

### Template Loader Implementation

```typescript
// src/llm/prompt-template.ts
interface PromptTemplate {
  name: string;
  version: string;
  variables: TemplateVariable[];
  systemPrompt: string;
  userPrompt: string;
}

interface TemplateVariable {
  name: string;
  type: "string" | "number" | "array" | "object";
  required: boolean;
  default?: any;
}

function loadTemplate(templatePath: string): PromptTemplate {
  const content = fs.readFileSync(templatePath, "utf-8");
  return parseTemplateYaml(content);
}

function interpolateTemplate(
  template: PromptTemplate,
  values: Record<string, any>
): { systemPrompt: string; userPrompt: string } {
  // Validate required variables
  for (const v of template.variables) {
    if (v.required && values[v.name] === undefined) {
      throw new Error(`Missing required variable: ${v.name}`);
    }
  }

  // Interpolate with defaults
  const resolved = { ...values };
  for (const v of template.variables) {
    if (resolved[v.name] === undefined && v.default !== undefined) {
      resolved[v.name] = v.default;
    }
  }

  return {
    systemPrompt: interpolate(template.systemPrompt, resolved),
    userPrompt: interpolate(template.userPrompt, resolved),
  };
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/llm/prompt-template.ts` | Create | Template handling |
| `src/llm/prompt-loader.ts` | Create | Template loading |
| `prompts/built-in/*.yaml` | Create | Default templates |
| `src/cli/analyze.ts` | Modify | Use templates |
| `docs/prompt-guide.md` | Create | User documentation |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| YAML parser | npm (js-yaml) | Active |
| Template interpolation | Custom | New |
| File system access | Node.js | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Template files load correctly | YAML parsed without errors | Automated |
| Variables interpolate correctly | Output contains values | Automated |
| Required variables validated | Error on missing required | Automated |
| Custom templates work | User template usable | Manual |

---

## 8. Test Plan

### Template Loading Test
```typescript
describe("prompt-template", () => {
  it("should load YAML template", () => {
    const template = loadTemplate("prompts/built-in/security-analysis.yaml");
    expect(template.name).toBe("security-analysis");
    expect(template.variables.length).toBeGreaterThan(0);
  });

  it("should interpolate variables", () => {
    const template = loadTemplate("...");
    const result = interpolateTemplate(template, {
      findings: [{ ruleId: "TEST" }],
      repoName: "test-repo"
    });
    expect(result.systemPrompt).toContain("test-repo");
  });

  it("should error on missing required", () => {
    expect(() => interpolateTemplate(template, {})).toThrow();
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| YAML syntax errors | Medium | Medium | Template validator |
| Variable type mismatch | Low | Low | Type coercion |
| Template injection | Low | High | Sanitize inputs |

---

## 10. References

| Reference | Path |
|---|---|
| Current prompts | `src/llm/*.ts` |
| LLM types | `src/llm/types.ts` |
| CLI analyze | `src/cli/analyze.ts` |