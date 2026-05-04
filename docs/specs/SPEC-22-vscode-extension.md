# SPEC-22: VS Code Extension

**Version**: v1.0
**Created**: 2026-05-04
**Status**: draft
**Priority**: P2
**Estimated Time**: 2 weeks

---

## 1. Purpose

Create a VS Code extension for viewing code-to-gate findings directly in the IDE.

---

## 2. Scope

### Included
- VS Code extension API integration
- Finding decorations in editor
- Quick access to finding details
- Run analysis from VS Code

### Excluded
- Real-time background analysis (optional feature)
- VS Code marketplace publishing (future)
- Other IDE extensions (JetBrains, etc.)

---

## 3. Current State

**Status**: No IDE extension

**Current Workflow**: CLI → artifact → HTML viewer

**Need**: Developers want inline finding display.

---

## 4. Proposed Implementation

### Extension Structure

```
vscode-code-to-gate/
├── src/
│   ├── extension.ts           // Main entry
│   ├── analyzer.ts            // Analysis runner
│   ├── decorations.ts         // Editor decorations
│   ├── treeView.ts            // Sidebar tree view
│   ├── commands.ts            // VS Code commands
│   └── utils.ts               // Utilities
├── package.json               // Extension manifest
├── tsconfig.json
└── README.md
```

### Extension Manifest

```json
// package.json
{
  "name": "code-to-gate",
  "displayName": "code-to-gate",
  "description": "Quality analysis findings in VS Code",
  "version": "0.1.0",
  "publisher": "RNA4219",
  "engines": { "vscode": "^1.80.0" },
  "activationEvents": [
    "onCommand:codeToGate.analyze",
    "onLanguage:typescript",
    "onLanguage:javascript"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      { "command": "codeToGate.analyze", "title": "Run code-to-gate analysis" },
      { "command": "codeToGate.showFindings", "title": "Show findings sidebar" }
    ],
    "viewsContainers": {
      "activitybar": [
        { "id": "codeToGate", "title": "code-to-gate", "icon": "icon.svg" }
      ]
    },
    "views": {
      "codeToGate": [
        { "id": "findings", "name": "Findings" }
      ]
    }
  }
}
```

### Editor Decorations

```typescript
// decorations.ts
const decorationTypes = {
  critical: vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 0, 0, 0.3)",
    border: "1px solid red",
    overviewRulerColor: "red",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  }),
  high: vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 165, 0, 0.3)",
    border: "1px solid orange",
    overviewRulerColor: "orange",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  }),
  medium: vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 255, 0, 0.2)",
    border: "1px solid yellow",
  }),
  low: vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(0, 255, 0, 0.1)",
  }),
};

function applyDecorations(editor: vscode.TextEditor, findings: Finding[]) {
  const decorationsBySeverity: Record<string, vscode.Range[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };

  for (const finding of findings) {
    const evidence = finding.evidence[0];
    if (evidence?.path === editor.document.uri.fsPath) {
      const range = new vscode.Range(
        evidence.startLine - 1, 0,
        evidence.endLine - 1, editor.document.lineAt(evidence.endLine - 1).text.length
      );
      decorationsBySeverity[finding.severity].push(range);
    }
  }

  for (const [severity, ranges] of Object.entries(decorationsBySeverity)) {
    editor.setDecorations(decorationTypes[severity], ranges);
  }
}
```

### Tree View

```typescript
// treeView.ts
class FindingsTreeDataProvider implements vscode.TreeDataProvider<FindingItem> {
  private findings: Finding[] = [];

  getTreeItem(element: FindingItem): vscode.TreeItem {
    return {
      label: `${element.finding.ruleId}: ${element.finding.summary.slice(0, 50)}`,
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      iconPath: this.getSeverityIcon(element.finding.severity),
      command: {
        command: "codeToGate.openFinding",
        arguments: [element.finding],
      },
    };
  }

  getChildren(element?: FindingItem): vscode.ProviderResult<FindingItem[]> {
    if (!element) {
      // Root: group by severity
      return ["critical", "high", "medium", "low"]
        .filter(s => this.findings.some(f => f.severity === s))
        .map(s => new FindingItem({ severity: s, count: this.findings.filter(f => f.severity === s).length }));
    }
    // Children: findings in severity
    return this.findings
      .filter(f => f.severity === element.severity)
      .map(f => new FindingItem(f));
  }
}
```

---

## 5. Technical Design

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `vscode-code-to-gate/src/extension.ts` | Create | Entry point |
| `vscode-code-to-gate/src/decorations.ts` | Create | Editor styling |
| `vscode-code-to-gate/src/treeView.ts` | Create | Sidebar |
| `vscode-code-to-gate/package.json` | Create | Manifest |
| `vscode-code-to-gate/README.md` | Create | Documentation |

---

## 6. Dependencies

| Dependency | Type | Status |
|---|---|:---:|
| VS Code Extension API | npm | Active |
| code-to-gate CLI | External | Active |

---

## 7. Acceptance Criteria

| Criterion | Measurable | Verification |
|---|---|---|
| Findings displayed in editor | Decorations visible | Manual |
| Tree view shows findings | Sidebar populated | Manual |
| Run analysis command works | CLI executes | Manual |
| Severity colors correct | Critical = red | Manual |

---

## 8. Test Plan

### Extension Tests
```typescript
describe("extension", () => {
  it("should register commands", () => {
    const commands = vscode.extensions.getExtension("codeToGate").packageJSON.contributes.commands;
    expect(commands.length).toBeGreaterThan(0);
  });

  it("should apply decorations", () => {
    const editor = vscode.window.activeTextEditor;
    applyDecorations(editor, mockFindings);
    // Verify decorations applied
  });
});
```

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| VS Code API changes | Low | Medium | Version targeting |
| Performance on large files | Medium | Medium | Lazy decoration |
| Extension marketplace approval | Medium | Low | Follow guidelines |

---

## 10. References

| Reference | Path |
|---|---|
| VS Code Extension API | https://code.visualstudio.com/api |
| Decoration types | VS Code TextEditorDecorationType |
| Current viewer | `src/viewer/*.ts` |