import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { ApiError } from "@/lib/api/errors";

const ISSUER = "stockpulse";
const AUDIENCE = "stockpulse-api";

export const ACCESS_TTL_SECONDS = 15 * 60;

export type Role = "admin" | "staff";

export type AccessTokenClaims = {
  userId: number;
  role: Role;
};

let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.AUTH_JWT_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("AUTH_JWT_SECRET must be set and at least 32 characters long");
  }
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

export async function signAccessToken(user: {
  id: number;
  role: Role;
}): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new ApiError(401, "INVALID_TOKEN", "Malformed access token subject");
    }
    if (payload.role !== "admin" && payload.role !== "staff") {
      throw new ApiError(401, "INVALID_TOKEN", "Malformed access token role");
    }

    return { userId, role: payload.role };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof joseErrors.JWTExpired) {
      throw new ApiError(401, "TOKEN_EXPIRED", "Access token has expired");
    }
    throw new ApiError(401, "INVALID_TOKEN", "Access token is invalid");
  }
}