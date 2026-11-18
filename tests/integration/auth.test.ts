import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as refresh } from "@/app/api/auth/refresh/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const BASE = "http://localhost:3000";

const staffPayload = {
  name: "Test Staff",
  email: "staff@test.dev",
  password: "staff-password-1",
};

function post(path: string, body?: unknown, headers?: Record<string, string>) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .join("; ");
}

function cookieValue(res: Response, name: string): string {
  const entry = res.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${name}=`));
  if (!entry) throw new Error(`Cookie ${name} not set`);
  return (entry.split(";")[0] ?? "").slice(name.length + 1);
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("auth flow", () => {
  it("registers a staff user, sets secure cookies, never leaks the hash", async () => {
    const res = await register(post("/api/auth/register", staffPayload));
    expect(res.status).toBe(201);
    const body = await json(res);
    const user = body.user as Record<string, unknown>;
    expect(user.email).toBe(staffPayload.email);
    expect(user.role).toBe("staff");
    expect(body.access_token).toBeTypeOf("string");
    expect(body.refresh_token).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain("password");

    const setCookies = res.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("sp_access=") && c.includes("HttpOnly"))).toBe(true);
    const refreshCookie = setCookies.find((c) => c.startsWith("sp_refresh="));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("Path=/api/auth");
    expect(refreshCookie).toContain("SameSite=lax");
  });

  it("ignores a role escalation attempt in the register body", async () => {
    const res = await register(
      post("/api/auth/register", { ...staffPayload, role: "admin" }),
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect((body.user as Record<string, unknown>).role).toBe("staff");
  });

  it("rejects duplicate emails with 409", async () => {
    await register(post("/api/auth/register", staffPayload));
    const res = await register(post("/api/auth/register", staffPayload));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatchObject({ code: "EMAIL_EXISTS" });
  });

  it("rejects invalid payloads with 400 and malformed JSON with INVALID_JSON", async () => {
    const res = await register(post("/api/auth/register", { email: "nope" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatchObject({ code: "VALIDATION_ERROR" });

    const bad = await register(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        body: "{not json",
      }),
    );
    expect(bad.status).toBe(400);
    expect((await json(bad)).error).toMatchObject({ code: "INVALID_JSON" });
  });

  it("logs in with valid credentials and rejects bad ones identically", async () => {
    await register(post("/api/auth/register", staffPayload));

    const okRes = await login(
      post("/api/auth/login", { email: staffPayload.email, password: staffPayload.password }),
    );
    expect(okRes.status).toBe(200);
    expect((await json(okRes)).access_token).toBeTypeOf("string");

    const wrongPw = await login(
      post("/api/auth/login", { email: staffPayload.email, password: "wrong-password" }),
    );
    const unknownEmail = await login(
      post("/api/auth/login", { email: "ghost@test.dev", password: "wrong-password" }),
    );
    expect(wrongPw.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect((await json(wrongPw)).error).toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect((await json(unknownEmail)).error).toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("serves /me via Bearer and via cookie, rejects missing/garbage tokens", async () => {
    const reg = await register(post("/api/auth/register", staffPayload));
    const body = await json(reg);
    const accessToken = body.access_token as string;

    const viaBearer = await me(
      new Request(`${BASE}/api/auth/me`, {
        headers: { authorization: `Bearer ${accessToken}` },
      }),
    );
    expect(viaBearer.status).toBe(200);
    expect(((await json(viaBearer)).user as Record<string, unknown>).email).toBe(staffPayload.email);

    const viaCookie = await me(
      new Request(`${BASE}/api/auth/me`, { headers: { cookie: cookieHeader(reg) } }),
    );
    expect(viaCookie.status).toBe(200);

    const anonymous = await me(new Request(`${BASE}/api/auth/me`));
    expect(anonymous.status).toBe(401);
    expect((await json(anonymous)).error).toMatchObject({ code: "UNAUTHORIZED" });

    const garbage = await me(
      new Request(`${BASE}/api/auth/me`, {
        headers: { authorization: "Bearer not-a-jwt" },
      }),
    );
    expect(garbage.status).toBe(401);
    expect((await json(garbage)).error).toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("rotates refresh tokens and revokes ALL sessions on reuse", async () => {
    const reg = await register(post("/api/auth/register", staffPayload));
    const oldCookies = cookieHeader(reg);
    const oldToken = cookieValue(reg, "sp_refresh");

    const rotated = await refresh(post("/api/auth/refresh", undefined, { cookie: oldCookies }));
    expect(rotated.status).toBe(200);
    const newToken = cookieValue(rotated, "sp_refresh");
    expect(newToken).not.toBe(oldToken);
    const newCookies = cookieHeader(rotated);

    // Replay the OLD token -> reuse detection kills every session.
    const reuse = await refresh(post("/api/auth/refresh", { refresh_token: oldToken }));
    expect(reuse.status).toBe(401);
    expect((await json(reuse)).error).toMatchObject({ code: "REFRESH_REUSED" });

    // Even the legitimately rotated token is now dead.
    const afterRevoke = await refresh(post("/api/auth/refresh", undefined, { cookie: newCookies }));
    expect(afterRevoke.status).toBe(401);
  });

  it("supports the body-token refresh flow for API clients", async () => {
    const reg = await register(post("/api/auth/register", staffPayload));
    const token = ((await json(reg)).refresh_token) as string;
    const res = await refresh(post("/api/auth/refresh", { refresh_token: token }));
    expect(res.status).toBe(200);
    expect((await json(res)).refresh_token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("logout revokes the refresh token and clears cookies", async () => {
    const reg = await register(post("/api/auth/register", staffPayload));
    const cookies = cookieHeader(reg);
    const token = cookieValue(reg, "sp_refresh");

    const out = await logout(post("/api/auth/logout", undefined, { cookie: cookies }));
    expect(out.status).toBe(204);
    expect(out.headers.getSetCookie().every((c) => c.includes("Max-Age=0"))).toBe(true);

    const replay = await refresh(post("/api/auth/refresh", { refresh_token: token }));
    expect(replay.status).toBe(401);
  });

  it("blocks a deactivated account immediately, even with a valid JWT", async () => {
    const reg = await register(post("/api/auth/register", staffPayload));
    const accessToken = ((await json(reg)).access_token) as string;

    await getDb()
      .update(users)
      .set({ isActive: false })
      .where(eq(users.email, staffPayload.email));

    const meRes = await me(
      new Request(`${BASE}/api/auth/me`, {
        headers: { authorization: `Bearer ${accessToken}` },
      }),
    );
    expect(meRes.status).toBe(401);
    expect((await json(meRes)).error).toMatchObject({ code: "ACCOUNT_DISABLED" });

    const loginRes = await login(
      post("/api/auth/login", { email: staffPayload.email, password: staffPayload.password }),
    );
    expect(loginRes.status).toBe(401);
    expect((await json(loginRes)).error).toMatchObject({ code: "ACCOUNT_DISABLED" });
  });
});