import { getDb } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth/guards";
import { findUserById, toPublicUser } from "@/lib/services/users";
import { ok, fail } from "@/lib/api/respond";
import { ApiError } from "@/lib/api/errors";

export async function GET(req: Request) {
  try {
    const session = await requireAuth(req);
    const user = await findUserById(getDb(), session.userId);
    if (!user) {
      throw new ApiError(401, "ACCOUNT_DISABLED", "Account is missing or disabled");
    }
    return ok({ user: toPublicUser(user) });
  } catch (error) {
    return fail(error);
  }
}