import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import {
  categories,
  products,
  type Category,
  type NewCategory,
} from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/client";
import { containsPattern } from "@/lib/db/utils";
import { isDuplicateEntryError } from "./users";
import { ApiError } from "@/lib/api/errors";
import type { PaginationParams } from "@/lib/api/pagination";

export type PublicCategory = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export function toPublicCategory(category: Category): PublicCategory {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    created_at: category.createdAt.toISOString(),
    updated_at: category.updatedAt.toISOString(),
  };
}

export async function findCategoryById(
  db: DbOrTx,
  id: number,
): Promise<Category | null> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function findCategoryByName(
  db: DbOrTx,
  name: string,
): Promise<Category | null> {
  const rows = await db
    .select()
    .from(categories)
    .where(sql`LOWER(${categories.name}) = ${name.toLowerCase()}`)
    .limit(1);
  return rows[0] ?? null;
}

export async function listCategories(
  db: DbOrTx,
  filters: { search?: string },
  pagination: PaginationParams,
): Promise<{ rows: Category[]; total: number }> {
  const conditions: SQL[] = [];
  if (filters.search) {
    const pattern = containsPattern(filters.search);
    const searchClause = or(
      sql`LOWER(${categories.name}) LIKE ${pattern}`,
      sql`LOWER(${categories.description}) LIKE ${pattern}`,
    );
    if (searchClause) conditions.push(searchClause);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(categories)
    .where(where)
    .orderBy(desc(categories.id))
    .limit(pagination.limit)
    .offset(pagination.offset);
  const [counted] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(categories)
    .where(where);

  return { rows, total: Number(counted?.value ?? 0) };
}

export async function createCategory(
  db: DbOrTx,
  input: { name: string; description?: string | null },
): Promise<Category> {
  const existing = await findCategoryByName(db, input.name);
  if (existing) {
    throw new ApiError(
      409,
      "CATEGORY_NAME_EXISTS",
      "A category with this name already exists",
    );
  }

  try {
    await db.insert(categories).values({
      name: input.name,
      description: input.description ?? null,
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) {
      throw new ApiError(
        409,
        "CATEGORY_NAME_EXISTS",
        "A category with this name already exists",
      );
    }
    throw error;
  }

  const created = await findCategoryByName(db, input.name);
  if (!created) {
    throw new Error("Category disappeared immediately after insert");
  }
  return created;
}

export async function updateCategory(
  db: DbOrTx,
  id: number,
  input: { name?: string; description?: string | null },
): Promise<Category> {
  const existing = await findCategoryById(db, id);
  if (!existing) {
    throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found");
  }

  if (input.name !== undefined) {
    const conflict = await findCategoryByName(db, input.name);
    if (conflict && conflict.id !== id) {
      throw new ApiError(
        409,
        "CATEGORY_NAME_EXISTS",
        "A category with this name already exists",
      );
    }
  }

  const set: Partial<NewCategory> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.description !== undefined) set.description = input.description;

  if (Object.keys(set).length > 0) {
    try {
      await db.update(categories).set(set).where(eq(categories.id, id));
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new ApiError(
          409,
          "CATEGORY_NAME_EXISTS",
          "A category with this name already exists",
        );
      }
      throw error;
    }
  }

  const updated = await findCategoryById(db, id);
  if (!updated) {
    throw new Error("Category disappeared immediately after update");
  }
  return updated;
}

export async function countCategoryProducts(
  db: DbOrTx,
  categoryId: number,
): Promise<number> {
  const [counted] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(products)
    .where(eq(products.categoryId, categoryId));
  return Number(counted?.value ?? 0);
}

export async function deleteCategory(db: DbOrTx, id: number): Promise<void> {
  const existing = await findCategoryById(db, id);
  if (!existing) {
    throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found");
  }

  const referenced = await countCategoryProducts(db, id);
  if (referenced > 0) {
    throw new ApiError(
      409,
      "CATEGORY_IN_USE",
      `Category is referenced by ${referenced} product(s); reassign or remove them first`,
    );
  }

  await db.delete(categories).where(eq(categories.id, id));
}