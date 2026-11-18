import { eq } from "drizzle-orm";
import { users, type User } from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { ApiError } from "@/lib/api/errors";
import type { Role } from "@/lib/auth/jwt";

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