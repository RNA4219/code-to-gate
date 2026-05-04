# SPEC-16: Slack/Teams Notification

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 3 days

---

## 1. Purpose

Send finding summary notifications to Slack and Microsoft Teams for team awareness and quick response.

---

## 2. Scope

### Included
- Slack webhook integration
- Microsoft Teams webhook integration
- Configurable notification triggers
- Severity-based notification filtering

### Excluded
- Slack bot with interactive commands (future)
- Teams adaptive cards (basic only)
- Notification scheduling

---

## 3. Current State

**Status**: No notification support

**Need**: Teams want real-time alerts when critical findings are detected.

---

## 4. Proposed Implementation

### Notification Configuration

```yaml
# notifications.yaml
apiVersion: ctg/v1
kind: notifications
channels:
  slack:
    webhook_url: ${SLACK_WEBHOOK_URL}
    notify_on:
      - severity: critical
        always: true
      - severity: high
        threshold: 3  # notify if >= 3 high findings
      - status: blocked_input
        always: true

  teams:
    webhook_url: ${TEAMS_WEBHOOK_URL}
    notify_on:
      - severity: critical
        always: true
      - status: blocked_input
        always: true
```

### Slack Notification

```typescript
// src/notifications/slack.ts
interface SlackNotificationOptions {
  webhookUrl: string;
  findings: FindingsArtifact;
  readiness?: ReleaseReadinessArtifact;
  repoName: string;
  branch?: string;
}

async function sendSlackNotification(options: SlackNotificationOptions): Promise<void> {
  const criticalCount = options.findings.findings.filter(f => f.severity === "critical").length;
  const highCount = options.findings.findings.filter(f => f.severity === "high").length;

  const payload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `⚠️ code-to-gate Alert: ${options.repoName}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Critical:* ${criticalCount}` },
          { type: "mrkdwn", text: `*High:* ${highCount}` },
          { type: "mrkdwn", text: `*Total:* ${options.findings.findings.length}` },
          { type: "mrkdwn", text: `*Status:* ${options.readiness?.status || "needs_review"}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Branch:* ${options.branch || "unknown"}\n*Action:* Review findings before merge`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Report" },
            url: options.reportUrl,
          },
        ],
      },
    ],
  };

  const response = await fetch(options.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook error: ${response.status}`);
  }
}
```

### Teams Notification

```typescript
// src/notifications/teams.ts
interface TeamsNotificationOptions {
  webhookUrl: string;
  findings: FindingsArtifact;
  readiness?: ReleaseReadinessArtifact;
  repoName: string;
}

async function sendTeamsNotification(options: TeamsNotificationOptions): Promise<void> {
  const criticalCount = options.findings.findings.filter(f => f.severity === "critical").length;

  const payload = {
    type: "MessageCard",
    context: "http://schema.org/extensions",
    themeColor: criticalCount > 0 ? "FF0000" : "FFA500",
    summary: `code-to-gate findings for ${options.repoName}`,
    sections: [
      {
        activityTitle: "code-to-gate Analysis Results",
        activitySubtitle: options.repoName,
        facts: [
          { name: "Critical", value: String(criticalCount) },
          { name: "High", value: String(options.findings.findings.filter(f => f.severity === "high").length) },
          { name: "Status", value: options.readiness?.status || "needs_review" },
        ],
        markdown: true,
      },
    ],
    potentialAction: [
      {
        "@type": "OpenUri",
        name: "View Report",
        targets: [{ os: "default", uri: options.reportUrl }],
      },
    ],
  };

  const response = await fetch(options.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Teams webhook error: ${response.status}`);
  }
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/notifications/slack.ts` | Create | Slack integration |
| `src/notifications/teams.ts` | Create | Teams integration |
| `src/notifications/index.ts` | Create | Notification coordinator |
| `src/cli/notify.ts` | Create | CLI command |
| `docs/notification-setup.md` | Create | Documentation |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| Slack webhook | External | Required |
| Teams webhook | External | Required |
| HTTP client | Node.js | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Slack notification sent | Message appears in Slack | Manual |
| Teams notification sent | Card appears in Teams | Manual |
| Severity filtering works | Only configured severities notify | Automated |
| Webhook errors handled | Graceful failure on webhook error | Automated |

---

## 8. Test Plan

### Unit Tests
```typescript
describe("slack-notification", () => {
  it("should format critical findings", () => {
    const payload = formatSlackPayload(mockFindings);
    expect(payload.blocks[1].fields[0].text).toContain("Critical: 2");
  });
});
```

### Integration Test
1. Set up Slack webhook URL
2. Run analysis with critical findings
3. Verify notification appears in Slack channel

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Webhook URL exposure | Medium | High | Use environment variables |
| Notification spam | Medium | Medium | Threshold configuration |
| API format changes | Low | Medium | Version locking |

---

## 10. References

| Reference | Path |
|---|---|
| Slack API | https://api.slack.com/messaging/webhooks |
| Teams API | https://docs.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/ |
| Findings artifact | `src/types/artifacts.ts` |