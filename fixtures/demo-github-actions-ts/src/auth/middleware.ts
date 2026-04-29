/**
 * Authentication Middleware
 *
 * Contains WEAK_AUTH_GUARD patterns for testing.
 */

import { Request, Response, NextFunction } from "express";

/**
 * JWT token verification middleware
 *
 * WEAK_AUTH_GUARD: Token verification is basic - no expiration check,
 * no signature verification in this stub.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Missing authentication token" });
    return;
  }

  // WEAK_AUTH_GUARD: In real implementation should verify JWT signature
  // This stub just decodes without verification
  try {
    const decoded = decodeToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    // TRY_CATCH_SWALLOW: Error not properly logged/handled
    res.status(403).json({ error: "Invalid token" });
  }
}

/**
 * Role-based authorization middleware
 *
 * WEAK_AUTH_GUARD: Role check is string-based, no actual permission verification
 */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void {
    const user = req.user as { role?: string } | undefined;

    if (!user || user.role !== role) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    // No additional verification of role validity
    next();
  };
}

/**
 * Stub token decoder
 *
 * WEAK_AUTH_GUARD: Should verify signature, check expiration, validate claims
 */
function decodeToken(token: string): { id: string; role: string } {
  // In real implementation, would verify JWT signature
  // This is a stub that just returns a mock user
  if (token === "valid-token") {
    return { id: "user-001", role: "user" };
  }
  if (token === "admin-token") {
    return { id: "admin-001", role: "admin" };
  }
  throw new Error("Invalid token");
}

/**
 * Environment variable direct access - ENV_DIRECT_ACCESS
 *
 * RISK: Accessing secrets directly from env without validation
 */
export function getJwtSecret(): string {
  // ENV_DIRECT_ACCESS: No validation of secret presence or format
  return process.env.JWT_SECRET || "default-secret"; // Weak fallback
}