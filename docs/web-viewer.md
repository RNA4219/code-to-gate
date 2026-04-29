# Web Viewer

The code-to-gate Web Viewer generates self-contained static HTML reports for viewing analysis results. No external dependencies are required - all CSS, JavaScript, and visualization logic are embedded in the output file.

## Overview

The Web Viewer provides:

- **Interactive Findings Explorer**: Filter, search, and expand findings by severity and category
- **Graph Visualization**: Mermaid-based code graph diagrams showing symbols, relations, and entrypoints
- **Dark Mode**: Toggle between light and dark themes
- **Collapsible Sections**: Expand/collapse findings, evidence, and risk details
- **Evidence Display**: Code snippets with line highlighting
- **Self-Contained Output**: Single HTML file with no external CDN dependencies

## CLI Usage

```bash
# Generate viewer from artifact directory
code-to-gate viewer --from .qh --out viewer-report.html

# Generate with custom title
code-to-gate viewer --from .qh --out report.html --title "My Project Analysis"

# Generate with dark mode default
code-to-gate viewer --from .qh --out report.html --dark
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--from <dir>` | Input artifact directory (required) | - |
| `--out <file>` | Output HTML file path | `viewer-report.html` |
| `--title <title>` | Report title | `code-to-gate Analysis Report` |
| `--dark` | Enable dark mode by default | Light mode |

## Input Artifacts

The viewer loads artifacts from the input directory:

| File | Description | Required |
|------|-------------|----------|
| `findings.json` | Findings artifact | Recommended |
| `risk-register.json` | Risk register artifact | Optional |
| `test-seeds.json` | Test seeds artifact | Optional |
| `release-readiness.json` | Release readiness artifact | Optional |
| `repo-graph.json` | Normalized repo graph | Optional |

## Report Sections

### Header

Displays metadata from the analysis run:

- Generated timestamp
- Run ID
- Repository root
- Tool version
- Dark mode toggle button

### Findings Tab

Interactive findings explorer with:

- **Dashboard Cards**: Severity counts (critical, high, medium, low, total)
- **Severity Distribution Chart**: Visual bar chart of findings by severity
- **Filter Toolbar**: Buttons to filter by severity and category
- **Search Input**: Text search across finding titles and summaries
- **Findings List**: Collapsible cards with evidence details

#### Finding Cards

Each finding displays:

- Severity badge (colored)
- Finding ID
- Title and summary
- Rule ID, category, and confidence score
- Affected symbols and entrypoints (when available)
- Evidence references with file paths and line numbers
- Tags (when available)

### Graph Tab

Mermaid-based visualization showing:

- **Flowchart View**: Symbols as nodes, relations as edges
- **Dependencies View**: File-level import relationships
- **Call Graph View**: Function-level call relationships

Graph features:

- Node shapes indicate symbol kind (function, class, method, etc.)
- Edge styles indicate relation kind (calls, imports, tests, etc.)
- Confidence labels on high-confidence relations
- Highlighted nodes for findings-related symbols
- Tab switching between different views

### Risks Tab

Risk register display with:

- Risk cards sorted by severity
- Title, severity, likelihood, and confidence
- Source finding references
- Narrative description
- Impact list
- Recommended actions

### Test Seeds Tab

Generated test seeds with:

- Priority badges (high, medium, low)
- Category labels (positive, negative, edge, security)
- Target file/function
- Expected outcome
- Source risk reference

### Readiness Tab

Release readiness assessment:

- Status badge (passed, needs_review, blocked)
- Metrics dashboard (findings counts, risks, test seeds)
- Summary description
- Blockers list (critical issues)
- Warnings list (review needed)
- Passed checks list

## Styling

### CSS Features

- CSS custom properties for colors
- Dark mode theme via `[data-theme="dark"]`
- Responsive design for mobile devices
- Print-friendly styles
- Animation classes for transitions

### Color Variables

```css
:root {
  --color-critical: #dc3545;   /* Red */
  --color-high: #fd7e14;       /* Orange */
  --color-medium: #ffc107;     /* Yellow */
  --color-low: #17a2b8;        /* Blue */
}
```

### Dark Mode

Toggle via the header button or set as default with `--dark` option. Dark mode uses:

