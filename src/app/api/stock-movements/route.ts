import { getDb } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth/guards";
import {
  createMovement,
  listMovements,
  toPublicMovement,
} from "@/lib/services/movements";
import {
  createMovementSchema,
  listMovementsQuerySchema,
} from "@/lib/validation/movements";
import { parsePagination, paginationMeta } from "@/lib/api/pagination";
import { ok, fail } from "@/lib/api/respond";
import { readJsonBody } from "@/lib/api/request";

export async function GET(req: Request) {
  try {
    await requireAuth(req);
    const url = new URL(req.url);
    const pagination = parsePagination(url);
    const query = listMovementsQuerySchema.parse({
      product_id: url.searchParams.get("product_id") || undefined,
      movement_type: url.searchParams.get("movement_type") || undefined,
      date_from: url.searchParams.get("date_from") || undefined,
      date_to: url.searchParams.get("date_to") || undefined,
    });

    const { rows, total } = await listMovements(
      getDb(),
      {
        productId: query.product_id,
        movementType: query.movement_type,
        dateFrom: query.date_from,
        dateTo: query.date_to,
      },
      pagination,
    );

    return ok({
      data: rows.map(toPublicMovement),
      pagination: paginationMeta(pagination.page, pagination.perPage, total),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAuth(req);
    const input = createMovementSchema.parse(await readJsonBody(req));
    const row = await createMovement(getDb(), {
      productId: input.product_id,
      movementType: input.movement_type,
      quantity: input.quantity,
      note: input.note,
      createdBy: session.userId, // never trusted from the body
    });
    return ok({ movement: toPublicMovement(row) }, 201);
  } catch (error) {
    return fail(error);
  }
}