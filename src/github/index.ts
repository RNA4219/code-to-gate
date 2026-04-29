/**
 * GitHub Integration Module for code-to-gate
 *
 * Exports PR comment generation and Checks API integration.
 */

// API Client
export {
  GitHubApiClient,
  GitHubApiError,
  createGitHubClientFromEnv,
  type GitHubAuthConfig,
  type GitHubClientConfig,
  type CheckRunOptions,
  type CheckOutput,
  type CheckAnnotation,
  type CheckAction,
  type CheckImage,
  type GitHubComment,
  type GitHubRepoInfo,
} from "./api-client.js";

// PR Comment
export {
  generatePrComment,
  buildTemplateData,
  renderPrCommentTemplate,
  DEFAULT_PR_COMMENT_TEMPLATE,
  type PrCommentOptions,
  type PrCommentTemplateData,
  type FindingSummary,
} from "./pr-comment.js";

// Checks
export {
  createCheckRun,
  createInProgressCheckRun,
  updateCheckRunWithResults,
  createFailedCheckRun,
  createNeutralCheckRun,
  type ChecksOptions,
  type ChecksResult,
} from "./checks.js";

/**
 * Convenience function to post PR comment and create checks
 */
export async function postGithubIntegration(
  client: import("./api-client.js").GitHubApiClient,
  pullNumber: number,
  headSha: string,
  findings: import("../types/artifacts.js").FindingsArtifact,
  options?: {
    riskRegister?: import("../types/artifacts.js").RiskRegisterArtifact;
    testSeeds?: import("../types/artifacts.js").TestSeedsArtifact;
    readiness?: import("../types/artifacts.js").ReleaseReadinessArtifact;
    artifactUrl?: string;
    checkRunName?: string;
  }
): Promise<{ commentId: number; checkRunId: number }> {
  // Import types locally to avoid circular dependencies
  const { generatePrComment } = await import("./pr-comment.js");
  const { createCheckRun } = await import("./checks.js");

  // Generate and post PR comment
  const commentBody = generatePrComment({
    findings,
    riskRegister: options?.riskRegister,
    testSeeds: options?.testSeeds,
    readiness: options?.readiness,
    artifactUrl: options?.artifactUrl,
  });

  const commentId = await client.createOrUpdateComment(pullNumber, commentBody);

  // Create check run
  const checkResult = await createCheckRun({
    client,
    headSha,
    findings,
    readiness: options?.readiness,
    name: options?.checkRunName,
  });

  return {
    commentId,
    checkRunId: checkResult.checkRunId,
  };
}