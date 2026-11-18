import { getDb } from "@/lib/db/client";
import { refreshSchema } from "@/lib/validation/auth";
import { rotateRefreshToken } from "@/lib/auth/session";
import { signAccessToken, ACCESS_TTL_SECONDS } from "@/lib/auth/jwt";
import { REFRESH_COOKIE, readCookie, setSessionCookies } from "@/lib/auth/cookies";
import { ok, fail } from "@/lib/api/respond";
import { readJsonBody } from "@/lib/api/request";
import { ApiError } from "@/lib/api/errors";

export async function POST(req: Request) {
  try {
    const input = refreshSchema.parse(await readJsonBody(req));
    const presented = input.refresh_token ?? readCookie(req, REFRESH_COOKIE);
    if (!presented) {
      throw new ApiError(401, "UNAUTHORIZED", "Refresh token required");
    }

    const rotated = await rotateRefreshToken(getDb(), presented);
    const accessToken = await signAccessToken({
      id: rotated.userId,
      role: rotated.role,
    });

    const res = ok({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: rotated.token,
    });
    setSessionCookies(res, accessToken, rotated.token);
    return res;
  } catch (error) {
    return fail(error);
  }
}