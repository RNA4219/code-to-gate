# SPEC-06: LLM Auto-tuning

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 1 week

---

## 1. Purpose

Implement automatic LLM provider selection based on task complexity, cost optimization, and performance requirements.

---

## 2. Scope

### Included
- Provider selection logic (remote vs local)
- Cost-aware routing
- Complexity-based provider selection
- Fallback chain management

### Excluded
- Custom model training
- Prompt optimization (separate spec)
- LLM monitoring dashboard

---

## 3. Current State

**Status**: Manual provider selection via `--llm-provider` flag

**Current Providers**:
| Provider | Type | Cost | Quality |
|---|---|:---:|:---:|
| OpenAI | Remote | High | Best |
| Anthropic | Remote | High | Best |
| ollama | Local | Free | Good |
| llama.cpp | Local | Free | Good |

**Current Selection**: User manually specifies provider, no auto-selection.

---

## 4. Proposed Implementation

### Provider Selection Matrix

| Task Complexity | Recommended Provider | Reason |
|---|---|---|
| High (critical finding analysis) | OpenAI/Anthropic | Best quality needed |
| Medium (summary generation) | ollama/llama.cpp | Cost optimization |
| Low (simple formatting) | ollama | Free, fast |

### Implementation Architecture

```typescript
// src/llm/provider-selector.ts
interface ProviderSelectorConfig {
  maxCostPerRequest?: number;    // Cost limit in USD
  minQualityScore?: number;      // Minimum quality threshold
  preferLocal?: boolean;         // Prefer local providers
  fallbackChain?: string[];      // Ordered fallback providers
}

interface TaskAnalysis {
  complexity: "high" | "medium" | "low";
  estimatedTokens: number;
  requiresNetwork: boolean;
}

function selectProvider(
  task: TaskAnalysis,
  config: ProviderSelectorConfig
): LlmProvider {
  // 1. Check cost constraint
  if (config.maxCostPerRequest && config.maxCostPerRequest === 0) {
    return selectLocalProvider(task);
  }

  // 2. Check quality requirement
  if (task.complexity === "high" && !config.preferLocal) {
    return selectRemoteProvider(config.maxCostPerRequest);
  }

  // 3. Default to local if available
  if (isLocalProviderAvailable() && config.preferLocal) {
    return selectLocalProvider(task);
  }

  // 4. Fallback chain
  return fallbackProvider(config.fallbackChain);
}
```

### Complexity Detection

```typescript
function analyzeTaskComplexity(request: LlmAnalysisRequest): TaskAnalysis {
  // Estimate from prompt length
  const promptTokens = estimateTokens(request.userPrompt);
  
  // Estimate from task type
  const complexity = detectComplexity(request.systemPrompt);
  
  return {
    complexity,
    estimatedTokens: promptTokens + request.maxTokens,
    requiresNetwork: !request.localOnly,
  };
}

function detectComplexity(systemPrompt: string): "high" | "medium" | "low" {
  const highPatterns = ["analyze", "security", "critical", "vulnerability"];
  const mediumPatterns = ["summarize", "explain", "suggest"];
  
  if (highPatterns.some(p => systemPrompt.includes(p))) return "high";
  if (mediumPatterns.some(p => systemPrompt.includes(p))) return "medium";
  return "low";
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/llm/provider-selector.ts` | Create | Selection logic |
| `src/llm/types.ts` | Modify | Add selection types |
| `src/cli/analyze.ts` | Modify | Use auto-selection |
| `src/llm/__tests__/provider-selector.test.ts` | Create | Test selection |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Existing providers | Internal | Active |
| Provider health check | Existing | Active |
| Cost estimation logic | New | Needed |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Auto-selection works | Provider selected without manual flag | Automated |
| Cost limit respected | Selected provider within limit | Automated |
| Fallback works | Fallback on provider failure | Automated |
| Quality maintained | Output quality acceptable | Manual |

---

## 8. Test Plan

### Selection Tests
```typescript
describe("provider-selector", () => {
  it("should select local for low complexity + free tier", () => {
    const result = selectProvider(
      { complexity: "low", estimatedTokens: 500, requiresNetwork: false },
      { maxCostPerRequest: 0 }
    );
    expect(result.type).toBe("ollama");
  });

  it("should select remote for high complexity + budget available", () => {
    const result = selectProvider(
      { complexity: "high", estimatedTokens: 2000, requiresNetwork: true },
      { maxCostPerRequest: 0.5 }
    );
    expect(result.type).toMatch(/openai|anthropic/);
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Provider unavailable | Medium | Medium | Fallback chain |
| Cost estimation inaccurate | Medium | Low | Conservative estimates |
| Selection latency | Low | Low | Cache provider status |

---

## 10. References

| Reference | Path |
|---|---|
| Provider types | `src/llm/types.ts` |
| ollama provider | `src/llm/providers/ollama-provider.ts` |
| Provider health | `src/llm/providers/provider-health.ts` |