import {
  bigint,
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: mysqlEnum("role", ["admin", "staff"]).notNull().default("staff"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [uniqueIndex("uq_users_email").on(table.email)],
);

export const categories = mysqlTable(
  "categories",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [uniqueIndex("uq_categories_name").on(table.name)],
);

export const products = mysqlTable(
  "products",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    sku: varchar("sku", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    categoryId: bigint("category_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    lowStockThreshold: int("low_stock_threshold").notNull().default(5),
    stockQty: int("stock_qty").notNull().default(0),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .onUpdateNow(),
  },
  (table) => [
    uniqueIndex("uq_products_sku").on(table.sku),
    index("idx_products_category_id").on(table.categoryId),
    index("idx_products_archived_at").on(table.archivedAt),
  ],
);

export const stockMovements = mysqlTable(
  "stock_movements",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    productId: bigint("product_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    movementType: mysqlEnum("movement_type", ["IN", "OUT"]).notNull(),
    quantity: int("quantity").notNull(),
    note: varchar("note", { length: 500 }),
    createdBy: bigint("created_by", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_movements_product_created").on(table.productId, table.createdAt),
    index("idx_movements_created_at").on(table.createdAt),
  ],
);

export const refreshTokens = mysqlTable(
  "refresh_tokens",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_refresh_tokens_hash").on(table.tokenHash),
    index("idx_refresh_tokens_user_id").on(table.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;