import { getDb } from "@/lib/db/client";
import { loginSchema } from "@/lib/validation/auth";
import { findUserByEmail, toPublicUser } from "@/lib/services/users";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { signAccessToken, ACCESS_TTL_SECONDS } from "@/lib/auth/jwt";
import { insertRefreshToken, deleteExpiredUserTokens } from "@/lib/auth/session";
import { setSessionCookies } from "@/lib/auth/cookies";
import { ok, fail } from "@/lib/api/respond";
import { readJsonBody } from "@/lib/api/request";
import { ApiError } from "@/lib/api/errors";

// Lazy one-time dummy hash so unknown emails cost the same as wrong passwords.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("stockpulse-timing-equalizer");
  return dummyHash;
}

export async function POST(req: Request) {
  try {
    const input = loginSchema.parse(await readJsonBody(req));
    const db = getDb();

    const user = await findUserByEmail(db, input.email);
    const hashToCheck = user ? user.passwordHash : await getDummyHash();
    const passwordOk = await verifyPassword(input.password, hashToCheck);

    if (!user || !passwordOk) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }
    if (!user.isActive) {
      throw new ApiError(401, "ACCOUNT_DISABLED", "Account is disabled");
    }

    await deleteExpiredUserTokens(db, user.id);
    const accessToken = await signAccessToken(user);
    const refresh = await insertRefreshToken(db, user.id);

    const res = ok({
      user: toPublicUser(user),
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: refresh.token,
    });
    setSessionCookies(res, accessToken, refresh.token);
    return res;
  } catch (error) {
    return fail(error);
  }
}