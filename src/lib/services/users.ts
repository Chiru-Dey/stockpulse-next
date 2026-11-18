import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import {
  stockMovements,
  users,
  type NewUser,
  type User,
} from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/client";
import { containsPattern } from "@/lib/db/utils";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllUserTokens } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/errors";
import type { Role } from "@/lib/auth/jwt";
import type { PaginationParams } from "@/lib/api/pagination";

export type PublicUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    is_active: user.isActive,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}

export async function findUserByEmail(
  db: DbOrTx,
  email: string,
): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(
  db: DbOrTx,
  id: number,
): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export function isDuplicateEntryError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { code?: unknown; errno?: unknown; cause?: unknown };
  if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) return true;
  return isDuplicateEntryError(err.cause);
}

export async function createUser(
  db: DbOrTx,
  input: { name: string; email: string; password: string; role: Role },
): Promise<User> {
  const existing = await findUserByEmail(db, input.email);
  if (existing) {
    throw new ApiError(409, "EMAIL_EXISTS", "A user with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  try {
    await db.insert(users).values({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    });
  } catch (error) {
    // Unique-index race: another request inserted the same email first.
    if (isDuplicateEntryError(error)) {
      throw new ApiError(409, "EMAIL_EXISTS", "A user with this email already exists");
    }
    throw error;
  }

  const created = await findUserByEmail(db, input.email);
  if (!created) {
    throw new Error("User disappeared immediately after insert");
  }
  return created;
}

export type UserFilters = {
  search?: string;
  role?: Role;
  isActive?: boolean;
};

export async function listUsers(
  db: DbOrTx,
  filters: UserFilters,
  pagination: PaginationParams,
): Promise<{ rows: User[]; total: number }> {
  const conditions: SQL[] = [];
  if (filters.search) {
    const pattern = containsPattern(filters.search);
    const searchClause = or(
      sql`LOWER(${users.name}) LIKE ${pattern}`,
      sql`LOWER(${users.email}) LIKE ${pattern}`,
    );
    if (searchClause) conditions.push(searchClause);
  }
  if (filters.role !== undefined) {
    conditions.push(eq(users.role, filters.role));
  }
  if (filters.isActive !== undefined) {
    conditions.push(eq(users.isActive, filters.isActive));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.id))
    .limit(pagination.limit)
    .offset(pagination.offset);
  const [counted] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(users)
    .where(where);

  return { rows, total: Number(counted?.value ?? 0) };
}

export async function countUserMovements(
  db: DbOrTx,
  userId: number,
): Promise<number> {
  const [counted] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(stockMovements)
    .where(eq(stockMovements.createdBy, userId));
  return Number(counted?.value ?? 0);
}

export async function countActiveAdmins(db: DbOrTx): Promise<number> {
  const [counted] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)));
  return Number(counted?.value ?? 0);
}

export type UpdateUserServiceInput = {
  name?: string;
  password?: string;
  role?: Role;
  isActive?: boolean;
};

export async function updateUser(
  db: DbOrTx,
  id: number,
  input: UpdateUserServiceInput,
): Promise<User> {
  const existing = await findUserById(db, id);
  if (!existing) {
    throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  }

  const losesAdmin =
    existing.role === "admin" &&
    existing.isActive &&
    ((input.role !== undefined && input.role !== "admin") ||
      input.isActive === false);
  if (losesAdmin && (await countActiveAdmins(db)) <= 1) {
    throw new ApiError(409, "LAST_ADMIN", "Cannot remove the last active admin");
  }

  const set: Partial<NewUser> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.role !== undefined) set.role = input.role;
  if (input.isActive !== undefined) set.isActive = input.isActive;
  if (input.password !== undefined) {
    set.passwordHash = await hashPassword(input.password);
  }
  if (Object.keys(set).length > 0) {
    await db.update(users).set(set).where(eq(users.id, id));
  }

  if (input.isActive === false) {
    await revokeAllUserTokens(db, id);
  }

  const updated = await findUserById(db, id);
  if (!updated) {
    throw new Error("User disappeared immediately after update");
  }
  return updated;
}

export async function deleteUser(db: DbOrTx, id: number): Promise<void> {
  const existing = await findUserById(db, id);
  if (!existing) {
    throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  }

  const movements = await countUserMovements(db, id);
  if (movements > 0) {
    throw new ApiError(
      409,
      "USER_HAS_MOVEMENTS",
      "User has stock movements; deactivate the account instead of deleting it",
    );
  }
  if (
    existing.role === "admin" &&
    existing.isActive &&
    (await countActiveAdmins(db)) <= 1
  ) {
    throw new ApiError(409, "LAST_ADMIN", "Cannot remove the last active admin");
  }

  // refresh_tokens cascade on delete (FK ON DELETE CASCADE).
  await db.delete(users).where(eq(users.id, id));
}