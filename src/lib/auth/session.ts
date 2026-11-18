import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { refreshTokens, users } from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/client";
import { ApiError } from "@/lib/api/errors";
import type { Role } from "./jwt";
import { REFRESH_TTL_SECONDS } from "./cookies";

export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function insertRefreshToken(
  db: DbOrTx,
  userId: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashRefreshToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export async function revokeAllUserTokens(
  db: DbOrTx,
  userId: number,
): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function revokeRefreshToken(
  db: DbOrTx,
  presented: string,
): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.tokenHash, hashRefreshToken(presented)),
        isNull(refreshTokens.revokedAt),
      ),
    );
}

export async function deleteExpiredUserTokens(
  db: DbOrTx,
  userId: number,
): Promise<void> {
  await db
    .delete(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), lt(refreshTokens.expiresAt, new Date())));
}

export type RotatedSession = {
  userId: number;
  role: Role;
  token: string;
  expiresAt: Date;
};

export async function rotateRefreshToken(
  db: DbOrTx,
  presented: string,
): Promise<RotatedSession> {
  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashRefreshToken(presented)))
    .limit(1);
  const row = rows[0];

  if (!row) {
    throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid");
  }
  if (row.revokedAt !== null) {
    // Reuse of a rotated token means it was stolen — kill every session.
    await revokeAllUserTokens(db, row.userId);
    throw new ApiError(
      401,
      "REFRESH_REUSED",
      "Refresh token reuse detected; all sessions were revoked",
    );
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(401, "REFRESH_EXPIRED", "Refresh token has expired");
  }

  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  const user = userRows[0];
  if (!user || !user.isActive) {
    throw new ApiError(401, "ACCOUNT_DISABLED", "Account is missing or disabled");
  }

  // Conditional revoke closes the race between two concurrent refresh calls:
  // exactly one winner flips revoked_at; the loser sees 0 affected rows.
  const [result] = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)));
  if (result.affectedRows !== 1) {
    await revokeAllUserTokens(db, row.userId);
    throw new ApiError(
      401,
      "REFRESH_REUSED",
      "Refresh token reuse detected; all sessions were revoked",
    );
  }

  const next = await insertRefreshToken(db, user.id);
  return { userId: user.id, role: user.role, ...next };
}