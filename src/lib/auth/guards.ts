import { getDb } from "@/lib/db/client";
import { findUserById } from "@/lib/services/users";
import { ApiError } from "@/lib/api/errors";
import { verifyAccessToken, type Role } from "./jwt";
import { ACCESS_COOKIE, readCookie } from "./cookies";

export type Session = {
  userId: number;
  role: Role;
};

export function extractAccessToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    return token.length > 0 ? token : null;
  }
  return readCookie(req, ACCESS_COOKIE);
}

export async function requireAuth(req: Request): Promise<Session> {
  const token = extractAccessToken(req);
  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
  }

  const claims = await verifyAccessToken(token);

  // Re-check the account so deactivation and role changes take effect
  // immediately instead of waiting for the access token to expire.
  const user = await findUserById(getDb(), claims.userId);
  if (!user || !user.isActive) {
    throw new ApiError(401, "ACCOUNT_DISABLED", "Account is missing or disabled");
  }

  return { userId: user.id, role: user.role };
}

export async function requireAdmin(req: Request): Promise<Session> {
  const session = await requireAuth(req);
  if (session.role !== "admin") {
    throw new ApiError(403, "FORBIDDEN", "Admin role required");
  }
  return session;
}