/**
 * Reporters - exports for code-to-gate artifact generation
 */

export {
  buildFindingsFromGraph,
  writeFindingsJson,
  createArtifactHeader,
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