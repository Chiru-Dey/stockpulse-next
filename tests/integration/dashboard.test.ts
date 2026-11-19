import { describe, expect, it } from "vitest";
import { GET as summaryRoute } from "@/app/api/dashboard/summary/route";
import { POST as createMovementRoute } from "@/app/api/stock-movements/route";
import { DELETE as archiveProductRoute } from "@/app/api/products/[id]/route";
import { getDb } from "@/lib/db/client";
import { products, stockMovements } from "@/lib/db/schema";
import { createCategory } from "@/lib/services/categories";
import { createProduct } from "@/lib/services/products";
import { TREND_DAYS } from "@/lib/services/dashboard";
import { adminToken, makeUser, req, json } from "./helpers";

function ctx(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

async function seedProduct(sku: string, threshold = 5) {
  const db = getDb();
  const category = await createCategory(db, { name: `Cat ${sku}` });
  const row = await createProduct(db, {
    sku,
    name: `Product ${sku}`,
    categoryId: category.id,
    lowStockThreshold: threshold,
  });
  return row.product;
}

function move(token: string, productId: number, type: "IN" | "OUT", quantity: number) {
  return createMovementRoute(
    req("POST", "/api/stock-movements", {
      token,
      body: { product_id: productId, movement_type: type, quantity },
    }),
  );
}

// Fixture-only backdated ledger row (the API always stamps "now").
async function backdatedMove(
  productId: number,
  userId: number,
  type: "IN" | "OUT",
  quantity: number,
  daysAgo: number,
) {
  await getDb().insert(stockMovements).values({
    productId,
    movementType: type,
    quantity,
    createdBy: userId,
    createdAt: new Date(Date.now() - daysAgo * 86_400_000),
  });
}

describe("dashboard summary", () => {
  it("requires authentication", async () => {
    const res = await summaryRoute(req("GET", "/api/dashboard/summary"));
    expect(res.status).toBe(401);
  });

  it("returns a zeroed, zero-filled summary for an empty database", async () => {
    const token = await adminToken();
    const res = await summaryRoute(req("GET", "/api/dashboard/summary", { token }));
    expect(res.status).toBe(200);
    const body = await json(res);

    expect(body.products).toEqual({ total: 0, active: 0, archived: 0 });
    expect(body.stock_status).toEqual({ ok: 0, low: 0, out: 0 });
    expect(body.categories).toMatchObject({ total: 0, breakdown: [] });
    expect(body.low_stock).toEqual([]);
    expect(body.recent_movements).toEqual([]);

    const movements = body.movements as Record<string, unknown>;
    expect(movements.window_days).toBe(TREND_DAYS);
    expect(movements.in_qty).toBe(0);
    expect(movements.out_qty).toBe(0);
    expect(movements.count).toBe(0);
    const trend = movements.trend as Array<Record<string, unknown>>;
    expect(trend.length).toBe(TREND_DAYS);
    expect(trend.every((p) => p.in_qty === 0 && p.out_qty === 0)).toBe(true);
  });

  it("counts stock statuses and totals movements over the window", async () => {
    const token = await adminToken();
    const healthy = await seedProduct("DASH-OK");
    const low = await seedProduct("DASH-LOW");
    const out = await seedProduct("DASH-OUT");

    await move(token, healthy.id, "IN", 20);
    await move(token, healthy.id, "OUT", 5); // 15 -> ok
    await move(token, low.id, "IN", 10);
    await move(token, low.id, "OUT", 7); // 3 -> low
    await move(token, out.id, "IN", 4);
    await move(token, out.id, "OUT", 4); // 0 -> out

    const body = await json(await summaryRoute(req("GET", "/api/dashboard/summary", { token })));
    expect(body.products).toEqual({ total: 3, active: 3, archived: 0 });
    expect(body.stock_status).toEqual({ ok: 1, low: 1, out: 1 });

    const movements = body.movements as Record<string, unknown>;
    expect(movements.in_qty).toBe(34);
    expect(movements.out_qty).toBe(16);
    expect(movements.count).toBe(6);

    const trend = movements.trend as Array<Record<string, unknown>>;
    const today = new Date().toISOString().slice(0, 10);
    expect(trend[trend.length - 1]?.date).toBe(today);
    expect(trend[trend.length - 1]?.in_qty).toBe(34);
    expect(trend[trend.length - 1]?.out_qty).toBe(16);
  });

  it("excludes archived products from active counts and the watchlist", async () => {
    const token = await adminToken();
    const keep = await seedProduct("DASH-KEEP");
    const drop = await seedProduct("DASH-DROP");
    await move(token, keep.id, "IN", 50);
    await move(token, drop.id, "IN", 1); // low, then archived

    await archiveProductRoute(
      req("DELETE", `/api/products/${drop.id}`, { token }),
      ctx(drop.id),
    );

    const body = await json(await summaryRoute(req("GET", "/api/dashboard/summary", { token })));
    expect(body.products).toEqual({ total: 2, active: 1, archived: 1 });
    expect(body.stock_status).toEqual({ ok: 1, low: 0, out: 0 });

    const watchlist = body.low_stock as Array<Record<string, unknown>>;
    expect(watchlist.length).toBe(0);

    const categories = body.categories as Record<string, unknown>;
    const breakdown = categories.breakdown as Array<Record<string, unknown>>;
    const dropped = breakdown.find((row) => row.category_name === "Cat DASH-DROP");
    expect(dropped?.product_count).toBe(0);
  });

  it("orders the watchlist by quantity and caps it at 10", async () => {
    const token = await adminToken();
    const category = await createCategory(getDb(), { name: "Watchlist Cat" });

    // Batch fixture: 12 products, threshold 20, quantities 1..12 (all qualify).
    await getDb().insert(products).values(
      Array.from({ length: 12 }, (_, index) => ({
        sku: `WATCH-${index + 1}`,
        name: `Watch ${index + 1}`,
        categoryId: category.id,
        lowStockThreshold: 20,
        stockQty: index + 1,
      })),
    );

    const body = await json(await summaryRoute(req("GET", "/api/dashboard/summary", { token })));
    const watchlist = body.low_stock as Array<Record<string, unknown>>;
    expect(watchlist.length).toBe(10);
    expect(watchlist[0]?.stock_qty).toBe(1);
    expect(watchlist[9]?.stock_qty).toBe(10);
    expect(watchlist[0]?.stock_status).toBe("low");
    expect((body.stock_status as Record<string, unknown>).low).toBe(12);
  }, 60_000);

  it("buckets backdated movements into the right trend days", async () => {
    const token = await adminToken();
    const { user } = await makeUser("staff");
    const product = await seedProduct("TREND-1");

    await backdatedMove(product.id, user.id, "IN", 30, 3);
    await backdatedMove(product.id, user.id, "OUT", 10, 1);
    await move(token, product.id, "IN", 5);

    const body = await json(await summaryRoute(req("GET", "/api/dashboard/summary", { token })));
    const movements = body.movements as Record<string, unknown>;
    const trend = movements.trend as Array<Record<string, unknown>>;

    const keyFor = (daysAgo: number) => {
      const now = new Date();
      const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      return new Date(start - daysAgo * 86_400_000).toISOString().slice(0, 10);
    };

    expect(trend.find((p) => p.date === keyFor(3))?.in_qty).toBe(30);
    expect(trend.find((p) => p.date === keyFor(1))?.out_qty).toBe(10);
    expect(trend.find((p) => p.date === keyFor(0))?.in_qty).toBe(5);
    expect(movements.in_qty).toBe(35);
    expect(movements.out_qty).toBe(10);
    expect(movements.count).toBe(3);

    const recent = body.recent_movements as Array<Record<string, unknown>>;
    expect(recent.length).toBe(3);
    expect(recent[0]?.movement_type).toBe("IN"); // newest first
  });
});