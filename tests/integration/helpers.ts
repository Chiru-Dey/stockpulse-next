import { POST as login } from "@/app/api/auth/login/route";
import { getDb } from "@/lib/db/client";
import { createUser } from "@/lib/services/users";
import type { Role } from "@/lib/auth/jwt";

export const BASE = "http://localhost:3000";

export function req(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; cookies?: string } = {},
): Request {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookies) headers.cookie = opts.cookies;
  return new Request(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

export async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

export function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .join("; ");
}

let counter = 0;

export async function makeUser(role: Role, password = "password-123") {
  counter += 1;
  const email = `${role}${counter}@test.dev`;
  const user = await createUser(getDb(), {
    name: `${role} number ${counter}`,
    email,
    password,
    role,
  });
  return { user, email, password };
}

export async function loginSession(email: string, password: string) {
  const res = await login(req("POST", "/api/auth/login", { body: { email, password } }));
  if (res.status !== 200) {
    throw new Error(`Login failed with status ${res.status}`);
  }
  const body = await json(res);
  return {
    accessToken: body.access_token as string,
    refreshToken: body.refresh_token as string,
  };
}

export async function loginToken(email: string, password: string) {
  return (await loginSession(email, password)).accessToken;
}

export async function adminToken(): Promise<string> {
  const { email, password } = await makeUser("admin");
  return loginToken(email, password);
}

export async function staffToken(): Promise<string> {
  const { email, password } = await makeUser("staff");
  return loginToken(email, password);
}