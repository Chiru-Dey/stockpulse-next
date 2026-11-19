import { getDb } from "@/lib/db/client";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import {
  deleteCategory,
  findCategoryById,
  toPublicCategory,
  updateCategory,
} from "@/lib/services/categories";
import { updateCategorySchema } from "@/lib/validation/categories";
import { idParamSchema } from "@/lib/validation/common";
import { ok, noContent, fail } from "@/lib/api/respond";
import { readJsonBody } from "@/lib/api/request";
import { ApiError } from "@/lib/api/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireAuth(req);
    const id = idParamSchema.parse((await params).id);
    const category = await findCategoryById(getDb(), id);
    if (!category) {
      throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }
    return ok({ category: toPublicCategory(category) });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin(req);
    const id = idParamSchema.parse((await params).id);
    const input = updateCategorySchema.parse(await readJsonBody(req));
    const category = await updateCategory(getDb(), id, {
      name: input.name,
      description: input.description,
    });
    return ok({ category: toPublicCategory(category) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    await requireAdmin(req);
    const id = idParamSchema.parse((await params).id);
    await deleteCategory(getDb(), id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}