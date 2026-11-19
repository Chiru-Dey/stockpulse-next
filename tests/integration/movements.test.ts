import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  GET as listMovementsRoute,
  POST as createMovementRoute,
} from "@/app/api/stock-movements/route";
import { GET as getMovementRoute } from "@/app/api/stock-movements/[id]/route";
import { GET as getProductRoute } from "@/app/api/products/[id]/route";
import { DELETE as archiveProductRoute } from "@/app/api/products/[id]/route";
import { getDb } from "@/lib/db/client";
import { products, stockMovements } from "@/lib/db/schema";
import { createCategory } from "@/lib/services/categories";
import { createProduct } from "@/lib/services/products";
import {
  getLedgerBalance,
  reconcileProductStock,
} from "@/lib/services/movements";
import { adminToken, staffToken, req, json } from "./helpers";

function ctx(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

async function seedProduct(sku: string) {
  const db = getDb();
  const category = await createCategory(db, { name: `Cat ${sku}` });
  const row = await createProduct(db, {
    sku,
    name: `Product ${sku}`,
    categoryId: category.id,
    lowStockThreshold: 5,
  });
  return row.product;
}

function move(
  token: string,
  productId: number,
  type: "IN" | "OUT",
  quantity: number,
  note?: string,
) {
  return createMovementRoute(
    req("POST", "/api/stock-movements", {
      token,
      body: { product_id: productId, movement_type: type, quantity, note },
    }),
  );
}

async function stockOf(productId: number): Promise<number> {
  const [row] = await getDb()
    .select({ qty: products.stockQty })
    .from(products)
    .where(eq(products.id, productId));
  return row?.qty ?? -1;
}

async function ledgerCount(productId: number): Promise<number> {
  const [row] = await getDb()
    .select({ value: sql<number>`COUNT(*)` })
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId));
  return Number(row?.value ?? 0);
}

