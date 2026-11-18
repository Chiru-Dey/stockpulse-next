import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  categories,
  products,
  stockMovements,
  users,
} from "../src/lib/db/schema";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const pool = mysql.createPool({
  host: requireEnv("DATABASE_HOST"),
  port: Number(process.env.DATABASE_PORT ?? "4000"),
  user: requireEnv("DATABASE_USER"),
  password: requireEnv("DATABASE_PASSWORD"),
  database: requireEnv("DATABASE_NAME"),
  connectionLimit: 1,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});

const db = drizzle(pool);

const seedUsers = [
  {
    name: "Asha Menon",
    email: "admin@stockpulse.dev",
    role: "admin" as const,
    passwordEnv: "SEED_ADMIN_PASSWORD",
  },
  {
    name: "Ravi Kumar",
    email: "staff@stockpulse.dev",
    role: "staff" as const,
    passwordEnv: "SEED_STAFF_PASSWORD",
  },
];

const seedCategories = [
  { name: "Beverages", description: "Drinks and bottled beverages" },
  { name: "Snacks", description: "Packaged snacks and confectionery" },
  { name: "Stationery", description: "Office and school stationery" },
];

type SeedMovement = {
  type: "IN" | "OUT";
  quantity: number;
  daysAgo: number;
  note: string;
  by: "admin" | "staff";
};

type SeedProduct = {
  sku: string;
  name: string;
  description: string;
  category: string;
  lowStockThreshold: number;
  archived?: boolean;
  movements: SeedMovement[];
};

const seedProducts: SeedProduct[] = [
  {
    sku: "SKU-BEV-001",
    name: "Mineral Water 1L",
    description: "Packaged drinking water, 1 litre bottle",
    category: "Beverages",
    lowStockThreshold: 10,
    movements: [
      { type: "IN", quantity: 120, daysAgo: 6, note: "Opening stock", by: "admin" },
      { type: "OUT", quantity: 30, daysAgo: 2, note: "Counter sales", by: "staff" },
    ],
  },
  {
    sku: "SKU-BEV-002",
    name: "Orange Juice 1L",
    description: "100% orange juice, 1 litre carton",
    category: "Beverages",
    lowStockThreshold: 8,
    movements: [
      { type: "IN", quantity: 40, daysAgo: 5, note: "Supplier delivery", by: "admin" },
      { type: "OUT", quantity: 34, daysAgo: 1, note: "Weekend sales", by: "staff" },
    ],
  },
  {
    sku: "SKU-BEV-003",
    name: "Cola Can 330ml",
    description: "Carbonated cola drink, 330 ml can",
    category: "Beverages",
    lowStockThreshold: 12,
    movements: [
      { type: "IN", quantity: 60, daysAgo: 4, note: "Supplier delivery", by: "admin" },
      { type: "OUT", quantity: 60, daysAgo: 0, note: "Bulk order", by: "staff" },
    ],
  },
  {
    sku: "SKU-SNK-001",
    name: "Potato Chips 150g",
    description: "Salted potato chips, 150 g pack",
    category: "Snacks",
    lowStockThreshold: 5,
    movements: [
      { type: "IN", quantity: 50, daysAgo: 3, note: "Opening stock", by: "admin" },
      { type: "OUT", quantity: 20, daysAgo: 1, note: "Counter sales", by: "staff" },
    ],
  },
  {
    sku: "SKU-SNK-002",
    name: "Chocolate Bar 90g",
    description: "Milk chocolate bar, 90 g",
    category: "Snacks",
    lowStockThreshold: 6,
    movements: [
      { type: "IN", quantity: 24, daysAgo: 2, note: "Supplier delivery", by: "admin" },
      { type: "OUT", quantity: 18, daysAgo: 0, note: "Counter sales", by: "staff" },
    ],
  },
  {
    sku: "SKU-SNK-003",
    name: "Roasted Almonds 200g",
    description: "Dry roasted almonds, 200 g jar",
    category: "Snacks",
    lowStockThreshold: 4,
    movements: [
      { type: "IN", quantity: 15, daysAgo: 1, note: "Supplier delivery", by: "admin" },
    ],
  },
  {
    sku: "SKU-STN-001",
    name: "A4 Notebook 200 pages",
    description: "Ruled A4 notebook, 200 pages",
    category: "Stationery",
    lowStockThreshold: 5,
    movements: [
      { type: "IN", quantity: 30, daysAgo: 6, note: "Opening stock", by: "admin" },
      { type: "OUT", quantity: 27, daysAgo: 3, note: "School season sales", by: "staff" },
    ],
  },
  {
    sku: "SKU-STN-002",
    name: "Ballpoint Pen Blue",
    description: "Blue ballpoint pen, 0.7 mm tip",
    category: "Stationery",
    lowStockThreshold: 10,
    archived: true,
    movements: [
      { type: "IN", quantity: 100, daysAgo: 6, note: "Opening stock", by: "admin" },
      { type: "OUT", quantity: 40, daysAgo: 2, note: "Counter sales", by: "staff" },
    ],
  },
];

