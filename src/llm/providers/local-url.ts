/**
 * Local URL helpers for localhost-only LLM providers.
 */

const ALLOWED_HOSTS = ["127.0.0.1", "localhost", "::1", "0.0.0.0"] as const;
const CONNECTABLE_LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"] as const;

export const ALLOWED_LOCALHOST_LABEL = ALLOWED_HOSTS.join(", ");

function normalizeHostname(hostname: string): string {
  const normalized = hostname.toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

function formatHostname(hostname: string): string {
  return hostname === "::1" ? "[::1]" : hostname;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildUrlWithHost(parsedUrl: URL, hostname: string): string {
  const auth = parsedUrl.username || parsedUrl.password
    ? `${parsedUrl.username}${parsedUrl.password ? `:${parsedUrl.password}` : ""}@`
    : "";
  const port = parsedUrl.port ? `:${parsedUrl.port}` : "";
  return `${parsedUrl.protocol}//${auth}${formatHostname(hostname)}${port}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
}

/**
 * Validate that a URL is restricted to local loopback hosts.
 */
export function validateLocalhostUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ALLOWED_HOSTS.includes(normalizeHostname(parsedUrl.hostname) as typeof ALLOWED_HOSTS[number]);
  } catch {
    return false;
  }
}

/**
 * Return equivalent loopback URL candidates, preserving protocol, port, path and query.
 *
 * macOS can resolve localhost to IPv6 while a server is bound only to IPv4
 * or vice versa. Trying equivalent loopback forms keeps the local-only trust
 * boundary while making local LLM calls less brittle.
 */
export function getLoopbackUrlCandidates(url: string): string[] {
  const parsedUrl = new URL(url);
  const hostname = normalizeHostname(parsedUrl.hostname);

  if (!ALLOWED_HOSTS.includes(hostname as typeof ALLOWED_HOSTS[number])) {
    throw new Error(
      `Local LLM providers only allow localhost communication. ` +
        `Got: ${hostname}. Allowed: ${ALLOWED_LOCALHOST_LABEL}`
    );
  }

  const candidates = hostname === "127.0.0.1"
    ? [hostname]
    : [hostname, ...CONNECTABLE_LOOPBACK_HOSTS].filter(
        (candidate, index, values) => values.indexOf(candidate) === index
      );

  return candidates.map((candidate) => buildUrlWithHost(parsedUrl, candidate));
}

export function getLoopbackBaseUrlCandidates(baseUrl: string): string[] {
  return getLoopbackUrlCandidates(trimTrailingSlash(baseUrl)).map(trimTrailingSlash);
}

export function appendLocalPath(baseUrl: string, endpointPath: string): string {
  return `${trimTrailingSlash(baseUrl)}/${endpointPath.replace(/^\/+/, "")}`;
}
