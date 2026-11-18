import "dotenv/config";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { getDb, getPool } from "@/lib/db/client";

// Hard override: integration tests must never touch the real schema.
process.env.DATABASE_NAME = "stockpulse_test";
process.env.AUTH_JWT_SECRET =
  "integration-test-secret-0123456789abcdef0123456789abcdef";

beforeAll(async () => {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
}, 60_000);

beforeEach(async () => {
  const db = getDb();
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of [
    "stock_movements",
    "refresh_tokens",
    "products",
    "categories",
    "users",
  ]) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${table}`));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
});

afterAll(async () => {
  await getPool().end();
});