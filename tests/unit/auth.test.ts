import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  signAccessToken,
  verifyAccessToken,
  ACCESS_TTL_SECONDS,
} from "@/lib/auth/jwt";
import {
  generateRefreshToken,
  hashRefreshToken,
} from "@/lib/auth/session";
import { readCookie } from "@/lib/auth/cookies";
import { extractAccessToken } from "@/lib/auth/guards";
import { toPublicUser } from "@/lib/services/users";
import { ApiError } from "@/lib/api/errors";
import type { User } from "@/lib/db/schema";

const TEST_SECRET = "unit-test-secret-0123456789abcdef0123456789abcdef";

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = TEST_SECRET;
});

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("Sup3r-Secret!");
    expect(hash).not.toBe("Sup3r-Secret!");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("Sup3r-Secret!", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Sup3r-Secret!");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces different hashes for the same password (salt)", async () => {
    const a = await hashPassword("Sup3r-Secret!");
    const b = await hashPassword("Sup3r-Secret!");
    expect(a).not.toBe(b);
  });
});

describe("access JWT", () => {
  it("signs and verifies a token with 15 minute TTL", async () => {
    expect(ACCESS_TTL_SECONDS).toBe(900);
    const token = await signAccessToken({ id: 42, role: "admin" });
    const claims = await verifyAccessToken(token);
    expect(claims).toEqual({ userId: 42, role: "admin" });
  });

  it("rejects a tampered token", async () => {
    const token = await signAccessToken({ id: 42, role: "staff" });
    const tampered = `${token.slice(0, -4)}AAAA`;
    await expect(verifyAccessToken(tampered)).rejects.toMatchObject({
      status: 401,
      code: "INVALID_TOKEN",
    });
  });

  it("rejects an expired token with TOKEN_EXPIRED", async () => {
    const expired = await new SignJWT({ role: "staff" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("42")
      .setIssuer("stockpulse")
      .setAudience("stockpulse-api")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(TEST_SECRET));
    await expect(verifyAccessToken(expired)).rejects.toMatchObject({
      status: 401,
      code: "TOKEN_EXPIRED",
    });
  });

  it("rejects a token signed with the wrong secret", async () => {
    const foreign = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("1")
      .setIssuer("stockpulse")
      .setAudience("stockpulse-api")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("another-secret-0123456789abcdef0123456789abcdef"));
    await expect(verifyAccessToken(foreign)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("refresh token primitives", () => {
  it("generates 64-char hex tokens", () => {
    const token = generateRefreshToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(generateRefreshToken()).not.toBe(token);
  });

  it("hashes deterministically to 64-char hex", () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).toBe(hash);
    expect(hashRefreshToken(generateRefreshToken())).not.toBe(hash);
  });
});

describe("token extraction", () => {
  it("prefers the Authorization header", () => {
    const req = new Request("http://localhost/api/auth/me", {
      headers: { authorization: "Bearer abc123", cookie: "sp_access=cookie-token" },
    });
    expect(extractAccessToken(req)).toBe("abc123");
  });

  it("falls back to the access cookie", () => {
    const req = new Request("http://localhost/api/auth/me", {
      headers: { cookie: "other=1; sp_access=cookie-token; more=2" },
    });
    expect(extractAccessToken(req)).toBe("cookie-token");
  });

  it("returns null when nothing is present", () => {
    const req = new Request("http://localhost/api/auth/me");
    expect(extractAccessToken(req)).toBeNull();
    expect(readCookie(req, "sp_access")).toBeNull();
  });
});

describe("public user serialization", () => {
  it("strips password_hash and emits snake_case ISO dates", () => {
    const now = new Date("2026-11-18T00:00:00.000Z");
    const user: User = {
      id: 7,
      name: "Asha Menon",
      email: "admin@stockpulse.dev",
      passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
      role: "admin",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const pub = toPublicUser(user);
    expect(pub).toEqual({
      id: 7,
      name: "Asha Menon",
      email: "admin@stockpulse.dev",
      role: "admin",
      is_active: true,
      created_at: "2026-11-18T00:00:00.000Z",
      updated_at: "2026-11-18T00:00:00.000Z",
    });
    expect(JSON.stringify(pub)).not.toContain("password");
  });
});