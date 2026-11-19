import { getDb } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth/guards";
import {
  createMovement,
  listMovements,
  toPublicMovement,
} from "@/lib/services/movements";
import { crossedLowStock, sendLowStockAlert } from "@/lib/services/alerts";
import {
  createMovementSchema,
  listMovementsQuerySchema,
} from "@/lib/validation/movements";
import { parsePagination, paginated } from "@/lib/api/pagination";
import { runAfterResponse } from "@/lib/api/background";
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

    return ok(paginated(rows.map(toPublicMovement), total, pagination));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireAuth(req);
    const input = createMovementSchema.parse(await readJsonBody(req));
    const result = await createMovement(getDb(), {
      productId: input.product_id,
      movementType: input.movement_type,
      quantity: input.quantity,
      note: input.note,
      createdBy: session.userId, // never trusted from the body
    });

    // Alert only on the transition into low/out, never on every movement.
    if (
      crossedLowStock(
        result.previous_qty,
        result.new_qty,
        result.low_stock_threshold,
      )
    ) {
      runAfterResponse(() =>
        sendLowStockAlert(getDb(), {
          sku: result.product.sku,
          name: result.product.name,
          previousQty: result.previous_qty,
          newQty: result.new_qty,
          threshold: result.low_stock_threshold,
          movementQuantity: input.quantity,
          actorName: result.row.created_by_name,
          occurredAt: result.row.movement.createdAt,
        }),
      );
    }

    return ok({ movement: toPublicMovement(result.row) }, 201);
  } catch (error) {
    return fail(error);
  }
}