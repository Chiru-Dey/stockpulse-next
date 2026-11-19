import { and, asc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { categories, products, stockMovements } from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/client";
import {
  listMovements,
  toPublicMovement,
  type PublicMovement,
} from "./movements";
import { toPublicProduct, type PublicProduct } from "./products";

export const TREND_DAYS = 7;
const WATCHLIST_LIMIT = 10;
const RECENT_LIMIT = 5;
const DAY_MS = 86_400_000;

export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function lastNDayKeys(days: number, now: Date = new Date()): string[] {
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(utcDateKey(new Date(startOfToday - offset * DAY_MS)));
  }
  return keys;
}

export type TrendPoint = { date: string; in_qty: number; out_qty: number };

export type TrendRow = { day: string; in_qty: number; out_qty: number };

export function fillTrendSeries(
  dayKeys: string[],
  rows: TrendRow[],
): TrendPoint[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return dayKeys.map((date) => {
    const row = byDay.get(date);
    return {
      date,
      in_qty: Number(row?.in_qty ?? 0),
      out_qty: Number(row?.out_qty ?? 0),
    };
  });
}

type DayAggregate = { count: number; in_qty: number; out_qty: number };

/**
 * One bounded aggregate per UTC day: static field names (no dynamic keys to
 * trip strict indexing) and no GROUP BY on an expression, which TiDB's
 * only_full_group_by rejects. Bucketing uses explicit UTC instants, so it is
 * independent of the server's DATE() timezone handling.
 */
async function aggregateDay(
  db: DbOrTx,
  start: Date,
  end: Date,
): Promise<DayAggregate> {
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      in_qty: sql<number>`COALESCE(SUM(CASE WHEN ${stockMovements.movementType} = 'IN' THEN ${stockMovements.quantity} ELSE 0 END), 0)`,
      out_qty: sql<number>`COALESCE(SUM(CASE WHEN ${stockMovements.movementType} = 'OUT' THEN ${stockMovements.quantity} ELSE 0 END), 0)`,
    })
    .from(stockMovements)
    .where(
      and(
        gte(stockMovements.createdAt, start),
        lt(stockMovements.createdAt, end),
      ),
    );

  return {
    count: Number(row?.count ?? 0),
    in_qty: Number(row?.in_qty ?? 0),
    out_qty: Number(row?.out_qty ?? 0),
  };
}

export type DashboardSummary = {
  generated_at: string;
  products: { total: number; active: number; archived: number };
  stock_status: { ok: number; low: number; out: number };
  movements: {
    window_days: number;
    in_qty: number;
    out_qty: number;
    count: number;
    trend: TrendPoint[];
  };
  categories: {
    total: number;
    breakdown: {
      category_id: number;
      category_name: string;
      product_count: number;
      low_stock_count: number;
    }[];
  };
  low_stock: PublicProduct[];
  recent_movements: PublicMovement[];
};

export async function getDashboardSummary(
  db: DbOrTx,
  now: Date = new Date(),
): Promise<DashboardSummary> {
  const dayKeys = lastNDayKeys(TREND_DAYS, now);

  const dayAggregates = await Promise.all(
    dayKeys.map((key) => {
      const start = new Date(`${key}T00:00:00.000Z`);
      const end = new Date(start.getTime() + DAY_MS);
      return aggregateDay(db, start, end);
    }),
  );

  const trend = fillTrendSeries(
    dayKeys,
    dayKeys.map((key, index) => ({
      day: key,
      in_qty: dayAggregates[index]?.in_qty ?? 0,
      out_qty: dayAggregates[index]?.out_qty ?? 0,
    })),
  );
  const windowCount = dayAggregates.reduce((sum, day) => sum + day.count, 0);

  const [counts] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      archived: sql<number>`COALESCE(SUM(CASE WHEN ${products.archivedAt} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
      active: sql<number>`COALESCE(SUM(CASE WHEN ${products.archivedAt} IS NULL THEN 1 ELSE 0 END), 0)`,
      out_count: sql<number>`COALESCE(SUM(CASE WHEN ${products.archivedAt} IS NULL AND ${products.stockQty} = 0 THEN 1 ELSE 0 END), 0)`,
      low_count: sql<number>`COALESCE(SUM(CASE WHEN ${products.archivedAt} IS NULL AND ${products.stockQty} > 0 AND ${products.stockQty} <= ${products.lowStockThreshold} THEN 1 ELSE 0 END), 0)`,
      ok_count: sql<number>`COALESCE(SUM(CASE WHEN ${products.archivedAt} IS NULL AND ${products.stockQty} > ${products.lowStockThreshold} THEN 1 ELSE 0 END), 0)`,
    })
    .from(products);

  const [categoryCount] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(categories);

  const breakdownRows = await db
    .select({
      category_id: categories.id,
      category_name: categories.name,
      product_count: sql<number>`COUNT(${products.id})`,
      low_stock_count: sql<number>`COALESCE(SUM(CASE WHEN ${products.id} IS NOT NULL AND ${products.stockQty} <= ${products.lowStockThreshold} THEN 1 ELSE 0 END), 0)`,
    })
    .from(categories)
    .leftJoin(
      products,
      and(eq(products.categoryId, categories.id), isNull(products.archivedAt)),
    )
    .groupBy(categories.id, categories.name)
    .orderBy(asc(categories.name));

  const watchlistRows = await db
    .select({
      product: products,
      category_name: categories.name,
      stock_status: sql<"ok" | "low" | "out">`CASE
        WHEN ${products.stockQty} = 0 THEN 'out'
        WHEN ${products.stockQty} <= ${products.lowStockThreshold} THEN 'low'
        ELSE 'ok'
      END`,
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
    .limit(WATCHLIST_LIMIT);

  const recent = await listMovements(db, {}, {
    page: 1,
    perPage: RECENT_LIMIT,
    offset: 0,
    limit: RECENT_LIMIT,
  });

  return {
    generated_at: now.toISOString(),
    products: {
      total: Number(counts?.total ?? 0),
      active: Number(counts?.active ?? 0),
      archived: Number(counts?.archived ?? 0),
    },
    stock_status: {
      ok: Number(counts?.ok_count ?? 0),
      low: Number(counts?.low_count ?? 0),
      out: Number(counts?.out_count ?? 0),
    },
    movements: {
      window_days: TREND_DAYS,
      in_qty: trend.reduce((sum, point) => sum + point.in_qty, 0),
      out_qty: trend.reduce((sum, point) => sum + point.out_qty, 0),
      count: windowCount,
      trend,
    },
    categories: {
      total: Number(categoryCount?.value ?? 0),
      breakdown: breakdownRows.map((row) => ({
        category_id: row.category_id,
        category_name: row.category_name,
        product_count: Number(row.product_count),
        low_stock_count: Number(row.low_stock_count),
      })),
    },
    low_stock: watchlistRows.map(toPublicProduct),
    recent_movements: recent.rows.map(toPublicMovement),
  };
}