/**
 * Reporters - exports for code-to-gate artifact generation
 *
 * Reporters handle artifact formatting and file I/O only.
 * Rule evaluation is in application layer - import directly from application/rule-evaluator.ts
 */

export {
  writeFindingsJson,
  domainTagForFinding,
  falsePositiveReviewTags,
  escapeMarkdownCell,
} from "./json-reporter.js";

export {
  buildRiskRegisterFromFindings,
  writeRiskRegisterYaml,
} from "./yaml-reporter.js";

export {
  generateAnalysisReport,
  writeAnalysisReportMd,
} from "./markdown-reporter.js";

export {
  generateSarifReport,
  writeSarifReport,
  generateFullSarifReport,
  type SarifLog,
  type SarifResult,
  type SarifRun,
  type SarifRule,
  type SarifLocation,
  type SarifMessage,
} from "./sarif-reporter.js";

export {
  generateHtmlReport,
  writeHtmlReport,
} from "./html-reporter.js";

export {
  generateSelfAnalysisDebtArtifact,
  writeSelfAnalysisDebtJson,
  type SelfAnalysisDebtArtifact,
} from "./self-analysis-debt-reporter.js";