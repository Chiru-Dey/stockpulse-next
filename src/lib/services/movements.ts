import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import {
  products,
  stockMovements,
  users,
  type StockMovement,
} from "@/lib/db/schema";
import type { Db, DbOrTx } from "@/lib/db/client";
import { ApiError } from "@/lib/api/errors";
import type { PaginationParams } from "@/lib/api/pagination";

export type MovementType = "IN" | "OUT";

export type MovementWithMeta = {
  movement: StockMovement;
  product_sku: string;
  product_name: string;
  created_by_name: string;
  created_by_email: string;
};

export type PublicMovement = {
  id: number;
  product_id: number;
  product_sku: string;
  product_name: string;
  movement_type: MovementType;
  quantity: number;
  note: string | null;
  created_by: number;
  created_by_name: string;
  created_by_email: string;
  created_at: string;
};

const movementSelection = {
  movement: stockMovements,
  product_sku: products.sku,
  product_name: products.name,
  created_by_name: users.name,
  created_by_email: users.email,
};

export function toPublicMovement(row: MovementWithMeta): PublicMovement {
  const { movement } = row;
  return {
    id: movement.id,
    product_id: movement.productId,
    product_sku: row.product_sku,
    product_name: row.product_name,
    movement_type: movement.movementType,
    quantity: movement.quantity,
    note: movement.note,
    created_by: movement.createdBy,
    created_by_name: row.created_by_name,
    created_by_email: row.created_by_email,
    created_at: movement.createdAt.toISOString(),
  };
}

export async function findMovementById(
  db: DbOrTx,
  id: number,
): Promise<MovementWithMeta | null> {
  const rows = await db
    .select(movementSelection)
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .innerJoin(users, eq(stockMovements.createdBy, users.id))
    .where(eq(stockMovements.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type MovementFilters = {
  productId?: number;
  movementType?: MovementType;
  dateFrom?: string;
  dateTo?: string;
};

export async function listMovements(
  db: DbOrTx,
  filters: MovementFilters,
  pagination: PaginationParams,
): Promise<{ rows: MovementWithMeta[]; total: number }> {
  const conditions: SQL[] = [];
  if (filters.productId !== undefined) {
    conditions.push(eq(stockMovements.productId, filters.productId));
  }
  if (filters.movementType !== undefined) {
    conditions.push(eq(stockMovements.movementType, filters.movementType));
  }
  if (filters.dateFrom) {
    conditions.push(
      gte(stockMovements.createdAt, new Date(`${filters.dateFrom}T00:00:00.000Z`)),
    );
  }
  if (filters.dateTo) {
    conditions.push(
      lte(stockMovements.createdAt, new Date(`${filters.dateTo}T23:59:59.999Z`)),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select(movementSelection)
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .innerJoin(users, eq(stockMovements.createdBy, users.id))
    .where(where)
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(pagination.limit)
    .offset(pagination.offset);

  const [counted] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(stockMovements)
    .where(where);

  return { rows, total: Number(counted?.value ?? 0) };
}

export type CreateMovementServiceInput = {
  productId: number;
  movementType: MovementType;
  quantity: number;
  note?: string | null;
  createdBy: number;
};

export type MovementResult = {
  row: MovementWithMeta;
  product: { id: number; sku: string; name: string };
  previous_qty: number;
  new_qty: number;
  low_stock_threshold: number;
};

/**
 * The only way stock_qty ever changes. Locks the product row for the whole
 * read-check-write sequence so concurrent OUT requests cannot oversell.
 * Requires the root db (TiDB has no SAVEPOINT support for nested transactions).
 * Returns the stock transition so callers can trigger threshold alerts.
 */
export async function createMovement(
  db: Db,
  input: CreateMovementServiceInput,
): Promise<MovementResult> {
  const outcome = await db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update")
      .limit(1);
    const product = locked[0];

    if (!product) {
      throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }
    if (product.archivedAt !== null) {
      throw new ApiError(
        409,
        "PRODUCT_ARCHIVED",
        "Cannot move stock for an archived product; restore it first",
      );
    }

    const delta =
      input.movementType === "IN" ? input.quantity : -input.quantity;
    const nextQty = product.stockQty + delta;
    if (nextQty < 0) {
      throw new ApiError(
        409,
        "INSUFFICIENT_STOCK",
        `Insufficient stock: ${product.stockQty} available, ${input.quantity} requested`,
      );
    }

    const [inserted] = await tx
      .insert(stockMovements)
      .values({
        productId: input.productId,
        movementType: input.movementType,
        quantity: input.quantity,
        note: input.note ?? null,
        createdBy: input.createdBy,
        createdAt: new Date(),
      })
      .$returningId();
    if (!inserted) {
      throw new Error("Movement insert returned no id");
    }

    await tx
      .update(products)
      .set({ stockQty: nextQty })
      .where(eq(products.id, input.productId));

    return { movementId: inserted.id, product, newQty: nextQty };
  });

  const row = await findMovementById(db, outcome.movementId);
  if (!row) {
    throw new Error("Movement disappeared immediately after commit");
  }

  return {
    row,
    product: {
      id: outcome.product.id,
      sku: outcome.product.sku,
      name: outcome.product.name,
    },
    previous_qty: outcome.product.stockQty,
    new_qty: outcome.newQty,
    low_stock_threshold: outcome.product.lowStockThreshold,
  };
}

export async function getLedgerBalance(
  db: DbOrTx,
  productId: number,
): Promise<number> {
  const [row] = await db
    .select({
      value: sql<number>`COALESCE(SUM(CASE
        WHEN ${stockMovements.movementType} = 'IN' THEN ${stockMovements.quantity}
        ELSE -${stockMovements.quantity}
      END), 0)`,
    })
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId));
  return Number(row?.value ?? 0);
}

export type ReconcileResult = {
  product_id: number;
  cached_qty: number;
  ledger_qty: number;
  drift: number;
  corrected: boolean;
};

export async function reconcileProductStock(
  db: Db,
  productId: number,
): Promise<ReconcileResult> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .for("update")
      .limit(1);
    const product = locked[0];
    if (!product) {
      throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    const ledgerQty = await getLedgerBalance(tx, productId);
    const drift = product.stockQty - ledgerQty;
    if (drift !== 0) {
      await tx
        .update(products)
        .set({ stockQty: ledgerQty })
        .where(eq(products.id, productId));
    }

    return {
      product_id: productId,
      cached_qty: product.stockQty,
      ledger_qty: ledgerQty,
      drift,
      corrected: drift !== 0,
    };
  });
}

