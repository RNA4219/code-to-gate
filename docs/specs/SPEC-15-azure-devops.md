# SPEC-15: Azure DevOps Integration

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P3
**Estimated Time**: 1 week

---

## 1. Purpose

Provide Azure DevOps (Azure Pipelines) integration for code-to-gate analysis in Microsoft-based development environments.

---

## 2. Scope

### Included
- Azure Pipelines YAML template
- Azure Repos PR comment integration
- Azure DevOps API integration
- Azure artifact publishing

### Excluded
- Azure Boards integration (future)
- Azure security dashboard
- Azure self-hosted agent specifics

---

## 3. Current State

**Status**: GitHub only, no Azure DevOps support

**Need**: Enterprise customers often use Azure DevOps for CI/CD.

---

## 4. Proposed Implementation

### Azure Pipelines Template

```yaml
# azure-pipelines-code-to-gate.yml
trigger:
  - main

pr:
  branches:
    include:
      - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
    displayName: 'Install Node.js'

  - script: |
      npm install -g github:RNA4219/code-to-gate
    displayName: 'Install code-to-gate'

  - script: |
      code-to-gate scan . --out .qh
      code-to-gate analyze . --emit all --out .qh
      code-to-gate readiness . --policy policy.yaml --out .qh
    displayName: 'Run code-to-gate analysis'

  - script: |
      code-to-gate export sarif --from .qh --out results.sarif
    displayName: 'Export SARIF'

  - task: PublishBuildArtifacts@1
    inputs:
      pathToPublish: '.qh'
      artifactName: 'code-to-gate-results'
    displayName: 'Publish artifacts'

  - script: |
      status=$(jq -r '.status' .qh/release-readiness.json)
      if [ "$status" = "blocked_input" ]; then
        echo "##vso[task.complete result=Failed;]Release blocked by critical findings"
      fi
    displayName: 'Check readiness status'
    condition: always()

  - script: |
      # Post PR comment via Azure DevOps API
      if [ -n "$SYSTEM_PULLREQUEST_PULLREQUESTID" ]; then
        node ./dist/cli.js azure-pr-comment \
          --project "$SYSTEM_TEAMPROJECT" \
          --repo "$BUILD_REPOSITORY_NAME" \
          --pr "$SYSTEM_PULLREQUEST_PULLREQUESTID" \
          --from .qh
      fi
    displayName: 'Post PR comment'
    condition: and(succeeded(), ne(variables['System.PullRequest.PullRequestId'], ''))
    env:
      AZURE_DEVOPS_TOKEN: $(azureDevOpsToken)
```

### Azure DevOps API Client

```typescript
// src/azure/api-client.ts
interface AzureDevOpsOptions {
  organization: string;
  project: string;
  token: string;
}

class AzureDevOpsClient {
  private baseUrl: string;
  private token: string;

  constructor(options: AzureDevOpsOptions) {
    this.baseUrl = `https://dev.azure.com/${options.organization}/${options.project}`;
    this.token = options.token;
  }

  async postPullRequestComment(
    repoId: string,
    pullRequestId: number,
    comment: string
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/_apis/git/repositories/${repoId}/pullRequests/${pullRequestId}/threads?api-version=7.0`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comments: [{ content: comment, commentType: "text" }],
          status: "active",
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Azure DevOps API error: ${response.status}`);
    }
  }
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `azure-pipelines-code-to-gate.yml` | Create | Pipeline template |
| `src/azure/api-client.ts` | Create | Azure API client |
| `src/azure/pr-comment.ts` | Create | PR comment logic |
| `src/cli/azure-pr-comment.ts` | Create | CLI command |
| `docs/azure-devops-integration.md` | Create | Documentation |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Azure DevOps API | External | Needed |
| Azure PAT token | Secret | Required |
| Azure Pipelines | External | Required |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Pipeline runs successfully | Azure pipeline completes | Manual |
| PR comment posted | Comment in Azure PR | Manual |
| Artifacts published | Artifacts downloadable | Manual |
| Pipeline fails on blocked | Exit code affects result | Automated |

---

## 8. Test Plan

### Integration Test
1. Create Azure DevOps project
2. Add pipeline template
3. Create PR with findings
4. Verify comment appears
5. Verify artifacts published

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Azure API version changes | Low | Medium | API versioning |
| Self-hosted agent differences | Medium | Low | Standard pool |
| Token scope issues | Medium | Medium | Clear documentation |

---

## 10. References

| Reference | Path |
|---|---|
| GitHub integration | `src/github/*.ts` |
| Azure DevOps API | https://docs.microsoft.com/en-us/rest/api/azure/devops/ |
| Azure Pipelines | https://docs.microsoft.com/en-us/azure/devops/pipelines/ |