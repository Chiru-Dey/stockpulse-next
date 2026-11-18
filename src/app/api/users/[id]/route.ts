import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/guards";
import {
  deleteUser,
  findUserById,
  toPublicUser,
  updateUser,
} from "@/lib/services/users";
import { updateUserSchema } from "@/lib/validation/users";
import { idParamSchema } from "@/lib/validation/common";
import { ok, noContent, fail } from "@/lib/api/respond";
import { readJsonBody } from "@/lib/api/request";
import { ApiError } from "@/lib/api/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireAdmin(req);
    const id = idParamSchema.parse((await params).id);
    const user = await findUserById(getDb(), id);
    if (!user) {
      throw new ApiError(404, "USER_NOT_FOUND", "User not found");
    }
    return ok({ user: toPublicUser(user) });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const session = await requireAdmin(req);
    const id = idParamSchema.parse((await params).id);
    const input = updateUserSchema.parse(await readJsonBody(req));

    if (
      id === session.userId &&
      (input.role !== undefined || input.is_active !== undefined)
    ) {
      throw new ApiError(
        409,
        "CANNOT_MODIFY_SELF",
        "You cannot change your own role or active status",
      );
    }

    const user = await updateUser(getDb(), id, {
      name: input.name,
      password: input.password,
      role: input.role,
      isActive: input.is_active,
    });
    return ok({ user: toPublicUser(user) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const session = await requireAdmin(req);
    const id = idParamSchema.parse((await params).id);
    if (id === session.userId) {
      throw new ApiError(
        409,
        "CANNOT_DELETE_SELF",
        "You cannot delete your own account",
      );
    }
    await deleteUser(getDb(), id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}