describe("stock movements ledger", () => {
  it("requires auth, and lets staff record movements", async () => {
    const staff = await staffToken();
    const product = await seedProduct("RBAC-MV");

    expect((await listMovementsRoute(req("GET", "/api/stock-movements"))).status).toBe(401);
    expect((await move("", product.id, "IN", 1)).status).toBe(401);

    const staffMove = await move(staff, product.id, "IN", 3, "staff restock");
    expect(staffMove.status).toBe(201);
    const body = (await json(staffMove)).movement as Record<string, unknown>;
    expect(body.created_by_email).toContain("staff");
    expect(body.quantity).toBe(3);
  });

  it("applies IN then OUT, updates cached qty, and serves the ledger", async () => {
    const token = await adminToken();
    const product = await seedProduct("HAPPY-1");

    expect((await move(token, product.id, "IN", 10)).status).toBe(201);
    expect(await stockOf(product.id)).toBe(10);

    const out = await move(token, product.id, "OUT", 4, "sale");
    expect(out.status).toBe(201);
    expect(await stockOf(product.id)).toBe(6);

    const list = await json(await listMovementsRoute(req("GET", "/api/stock-movements", { token })));
    expect((list.pagination as Record<string, unknown>).total).toBe(2);
    const first = (list.data as Array<Record<string, unknown>>)[0];
    expect(first?.movement_type).toBe("OUT"); // newest first
    expect(first?.product_sku).toBe("HAPPY-1");

    const id = first?.id as number;
    const fetched = await getMovementRoute(req("GET", `/api/stock-movements/${id}`, { token }), ctx(id));
    expect(fetched.status).toBe(200);

    const missing = await getMovementRoute(req("GET", "/api/stock-movements/999999", { token }), ctx(999999));
    expect(missing.status).toBe(404);

    const productView = await json(await getProductRoute(req("GET", `/api/products/${product.id}`, { token }), ctx(product.id)));
    expect((productView.product as Record<string, unknown>).stock_qty).toBe(6);
  });

  it("rejects oversell with 409 and rolls the whole transaction back", async () => {
    const token = await adminToken();
    const product = await seedProduct("OVERSELL-1");
    await move(token, product.id, "IN", 2);

    const failed = await move(token, product.id, "OUT", 5);
    expect(failed.status).toBe(409);
    expect((await json(failed)).error).toMatchObject({ code: "INSUFFICIENT_STOCK" });

    expect(await stockOf(product.id)).toBe(2);
    expect(await ledgerCount(product.id)).toBe(1); // only the IN row exists
  });

  it("refuses movements on archived products", async () => {
    const token = await adminToken();
    const product = await seedProduct("ARCH-MV");
    await archiveProductRoute(req("DELETE", `/api/products/${product.id}`, { token }), ctx(product.id));

    const res = await move(token, product.id, "IN", 5);
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatchObject({ code: "PRODUCT_ARCHIVED" });
  });

  it("404s unknown products and 400s invalid payloads", async () => {
    const token = await adminToken();
    const unknown = await move(token, 999999, "IN", 1);
    expect(unknown.status).toBe(404);
    expect((await json(unknown)).error).toMatchObject({ code: "PRODUCT_NOT_FOUND" });

    const product = await seedProduct("BAD-PAYLOAD");
    expect((await move(token, product.id, "IN", 0)).status).toBe(400);
  });

  it("exposes no update or delete handler (append-only ledger)", async () => {
    const mod = await import("@/app/api/stock-movements/[id]/route");
    expect((mod as Record<string, unknown>).PATCH).toBeUndefined();
    expect((mod as Record<string, unknown>).DELETE).toBeUndefined();
    expect(typeof mod.GET).toBe("function");
  });

  it("filters by product, type and UTC date range", async () => {
    const token = await adminToken();
    const a = await seedProduct("FILTER-A");
    const b = await seedProduct("FILTER-B");
    await move(token, a.id, "IN", 10);
    await move(token, a.id, "OUT", 2);
    await move(token, b.id, "IN", 7);

    const byProduct = await json(await listMovementsRoute(req("GET", `/api/stock-movements?product_id=${a.id}`, { token })));
    expect((byProduct.pagination as Record<string, unknown>).total).toBe(2);

    const byType = await json(await listMovementsRoute(req("GET", "/api/stock-movements?movement_type=OUT", { token })));
    expect((byType.pagination as Record<string, unknown>).total).toBe(1);

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    const inRange = await json(await listMovementsRoute(
      req("GET", `/api/stock-movements?date_from=${today}&date_to=${today}`, { token }),
    ));
    expect((inRange.pagination as Record<string, unknown>).total).toBe(3);

    const outOfRange = await json(await listMovementsRoute(
      req("GET", `/api/stock-movements?date_from=${yesterday}&date_to=${yesterday}`, { token }),
    ));
    expect((outOfRange.pagination as Record<string, unknown>).total).toBe(0);
  });

  it("serializes concurrent OUT requests so stock never goes negative", async () => {
    const token = await adminToken();
    const product = await seedProduct("CONC-1");
    await move(token, product.id, "IN", 10);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => move(token, product.id, "OUT", 4)),
    );
    const statuses = results.map((res) => res.status);
    expect(statuses.filter((s) => s === 201).length).toBe(2); // 10 // 4
    expect(statuses.filter((s) => s === 409).length).toBe(3);

    expect(await stockOf(product.id)).toBe(2);
    expect(await getLedgerBalance(getDb(), product.id)).toBe(2);
    expect(await ledgerCount(product.id)).toBe(3); // 1 IN + 2 OUT
  }, 60_000);

  it("reconciles cached qty against the immutable ledger", async () => {
    const token = await adminToken();
    const product = await seedProduct("RECON-1");
    await move(token, product.id, "IN", 7);

    // Fixture-only corruption of the cache; the ledger stays truthful.
    await getDb().update(products).set({ stockQty: 99 }).where(eq(products.id, product.id));

    const first = await reconcileProductStock(getDb(), product.id);
    expect(first).toMatchObject({ cached_qty: 99, ledger_qty: 7, drift: 92, corrected: true });
    expect(await stockOf(product.id)).toBe(7);

    const second = await reconcileProductStock(getDb(), product.id);
    expect(second).toMatchObject({ ledger_qty: 7, drift: 0, corrected: false });
  });
});