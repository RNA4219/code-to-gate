import type { User } from "../db/orders";

/**
 * Authentication guard module.
 *
 * SMELL: WEAK_AUTH_GUARD
 * This guard only checks for the presence of an Authorization header
 * without validating the token signature, expiration, or claims.
 */
export function requireUser(authorization: string | undefined): User {
  // SMELL: WEAK_AUTH_GUARD - Lines 17-19
  // Only checks for header presence, no token validation:
  // - No JWT signature verification
  // - No token expiration check
  // - No role/permission validation
  // - No session verification
  if (!authorization) {
    throw new Error("missing authorization header");
  }

  // Returns a synthetic user without any authentication
  // An attacker can pass any non-empty Authorization header
  // to gain access as a "authenticated" user.
  return { id: "synthetic-user", role: "user" };
}

/**
 * Check if user has admin role.
 * NOTE: This function exists but is never used in the admin routes.
 */
export function requireAdmin(user: User): void {
  if (user.role !== "admin") {
    throw new Error("admin access required");
  }
}