- Dark background (#1a1a2e)
- Card backgrounds (#16213e)
- Adjusted text colors for readability
- Modified shadow styles

## JavaScript Interactivity

### Tab Navigation

Switch between tabs (Findings, Graph, Risks, Tests, Readiness) with:

```javascript
showTab(tabId);
```

### Theme Toggle

```javascript
toggleTheme();
```

### Collapsible Sections

```javascript
toggleSection(id);
toggleFinding(id);
toggleEvidence(id);
```

### Filtering

```javascript
filterFindings(filterType, value);
searchFindings(query);
```

## Graph Visualization

### Mermaid Diagrams

The viewer generates Mermaid flowchart syntax embedded in the HTML:

- Node shapes based on symbol kind
- Edge styles based on relation kind
- Class definitions for styling (highlighted, exported, entrypoint)
- Confidence labels on edges

### Embedded Renderer

The viewer includes a minimal JavaScript Mermaid renderer that:

- Parses flowchart syntax
- Generates SVG output
- Caches rendered diagrams
- Handles parse errors gracefully

## Programmatic Usage

```typescript
import {
  generateReportHtml,
  writeReportHtml,
  LoadedArtifacts,
  ReportViewerConfig,
} from "@quality-harness/code-to-gate/viewer";

const artifacts: LoadedArtifacts = {
  findings: findingsArtifact,
  riskRegister: riskRegisterArtifact,
  testSeeds: testSeedsArtifact,
  readiness: readinessArtifact,
  graph: repoGraph,
};

const config: ReportViewerConfig = {
  title: "My Analysis Report",
  showGraph: true,
  showTabs: true,
  darkModeDefault: false,
  showRiskRegister: true,
  showTestSeeds: true,
  showReadiness: true,
  findingsConfig: {
    showFilters: true,
    showSearch: true,
    collapsibleEvidence: true,
  },
};

// Generate HTML string
const html = generateReportHtml(artifacts, config);

// Write to file
writeReportHtml("./output/report.html", artifacts, config);
```

## Module Exports

### report-viewer.ts

| Export | Description |
|--------|-------------|
| `generateReportHtml()` | Generate complete HTML report string |
| `writeReportHtml()` | Write HTML report to file |
| `generateSimplifiedReport()` | Generate findings-only report without tabs |
| `LoadedArtifacts` | Type for loaded artifact collection |
| `ReportViewerConfig` | Configuration options type |

### graph-viewer.ts

| Export | Description |
|--------|-------------|
| `generateMermaidFlowchart()` | Generate flowchart diagram |
| `generateMermaidDependencyGraph()` | Generate dependency diagram |
| `generateMermaidCallGraph()` | Generate call graph diagram |
| `generateMermaidSequenceDiagram()` | Generate sequence diagram for entrypoint |
| `getMermaidJavaScript()` | Get embedded Mermaid renderer JS |
| `GraphViewerConfig` | Graph viewer configuration type |
| `GraphData` | Graph data input type |

### finding-viewer.ts

| Export | Description |
|--------|-------------|
| `generateFindingsExplorer()` | Generate full findings explorer HTML |
| `generateSeverityGroupedFindings()` | Generate severity-grouped section |
| `generateCategoryGroupedFindings()` | Generate category-grouped section |
| `sortFindingsBySeverity()` | Sort findings by severity order |
| `filterFindingsBySeverity()` | Filter by severity level |
| `filterFindingsByCategory()` | Filter by category |
| `searchFindings()` | Search findings by text |
| `countBySeverity()` | Count findings per severity |
| `countByCategory()` | Count findings per category |
| `getSeverityOrder()` | Get severity order number |

### styles.ts

| Export | Description |
|--------|-------------|
| `getBaseStyles()` | Get base CSS styles |
| `getMermaidStyles()` | Get Mermaid-specific styles |
| `getAllStyles()` | Get combined styles |

## Testing

Run viewer tests with:

```bash
npm run test src/viewer
```

Test coverage includes:

- HTML document structure validation
- CSS and JavaScript embedding
- Dark mode configuration
- Findings explorer functionality
- Graph diagram generation
- Edge cases (empty artifacts, special characters, unicode)

## Future Enhancements

Phase 3 planned features:

- Evidence with actual code content (file reading)
- Graph zoom and pan controls
- Export findings as CSV/JSON
- Custom theme configuration
- Sidebar navigation for large reports
- Keyboard shortcuts for navigation
- Full Mermaid library integration for advanced diagrams