import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  categories,
  products,
  type NewProduct,
  type Product,
} from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/client";
import { containsPattern } from "@/lib/db/utils";
import { findCategoryById } from "./categories";
import { isDuplicateEntryError } from "./users";
import { ApiError } from "@/lib/api/errors";
import type { PaginationParams } from "@/lib/api/pagination";

export type StockStatus = "ok" | "low" | "out";

export type ProductWithMeta = {
  product: Product;
  category_name: string;
  stock_status: StockStatus;
};

export type PublicProduct = {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  category_id: number;
  category_name: string;
  low_stock_threshold: number;
  stock_qty: number;
  stock_status: StockStatus;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

// Single source of truth for the derived status, used in SELECT output.
const stockStatusExpr = sql<StockStatus>`CASE
  WHEN ${products.stockQty} = 0 THEN 'out'
  WHEN ${products.stockQty} <= ${products.lowStockThreshold} THEN 'low'
  ELSE 'ok'
END`;

// Equivalent range conditions for WHERE filtering.
function stockStatusCondition(status: StockStatus): SQL {
  switch (status) {
    case "out":
      return sql`${products.stockQty} = 0`;
    case "low":
      return sql`${products.stockQty} > 0 AND ${products.stockQty} <= ${products.lowStockThreshold}`;
    case "ok":
      return sql`${products.stockQty} > ${products.lowStockThreshold}`;
  }
}

const productSelection = {
  product: products,
  category_name: categories.name,
  stock_status: stockStatusExpr,
};

export function toPublicProduct(row: ProductWithMeta): PublicProduct {
  const { product } = row;
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    category_id: product.categoryId,
    category_name: row.category_name,
    low_stock_threshold: product.lowStockThreshold,
    stock_qty: product.stockQty,
    stock_status: row.stock_status,
    archived_at: product.archivedAt ? product.archivedAt.toISOString() : null,
    created_at: product.createdAt.toISOString(),
    updated_at: product.updatedAt.toISOString(),
  };
}

export async function findProductById(
  db: DbOrTx,
  id: number,
): Promise<ProductWithMeta | null> {
  const rows = await db
    .select(productSelection)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function findProductBySku(
  db: DbOrTx,
  sku: string,
): Promise<Product | null> {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.sku, sku))
    .limit(1);
  return rows[0] ?? null;
}

export type ProductFilters = {
  search?: string;
  categoryId?: number;
  stockStatus?: StockStatus;
  includeArchived?: boolean;
};

export async function listProducts(
  db: DbOrTx,
  filters: ProductFilters,
  pagination: PaginationParams,
): Promise<{ rows: ProductWithMeta[]; total: number }> {
  const conditions: SQL[] = [];
  if (!filters.includeArchived) {
    conditions.push(isNull(products.archivedAt));
  }
  if (filters.search) {
    const pattern = containsPattern(filters.search);
    const searchClause = or(
      sql`LOWER(${products.sku}) LIKE ${pattern}`,
      sql`LOWER(${products.name}) LIKE ${pattern}`,
    );
    if (searchClause) conditions.push(searchClause);
  }
  if (filters.categoryId !== undefined) {
    conditions.push(eq(products.categoryId, filters.categoryId));
  }
  if (filters.stockStatus !== undefined) {
    conditions.push(stockStatusCondition(filters.stockStatus));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select(productSelection)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(desc(products.id))
    .limit(pagination.limit)
    .offset(pagination.offset);

  // All filter conditions reference products columns only, so the count
  // needs no join.
  const [counted] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(products)
    .where(where);

  return { rows, total: Number(counted?.value ?? 0) };
}

export type CreateProductServiceInput = {
  sku: string;
  name: string;
  description?: string | null;
  categoryId: number;
  lowStockThreshold: number;
};

export async function createProduct(
  db: DbOrTx,
  input: CreateProductServiceInput,
): Promise<ProductWithMeta> {
  const category = await findCategoryById(db, input.categoryId);
  if (!category) {
    throw new ApiError(
      400,
      "CATEGORY_NOT_FOUND",
      "category_id does not reference an existing category",
    );
  }

  const sku = input.sku.toUpperCase();
  const existing = await findProductBySku(db, sku);
  if (existing) {
    throw new ApiError(409, "SKU_EXISTS", "A product with this SKU already exists");
  }

  try {
    await db.insert(products).values({
      sku,
      name: input.name,
      description: input.description ?? null,
      categoryId: input.categoryId,
      lowStockThreshold: input.lowStockThreshold,
      stockQty: 0, // ledger-only: stock starts at zero and moves via movements
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new ApiError(409, "SKU_EXISTS", "A product with this SKU already exists");
    }
    throw error;
  }

  const created = await findProductBySku(db, sku);
  if (!created) {
    throw new Error("Product disappeared immediately after insert");
  }
  const row = await findProductById(db, created.id);
  if (!row) {
    throw new Error("Product join row missing immediately after insert");
  }
  return row;
}

export type UpdateProductServiceInput = {
  sku?: string;
  name?: string;
  description?: string | null;
  categoryId?: number;
  lowStockThreshold?: number;
  archived?: boolean;
};

export async function updateProduct(
  db: DbOrTx,
  id: number,
  input: UpdateProductServiceInput,
): Promise<ProductWithMeta> {
  const existing = await findProductById(db, id);
  if (!existing) {
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }

  if (input.categoryId !== undefined) {
    const category = await findCategoryById(db, input.categoryId);
    if (!category) {
      throw new ApiError(
        400,
        "CATEGORY_NOT_FOUND",
        "category_id does not reference an existing category",
      );
    }
  }

  if (input.sku !== undefined) {
    const conflict = await findProductBySku(db, input.sku.toUpperCase());
    if (conflict && conflict.id !== id) {
      throw new ApiError(409, "SKU_EXISTS", "A product with this SKU already exists");
    }
  }

  const set: Partial<NewProduct> = {};
  if (input.sku !== undefined) set.sku = input.sku.toUpperCase();
  if (input.name !== undefined) set.name = input.name;
  if (input.description !== undefined) set.description = input.description;
  if (input.categoryId !== undefined) set.categoryId = input.categoryId;
  if (input.lowStockThreshold !== undefined) {
    set.lowStockThreshold = input.lowStockThreshold;
  }
  if (input.archived !== undefined) {
    set.archivedAt = input.archived ? new Date() : null;
  }

  if (Object.keys(set).length > 0) {
    try {
      await db.update(products).set(set).where(eq(products.id, id));
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ApiError(409, "SKU_EXISTS", "A product with this SKU already exists");
      }
      throw error;
    }
  }

  const updated = await findProductById(db, id);
  if (!updated) {
    throw new Error("Product disappeared immediately after update");
  }
  return updated;
}

export async function archiveProduct(db: DbOrTx, id: number): Promise<void> {
  const existing = await findProductById(db, id);
  if (!existing) {
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }
  if (existing.product.archivedAt !== null) {
    return; // idempotent soft delete
  }
  await db
    .update(products)
    .set({ archivedAt: new Date() })
    .where(eq(products.id, id));
}