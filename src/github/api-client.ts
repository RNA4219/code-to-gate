/**
 * GitHub API Client Wrapper for code-to-gate
 *
 * Supports GitHub App and PAT authentication for PR comments and Checks API.
 * Uses native fetch for minimal dependencies.
 */

/**
 * Authentication configuration for GitHub API
 */
export interface GitHubAuthConfig {
  /** GitHub App authentication */
  app?: {
    appId: number | string;
    privateKey: string;
    installationId?: number;
  };
  /** Personal Access Token authentication */
  token?: string;
}

/**
 * GitHub API client configuration
 */
export interface GitHubClientConfig extends GitHubAuthConfig {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Base URL for GitHub API (default: https://api.github.com) */
  baseUrl?: string;
}

/**
 * GitHub API client for code-to-gate integration
 */
export class GitHubApiClient {
  private owner: string;
  private repo: string;
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(config: GitHubClientConfig) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.baseUrl = config.baseUrl || "https://api.github.com";

    // Store token if provided directly
    if (config.token) {
      this.authToken = config.token;
    }
  }

  /**
   * Create a GitHub API client with authentication
   */
  static async create(config: GitHubClientConfig): Promise<GitHubApiClient> {
    const client = new GitHubApiClient(config);

    // If using GitHub App, would need JWT handling
    // For now, we support PAT only for simplicity
    if (config.app && !config.token) {
      // Note: GitHub App authentication requires JWT generation
      // which needs additional crypto libraries. For simplicity,
      // we recommend using PAT for most cases.
      throw new GitHubApiError(
        "GitHub App authentication requires JWT handling. Use PAT or implement JWT generation.",
        null
      );
    }

    return client;
  }

  /**
   * Get authorization header for requests
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "user-agent": "code-to-gate",
      accept: "application/vnd.github.v3+json",
    };

    if (this.authToken) {
      headers.authorization = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  /**
   * Make a GitHub API request
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = this.getAuthHeaders();
    if (body) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new GitHubApiError(
        `GitHub API error: ${response.status} ${response.statusText}`,
        { status: response.status, body: errorBody }
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create a PR comment
   * @param pullNumber PR number
   * @param body Comment body (markdown)
   * @returns Comment ID
   */
  async createComment(pullNumber: number, body: string): Promise<number> {
    try {
      const response = await this.request<{ id: number }>(
        "POST",
        `/repos/${this.owner}/${this.repo}/issues/${pullNumber}/comments`,
        { body }
      );

      return response.id;
    } catch (error) {
      throw new GitHubApiError("Failed to create PR comment", error);
    }
  }

  /**
   * Update an existing PR comment
   * @param commentId Comment ID to update
   * @param body New comment body (markdown)
   */
  async updateComment(commentId: number, body: string): Promise<void> {
    try {
      await this.request(
        "PATCH",
        `/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`,
        { body }
      );
    } catch (error) {
      throw new GitHubApiError("Failed to update PR comment", error);
    }
  }

  /**
   * Get comments on a PR
   * @param pullNumber PR number
   * @returns List of comments
   */
  async getComments(pullNumber: number): Promise<GitHubComment[]> {
    try {
      const response = await this.request<
        Array<{ id: number; user?: { login: string }; body?: string; created_at: string }>
      >(
        "GET",
        `/repos/${this.owner}/${this.repo}/issues/${pullNumber}/comments`
      );

      return response.map((comment) => ({
        id: comment.id,
        user: comment.user?.login || "unknown",
        body: comment.body || "",
        createdAt: comment.created_at,
      }));
    } catch (error) {
      throw new GitHubApiError("Failed to get PR comments", error);
    }
  }

  /**
   * Find existing code-to-gate comment on a PR
   * @param pullNumber PR number
   * @returns Comment ID if found, null otherwise
   */
  async findExistingComment(pullNumber: number): Promise<number | null> {
    const comments = await this.getComments(pullNumber);

    // Look for comment with code-to-gate header
    for (const comment of comments) {
      if (
        comment.body.includes("## code-to-gate Analysis") ||
        comment.body.includes("code-to-gate Analysis")
      ) {
        return comment.id;
      }
    }

    return null;
  }

  /**
   * Create or update PR comment (handles re-runs)
   * @param pullNumber PR number
   * @param body Comment body (markdown)
   * @returns Comment ID
   */
  async createOrUpdateComment(pullNumber: number, body: string): Promise<number> {
    const existingId = await this.findExistingComment(pullNumber);

    if (existingId) {
      await this.updateComment(existingId, body);
      return existingId;
    }

    return this.createComment(pullNumber, body);
  }

