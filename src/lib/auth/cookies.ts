import type { NextResponse } from "next/server";
import { ACCESS_TTL_SECONDS } from "./jwt";

export const ACCESS_COOKIE = "sp_access";
export const REFRESH_COOKIE = "sp_refresh";
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export function setSessionCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: ACCESS_TTL_SECONDS,
  });
  res.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api/auth",
    maxAge: REFRESH_TTL_SECONDS,
  });
}

export function clearSessionCookies(res: NextResponse): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
  res.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api/auth",
    maxAge: 0,
  });
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      const value = part.slice(eq + 1).trim();
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }
  return null;
}