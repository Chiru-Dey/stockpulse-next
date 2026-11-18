import { getDb } from "@/lib/db/client";
import { registerSchema } from "@/lib/validation/auth";
import { createUser, toPublicUser } from "@/lib/services/users";
import { signAccessToken, ACCESS_TTL_SECONDS } from "@/lib/auth/jwt";
import { insertRefreshToken } from "@/lib/auth/session";
import { setSessionCookies } from "@/lib/auth/cookies";
import { ok, fail } from "@/lib/api/respond";
import { readJsonBody } from "@/lib/api/request";

export async function POST(req: Request) {
  try {
    const input = registerSchema.parse(await readJsonBody(req));
    const db = getDb();

    // Registration always creates staff; admins are created via /api/users.
    const user = await createUser(db, { ...input, role: "staff" });

    const accessToken = await signAccessToken(user);
    const refresh = await insertRefreshToken(db, user.id);

    const res = ok(
      {
        user: toPublicUser(user),
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: ACCESS_TTL_SECONDS,
        refresh_token: refresh.token,
      },
      201,
    );
    setSessionCookies(res, accessToken, refresh.token);
    return res;
  } catch (error) {
    return fail(error);
  }
}