export type StockDrift = {
  product_id: number;
  cached_qty: number;
  ledger_qty: number;
};

/**
 * One pass over active products comparing the cached qty with the ledger sum.
 * GROUP BY uses plain columns only, which TiDB's only_full_group_by accepts.
 */
export async function findStockDrift(
  db: DbOrTx,
  limit = 50,
): Promise<StockDrift[]> {
  const ledgerSum = sql<number>`COALESCE(SUM(CASE
    WHEN ${stockMovements.movementType} = 'IN' THEN ${stockMovements.quantity}
    ELSE -${stockMovements.quantity}
  END), 0)`;

  const rows = await db
    .select({
      product_id: products.id,
      cached_qty: products.stockQty,
      ledger_qty: ledgerSum,
    })
    .from(products)
    .leftJoin(stockMovements, eq(stockMovements.productId, products.id))
    .where(isNull(products.archivedAt))
    .groupBy(products.id, products.stockQty)
    .having(sql`${products.stockQty} <> ${ledgerSum}`)
    .orderBy(asc(products.id))
    .limit(limit);

  return rows.map((row) => ({
    product_id: row.product_id,
    cached_qty: Number(row.cached_qty),
    ledger_qty: Number(row.ledger_qty),
  }));
}

export type ReconcileSweepResult = {
  drifted: number;
  corrected: number;
  details: ReconcileResult[];
};

export async function reconcileDriftedProducts(
  db: Db,
  limit = 50,
): Promise<ReconcileSweepResult> {
  const drifts = await findStockDrift(db, limit);
  const details: ReconcileResult[] = [];
  // Sequential on purpose: the pool is tiny and each fix takes a row lock.
  for (const drift of drifts) {
    details.push(await reconcileProductStock(db, drift.product_id));
  }
  return {
    drifted: drifts.length,
    corrected: details.filter((detail) => detail.corrected).length,
    details,
  };
}