async function main(): Promise<void> {
  // 1. Users — insert only missing emails, never overwrite existing passwords.
  const userEmails = seedUsers.map((u) => u.email);
  const existingUsers = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.email, userEmails));
  const existingEmails = new Set(existingUsers.map((u) => u.email));

  const missingUsers = [];
  for (const seedUser of seedUsers) {
    if (existingEmails.has(seedUser.email)) continue;
    const password = requireEnv(seedUser.passwordEnv);
    const passwordHash = await bcrypt.hash(password, 10);
    missingUsers.push({
      name: seedUser.name,
      email: seedUser.email,
      passwordHash,
      role: seedUser.role,
    });
  }
  if (missingUsers.length > 0) {
    await db.insert(users).values(missingUsers);
  }

  // Re-select by unique key: TiDB batch AUTO_INCREMENT ids are not guaranteed
  // consecutive, so we never compute ids from insertId offsets.
  const userRows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, userEmails));
  const userIdByEmail = new Map(userRows.map((u) => [u.email, u.id]));
  const adminId = userIdByEmail.get("admin@stockpulse.dev");
  const staffId = userIdByEmail.get("staff@stockpulse.dev");
  if (adminId === undefined || staffId === undefined) {
    throw new Error("Seed users are missing after insert — aborting.");
  }

  // 2. Categories.
  const categoryNames = seedCategories.map((c) => c.name);
  const existingCategories = await db
    .select({ name: categories.name })
    .from(categories)
    .where(inArray(categories.name, categoryNames));
  const existingCategoryNames = new Set(existingCategories.map((c) => c.name));
  const missingCategories = seedCategories.filter(
    (c) => !existingCategoryNames.has(c.name),
  );
  if (missingCategories.length > 0) {
    await db.insert(categories).values(missingCategories);
  }
  const categoryRows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(inArray(categories.name, categoryNames));
  const categoryIdByName = new Map(categoryRows.map((c) => [c.name, c.id]));

  // 3. Products (stock_qty starts at 0; the ledger below sets the true value).
  const skus = seedProducts.map((p) => p.sku);
  const existingProducts = await db
    .select({ sku: products.sku })
    .from(products)
    .where(inArray(products.sku, skus));
  const existingSkus = new Set(existingProducts.map((p) => p.sku));
  const missingProducts = [];
  for (const seedProduct of seedProducts) {
    if (existingSkus.has(seedProduct.sku)) continue;
    const categoryId = categoryIdByName.get(seedProduct.category);
    if (categoryId === undefined) {
      throw new Error(`Category not found for ${seedProduct.sku}`);
    }
    missingProducts.push({
      sku: seedProduct.sku,
      name: seedProduct.name,
      description: seedProduct.description,
      categoryId,
      lowStockThreshold: seedProduct.lowStockThreshold,
      stockQty: 0,
      archivedAt: seedProduct.archived ? new Date() : null,
    });
  }
  if (missingProducts.length > 0) {
    await db.insert(products).values(missingProducts);
  }
  const productRows = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(inArray(products.sku, skus));
  const productIdBySku = new Map(productRows.map((p) => [p.sku, p.id]));

  // 4. Movements + cached stock_qty, per product, inside a transaction.
  //    Skip any product that already has ledger rows (idempotent re-runs).
  let movementsInserted = 0;
  for (const seedProduct of seedProducts) {
    const productId = productIdBySku.get(seedProduct.sku);
    if (productId === undefined) {
      throw new Error(`Product not found after insert: ${seedProduct.sku}`);
    }
    const counted = await db
      .select({ value: sql<number>`COUNT(*)` })
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));
    if (Number(counted[0]?.value ?? 0) > 0) {
      console.log(`  movements: ${seedProduct.sku} already seeded — skipped`);
      continue;
    }

    const net = seedProduct.movements.reduce(
      (sum, m) => sum + (m.type === "IN" ? m.quantity : -m.quantity),
      0,
    );
    if (net < 0) {
      throw new Error(`Seed data error: ${seedProduct.sku} would go negative`);
    }

    const rows = seedProduct.movements.map((m) => ({
      productId,
      movementType: m.type,
      quantity: m.quantity,
      note: m.note,
      createdBy: m.by === "admin" ? adminId : staffId,
      createdAt: sql`DATE_SUB(NOW(), INTERVAL ${m.daysAgo} DAY)`,
    }));

    await db.transaction(async (tx) => {
      await tx.insert(stockMovements).values(rows);
      await tx
        .update(products)
        .set({ stockQty: net })
        .where(eq(products.id, productId));
    });
    movementsInserted += rows.length;
    console.log(`  movements: ${seedProduct.sku} -> ${rows.length} rows, stock_qty=${net}`);
  }

  // 5. Summary.
  const [userCount] = await db.select({ value: sql<number>`COUNT(*)` }).from(users);
  const [categoryCount] = await db.select({ value: sql<number>`COUNT(*)` }).from(categories);
  const [productCount] = await db.select({ value: sql<number>`COUNT(*)` }).from(products);
  const [movementCount] = await db.select({ value: sql<number>`COUNT(*)` }).from(stockMovements);

  console.log("\nSeed complete.");
  console.log(`  users:          ${Number(userCount?.value ?? 0)}`);
  console.log(`  categories:     ${Number(categoryCount?.value ?? 0)}`);
  console.log(`  products:       ${Number(productCount?.value ?? 0)}`);
  console.log(`  stock_movements:${Number(movementCount?.value ?? 0)} (${movementsInserted} inserted this run)`);
  console.log("\nDemo logins (passwords are the SEED_* values in your .env):");
  console.log("  admin@stockpulse.dev / staff@stockpulse.dev");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());