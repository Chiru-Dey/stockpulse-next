import { getDb } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth/guards";
import { findMovementById, toPublicMovement } from "@/lib/services/movements";
import { idParamSchema } from "@/lib/validation/common";
import { ok, fail } from "@/lib/api/respond";
import { ApiError } from "@/lib/api/errors";

type Ctx = { params: Promise<{ id: string }> };

// The ledger is append-only: no PATCH or DELETE handler is exported, so
// Next.js answers 405 for those methods.
export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireAuth(req);
    const id = idParamSchema.parse((await params).id);
    const row = await findMovementById(getDb(), id);
    if (!row) {
      throw new ApiError(404, "MOVEMENT_NOT_FOUND", "Stock movement not found");
    }
    return ok({ movement: toPublicMovement(row) });
  } catch (error) {
    return fail(error);
  }
}