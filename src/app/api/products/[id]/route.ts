import { getDb } from "@/lib/db/client";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import {
  archiveProduct,
  findProductById,
  toPublicProduct,
  updateProduct,
} from "@/lib/services/products";
import { updateProductSchema } from "@/lib/validation/products";
import { idParamSchema } from "@/lib/validation/common";
import { ok, noContent, fail } from "@/lib/api/respond";
import { readJsonBody } from "@/lib/api/request";
import { ApiError } from "@/lib/api/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    await requireAuth(req);
    const id = idParamSchema.parse((await params).id);
    const row = await findProductById(getDb(), id);
    if (!row) {
      throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }
    return ok({ product: toPublicProduct(row) });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    await requireAdmin(req);
    const id = idParamSchema.parse((await params).id);
    const input = updateProductSchema.parse(await readJsonBody(req));
    const row = await updateProduct(getDb(), id, {
      sku: input.sku,
      name: input.name,
      description: input.description,
      categoryId: input.category_id,
      lowStockThreshold: input.low_stock_threshold,
      archived: input.archived,
    });
    return ok({ product: toPublicProduct(row) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    await requireAdmin(req);
    const id = idParamSchema.parse((await params).id);
    await archiveProduct(getDb(), id);
    return noContent();
  } catch (error) {
    return fail(error);
  }
}