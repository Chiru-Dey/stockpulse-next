import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { GET as cronRoute } from "@/app/api/cron/low-stock-digest/route";
import { POST as createMovementRoute } from "@/app/api/stock-movements/route";
import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { createCategory } from "@/lib/services/categories";
import { createProduct } from "@/lib/services/products";
import { updateUser } from "@/lib/services/users";
import {
  getLowStockItems,
  sendLowStockAlert,
} from "@/lib/services/alerts";
import { adminToken, makeUser, req, json } from "./helpers";

const CRON_SECRET = "integration-cron-secret"; // set in setup.ts

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

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

async function stockOf(productId: number): Promise<number> {
  const [row] = await getDb()
    .select({ qty: products.stockQty })
    .from(products)
    .where(eq(products.id, productId));
  return row?.qty ?? -1;
}

describe("cron endpoint security", () => {
  it("rejects missing and wrong secrets", async () => {
    const anonymous = await cronRoute(req("GET", "/api/cron/low-stock-digest"));
    expect(anonymous.status).toBe(401);

    const wrong = await cronRoute(
      req("GET", "/api/cron/low-stock-digest", { token: "not-the-cron-secret" }),
    );
    expect(wrong.status).toBe(401);
  });

  it("accepts the Bearer secret and reports the sweep + digest", async () => {
    const res = await cronRoute(
      req("GET", "/api/cron/low-stock-digest", { token: CRON_SECRET }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.reconcile).toMatchObject({ drifted: 0, corrected: 0 });
    expect(body.digest).toMatchObject({ items: 0, out_of_stock: 0, skipped: true });
  });

  it("accepts the x-cron-secret header too", async () => {
    const res = await cronRoute(
      new Request("http://localhost:3000/api/cron/low-stock-digest", {
        headers: { "x-cron-secret": CRON_SECRET },
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe("alert recipients and items", () => {
  it("targets only active admins", async () => {
    await makeUser("admin");
    await makeUser("staff");
    const second = await makeUser("admin");
    await updateUser(getDb(), second.user.id, { isActive: false });

    const product = await seedProduct("ALERT-REC");
    const result = await sendLowStockAlert(getDb(), {
      sku: product.sku,
      name: product.name,
      previousQty: 10,
      newQty: 2,
      threshold: 5,
      movementQuantity: 8,
      actorName: "Tester",
      occurredAt: new Date(),
    });

    expect(result).toEqual({ skipped: true, recipients: 1 });
  });

  it("lists low and out items ordered by quantity", async () => {
    const token = await adminToken();
    const out = await seedProduct("ALERT-OUT");
    const low = await seedProduct("ALERT-LOW");
    const healthy = await seedProduct("ALERT-OK");
    await move(token, out.id, "IN", 3);
    await move(token, out.id, "OUT", 3); // 0 -> out
    await move(token, low.id, "IN", 4); // 4 -> low
    await move(token, healthy.id, "IN", 50); // ok

    const items = await getLowStockItems(getDb());
    expect(items.length).toBe(2);
    expect(items[0]?.sku).toBe("ALERT-OUT");
    expect(items[0]?.stock_status).toBe("out");
    expect(items[1]?.stock_status).toBe("low");
  });

  it("never calls the network when email is unconfigured", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("network must not be used in tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await makeUser("admin");
      const product = await seedProduct("ALERT-NONET");
      const result = await sendLowStockAlert(getDb(), {
        sku: product.sku,
        name: product.name,
        previousQty: 10,
        newQty: 1,
        threshold: 5,
        movementQuantity: 9,
        actorName: "Tester",
        occurredAt: new Date(),
      });
      expect(result.skipped).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("threshold crossing and cron maintenance", () => {
  it("records the crossing movement successfully without blocking on email", async () => {
    const token = await adminToken();
    const product = await seedProduct("CROSS-1");
    expect((await move(token, product.id, "IN", 10)).status).toBe(201);

    const crossing = await move(token, product.id, "OUT", 7);
    expect(crossing.status).toBe(201);
    expect(await stockOf(product.id)).toBe(3);

    // Second OUT stays below the threshold: still succeeds, no new alert.
    expect((await move(token, product.id, "OUT", 1)).status).toBe(201);
    expect(await stockOf(product.id)).toBe(2);
  });

  it("cron detects and repairs cached-stock drift, then reports the digest", async () => {
    const token = await adminToken();
    const drifted = await seedProduct("DRIFT-1");
    const out = await seedProduct("DRIFT-OUT");
    await move(token, drifted.id, "IN", 7);
    await move(token, out.id, "IN", 2);
    await move(token, out.id, "OUT", 2); // 0 -> out

    // Fixture-only corruption of the cached value.
    await getDb().update(products).set({ stockQty: 99 }).where(eq(products.id, drifted.id));

    const res = await cronRoute(
      req("GET", "/api/cron/low-stock-digest", { token: CRON_SECRET }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);

    expect(body.reconcile).toMatchObject({ drifted: 1, corrected: 1 });
    const details = (body.reconcile as Record<string, unknown>).details as Array<Record<string, unknown>>;
    expect(details[0]).toMatchObject({ cached_qty: 99, ledger_qty: 7, drift: 92, corrected: true });
    expect(await stockOf(drifted.id)).toBe(7);

    expect(body.digest).toMatchObject({ items: 1, out_of_stock: 1, skipped: true });

    // Second run: nothing left to repair.
    const again = await json(await cronRoute(
      req("GET", "/api/cron/low-stock-digest", { token: CRON_SECRET }),
    ));
    expect(again.reconcile).toMatchObject({ drifted: 0, corrected: 0 });
  });
});