  /**
   * Create a Check run
   * @param name Check run name
   * @param status Status (queued, in_progress, completed)
   * @param options Additional options (conclusion, output, etc.)
   * @returns Check run ID
   */
  async createCheckRun(
    name: string,
    status: "queued" | "in_progress" | "completed",
    options?: CheckRunOptions
  ): Promise<number> {
    try {
      const body: Record<string, unknown> = {
        name,
        status,
        head_sha: options?.headSha,
      };

      if (options?.conclusion) {
        body.conclusion = options.conclusion;
      }
      if (options?.completedAt) {
        body.completed_at = options.completedAt;
      }
      if (options?.startedAt) {
        body.started_at = options.startedAt;
      }
      if (options?.output) {
        body.output = {
          title: options.output.title,
          summary: options.output.summary,
          text: options.output.text,
          annotations: options.output.annotations,
        };
      }
      if (options?.actions) {
        body.actions = options.actions;
      }

      const response = await this.request<{ id: number }>(
        "POST",
        `/repos/${this.owner}/${this.repo}/check-runs`,
        body
      );

      return response.id;
    } catch (error) {
      throw new GitHubApiError("Failed to create check run", error);
    }
  }

  /**
   * Update a Check run
   * @param checkRunId Check run ID
   * @param options Update options (status, conclusion, output, etc.)
   */
  async updateCheckRun(
    checkRunId: number,
    options: Partial<CheckRunOptions>
  ): Promise<void> {
    try {
      const body: Record<string, unknown> = {};

      if (options.status) {
        body.status = options.status;
      }
      if (options.conclusion) {
        body.conclusion = options.conclusion;
      }
      if (options.completedAt) {
        body.completed_at = options.completedAt;
      }
      if (options.output) {
        body.output = {
          title: options.output.title,
          summary: options.output.summary,
          text: options.output.text,
          annotations: options.output.annotations,
        };
      }
      if (options.actions) {
        body.actions = options.actions;
      }

      await this.request(
        "PATCH",
        `/repos/${this.owner}/${this.repo}/check-runs/${checkRunId}`,
        body
      );
    } catch (error) {
      throw new GitHubApiError("Failed to update check run", error);
    }
  }

  /**
   * Add annotations to a Check run
   * @param checkRunId Check run ID
   * @param annotations Annotations to add
   */
  async addAnnotations(
    checkRunId: number,
    annotations: CheckAnnotation[]
  ): Promise<void> {
    await this.updateCheckRun(checkRunId, {
      output: {
        title: "Analysis Details",
        summary: "Individual findings with annotations",
        annotations,
      },
    });
  }

  /**
   * Get repository info
   */
  async getRepoInfo(): Promise<GitHubRepoInfo> {
    try {
      const response = await this.request<{
        full_name: string;
        default_branch: string;
        private: boolean;
      }>(
        "GET",
        `/repos/${this.owner}/${this.repo}`
      );

      return {
        fullName: response.full_name,
        defaultBranch: response.default_branch,
        private: response.private,
      };
    } catch (error) {
      throw new GitHubApiError("Failed to get repository info", error);
    }
  }
}

/**
 * Check run options
 */
export interface CheckRunOptions {
  headSha?: string;
  status?: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required";
  completedAt?: string;
  output?: CheckOutput;
  actions?: CheckAction[];
  startedAt?: string;
}

/**
 * Check run output
 */
export interface CheckOutput {
  title: string;
  summary: string;
  text?: string;
  annotations?: CheckAnnotation[];
  images?: CheckImage[];
}

/**
 * Check annotation
 */
export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "notice" | "warning" | "failure";
  message: string;
  title?: string;
  raw_details?: string;
  start_column?: number;
  end_column?: number;
}

/**
 * Check action button
 */
export interface CheckAction {
  label: string;
  description: string;
  identifier: string;
}

/**
 * Check image
 */
export interface CheckImage {
  alt: string;
  image_url: string;
  caption?: string;
}

/**
 * GitHub comment
 */
export interface GitHubComment {
  id: number;
  user: string;
  body: string;
  createdAt: string;
}

/**
 * Repository info
 */
export interface GitHubRepoInfo {
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

/**
 * GitHub API error wrapper
 */
export class GitHubApiError extends Error {
  constructor(message: string, public readonly cause: unknown) {
    super(message);
    this.name = "GitHubApiError";
  }
}

/**
 * Create GitHub client from environment variables
 */
export async function createGitHubClientFromEnv(
  owner: string,
  repo: string
): Promise<GitHubApiClient | null> {
  // Check for PAT
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    return GitHubApiClient.create({
      owner,
      repo,
      token,
    });
  }

  // Check for GitHub App
  const appId = process.env.GITHUB_APP_ID;
  const appKey = process.env.GITHUB_APP_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (appId && appKey) {
    try {
      return GitHubApiClient.create({
        owner,
        repo,
        app: {
          appId,
          privateKey: appKey,
          installationId: installationId ? parseInt(installationId, 10) : undefined,
        },
      });
    } catch (error) {
      // GitHub App auth requires JWT - return null and log warning
      console.warn("GitHub App authentication requires JWT implementation. Use GITHUB_TOKEN instead.");
      return null;
    }
  }

  // No authentication available
  return null;
}