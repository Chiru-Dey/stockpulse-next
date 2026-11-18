import { getDb } from "@/lib/db/client";
import { refreshSchema } from "@/lib/validation/auth";
import { revokeRefreshToken } from "@/lib/auth/session";
import { REFRESH_COOKIE, readCookie, clearSessionCookies } from "@/lib/auth/cookies";
import { noContent, fail } from "@/lib/api/respond";
import { readJsonBody } from "@/lib/api/request";

export async function POST(req: Request) {
  try {
    const input = refreshSchema.parse(await readJsonBody(req));
    const presented = input.refresh_token ?? readCookie(req, REFRESH_COOKIE);
    if (presented) {
      await revokeRefreshToken(getDb(), presented);
    }
    const res = noContent();
    clearSessionCookies(res);
    return res;
  } catch (error) {
    return fail(error);
  }
}