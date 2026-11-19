import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { categories, products, users } from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/client";
import { sendEmail, type EmailAddress, type SendResult } from "@/lib/email/mailer";
import {
  renderDailyDigest,
  renderLowStockAlert,
  type DigestItem,
} from "@/lib/email/templates";

const DIGEST_ITEM_LIMIT = 100;

/** True only on the transition from above the threshold to at/below it. */
export function crossedLowStock(
  previousQty: number,
  newQty: number,
  threshold: number,
): boolean {
  return previousQty > threshold && newQty <= threshold;
}

function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export async function getAlertRecipients(db: DbOrTx): Promise<EmailAddress[]> {
  const rows = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)))
    .orderBy(asc(users.id));
  return rows.map((row) => ({ email: row.email, name: row.name }));
}

export type LowStockRow = DigestItem & { id: number };

export async function getLowStockItems(db: DbOrTx): Promise<LowStockRow[]> {
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      category_name: categories.name,
      stock_qty: products.stockQty,
      low_stock_threshold: products.lowStockThreshold,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        isNull(products.archivedAt),
        lte(products.stockQty, products.lowStockThreshold),
      ),
    )
    .orderBy(asc(products.stockQty), asc(products.id))
    .limit(DIGEST_ITEM_LIMIT);

  return rows.map((row) => ({
    ...row,
    stock_status: row.stock_qty === 0 ? ("out" as const) : ("low" as const),
  }));
}

export type LowStockAlertInput = {
  sku: string;
  name: string;
  previousQty: number;
  newQty: number;
  threshold: number;
  movementQuantity: number;
  actorName: string;
  occurredAt: Date;
};

export async function sendLowStockAlert(
  db: DbOrTx,
  input: LowStockAlertInput,
): Promise<SendResult> {
  const recipients = await getAlertRecipients(db);
  const rendered = renderLowStockAlert({
    sku: input.sku,
    name: input.name,
    stock_qty: input.newQty,
    low_stock_threshold: input.threshold,
    movement_quantity: input.movementQuantity,
    actor_name: input.actorName,
    occurred_at: input.occurredAt.toISOString(),
    app_url: appUrl(),
  });

  return sendEmail({
    to: recipients,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    tags: ["low-stock-alert"],
  });
}

export type DigestResult = SendResult & { items: number; out_of_stock: number };

export async function sendDailyDigest(db: DbOrTx): Promise<DigestResult> {
  const [items, recipients] = await Promise.all([
    getLowStockItems(db),
    getAlertRecipients(db),
  ]);
  const rendered = renderDailyDigest({
    generated_at: new Date().toISOString(),
    app_url: appUrl(),
    items,
  });

  const result = await sendEmail({
    to: recipients,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    tags: ["daily-digest"],
  });

  return {
    ...result,
    items: items.length,
    out_of_stock: items.filter((item) => item.stock_status === "out").length,
  };
}