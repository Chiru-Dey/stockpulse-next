import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  GET as listProductsRoute,
  POST as createProductRoute,
} from "@/app/api/products/route";
import {
  GET as getProductRoute,
  PATCH as patchProductRoute,
  DELETE as deleteProductRoute,
} from "@/app/api/products/[id]/route";
import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { createCategory } from "@/lib/services/categories";
import { adminToken, staffToken, req, json } from "./helpers";

function ctx(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

async function makeProduct(
  token: string,
  body: { sku: string; name: string; category_id: number; low_stock_threshold?: number },
) {
  const res = await createProductRoute(req("POST", "/api/products", { token, body }));
  if (res.status !== 201) throw new Error(`create failed: ${res.status}`);
  return (await json(res)).product as Record<string, unknown> & { id: number };
}

// Fixture-only direct stock writes: simulates ledger outcomes. The API itself
// never allows changing stock_qty outside the movements ledger.
async function setStock(sku: string, qty: number): Promise<void> {
  await getDb().update(products).set({ stockQty: qty }).where(eq(products.sku, sku));
}

describe("products API", () => {
  it("enforces RBAC on every verb", async () => {
    const admin = await adminToken();
    const staff = await staffToken();
    const category = await createCategory(getDb(), { name: "RBAC" });
    const product = await makeProduct(admin, { sku: "R-1", name: "R", category_id: category.id });

    expect((await listProductsRoute(req("GET", "/api/products"))).status).toBe(401);
    expect((await listProductsRoute(req("GET", "/api/products", { token: staff }))).status).toBe(200);
    expect(
      (await createProductRoute(req("POST", "/api/products", {
        token: staff,
        body: { sku: "R-2", name: "No", category_id: category.id },
      }))).status,
    ).toBe(403);
    expect(
      (await patchProductRoute(req("PATCH", `/api/products/${product.id}`, { token: staff, body: { name: "No" } }), ctx(product.id))).status,
    ).toBe(403);
    expect(
      (await deleteProductRoute(req("DELETE", `/api/products/${product.id}`, { token: staff }), ctx(product.id))).status,
    ).toBe(403);
  });

  it("creates with qty 0 / status out, rejects duplicate SKUs and bad categories", async () => {
    const token = await adminToken();
    const category = await createCategory(getDb(), { name: "Create Cat" });

    const product = await makeProduct(token, { sku: "c-1", name: "Created", category_id: category.id });
    expect(product.sku).toBe("C-1");
    expect(product.stock_qty).toBe(0);
    expect(product.stock_status).toBe("out");
    expect(product.category_name).toBe("Create Cat");

    const duplicate = await createProductRoute(
      req("POST", "/api/products", { token, body: { sku: "C-1", name: "Dup", category_id: category.id } }),
    );
    expect(duplicate.status).toBe(409);
    expect((await json(duplicate)).error).toMatchObject({ code: "SKU_EXISTS" });

    const badCategory = await createProductRoute(
      req("POST", "/api/products", { token, body: { sku: "C-2", name: "Bad", category_id: 999999 } }),
    );
    expect(badCategory.status).toBe(400);
    expect((await json(badCategory)).error).toMatchObject({ code: "CATEGORY_NOT_FOUND" });

    const invalid = await createProductRoute(
      req("POST", "/api/products", { token, body: { sku: "", name: "Bad", category_id: category.id } }),
    );
    expect(invalid.status).toBe(400);
  });

  it("filters by stock_status, category, and case-insensitive search", async () => {
    const token = await adminToken();
    const catA = await createCategory(getDb(), { name: "Cat A" });
    const catB = await createCategory(getDb(), { name: "Cat B" });
    await makeProduct(token, { sku: "F-1", name: "Alpha Widget", category_id: catA.id });
    await makeProduct(token, { sku: "F-2", name: "Beta Widget", category_id: catA.id });
    await makeProduct(token, { sku: "F-3", name: "Gamma Gadget", category_id: catB.id });
    await setStock("F-1", 50); // ok (threshold 5)
    await setStock("F-2", 3); // low

    const low = await json(await listProductsRoute(req("GET", "/api/products?stock_status=low", { token })));
    expect(low.total).toBe(1);
    expect((low.items as Array<Record<string, unknown>>)[0]?.sku).toBe("F-2");

    const out = await json(await listProductsRoute(req("GET", "/api/products?stock_status=out", { token })));
    expect((out.items as Array<Record<string, unknown>>)[0]?.sku).toBe("F-3");

    const byCategory = await json(await listProductsRoute(req("GET", `/api/products?category_id=${catA.id}`, { token })));
    expect(byCategory.total).toBe(2);

    const byName = await json(await listProductsRoute(req("GET", "/api/products?search=WIDGET", { token })));
    expect(byName.total).toBe(2);

    const bySku = await json(await listProductsRoute(req("GET", "/api/products?search=f-3", { token })));
    expect(bySku.total).toBe(1);

    const combined = await json(await listProductsRoute(
      req("GET", `/api/products?category_id=${catB.id}&stock_status=out`, { token }),
    ));
    expect(combined.total).toBe(1);
  });

  it("archives idempotently, hides from lists, supports include_archived and restore", async () => {
    const token = await adminToken();
    const category = await createCategory(getDb(), { name: "Archive Cat" });
    const product = await makeProduct(token, { sku: "A-1", name: "Archivable", category_id: category.id });

    expect((await deleteProductRoute(req("DELETE", `/api/products/${product.id}`, { token }), ctx(product.id))).status).toBe(204);
    expect((await deleteProductRoute(req("DELETE", `/api/products/${product.id}`, { token }), ctx(product.id))).status).toBe(204);

    const defaultList = await json(await listProductsRoute(req("GET", "/api/products", { token })));
    expect(defaultList.total).toBe(0);

    const withArchived = await json(await listProductsRoute(req("GET", "/api/products?include_archived=true", { token })));
    expect(withArchived.total).toBe(1);

    const byId = await getProductRoute(req("GET", `/api/products/${product.id}`, { token }), ctx(product.id));
    expect(byId.status).toBe(200);
    expect(((await json(byId)).product as Record<string, unknown>).archived_at).toBeTypeOf("string");

    const restored = await patchProductRoute(
      req("PATCH", `/api/products/${product.id}`, { token, body: { archived: false } }),
      ctx(product.id),
    );
    expect(restored.status).toBe(200);
    expect(((await json(restored)).product as Record<string, unknown>).archived_at).toBeNull();
  });

  it("updates fields, validates category, blocks SKU collisions", async () => {
    const token = await adminToken();
    const catA = await createCategory(getDb(), { name: "Move From" });
    const catB = await createCategory(getDb(), { name: "Move To" });
    const first = await makeProduct(token, { sku: "U-1", name: "First", category_id: catA.id });
    await makeProduct(token, { sku: "U-2", name: "Second", category_id: catA.id });

    const updated = await patchProductRoute(
      req("PATCH", `/api/products/${first.id}`, {
        token,
        body: { name: "Renamed", sku: "u-1x", low_stock_threshold: 12, category_id: catB.id },
      }),
      ctx(first.id),
    );
    expect(updated.status).toBe(200);
    const body = (await json(updated)).product as Record<string, unknown>;
    expect(body.name).toBe("Renamed");
    expect(body.sku).toBe("U-1X");
    expect(body.low_stock_threshold).toBe(12);
    expect(body.category_name).toBe("Move To");

    const collision = await patchProductRoute(
      req("PATCH", `/api/products/${first.id}`, { token, body: { sku: "u-2" } }),
      ctx(first.id),
    );
    expect(collision.status).toBe(409);

    const badCategory = await patchProductRoute(
      req("PATCH", `/api/products/${first.id}`, { token, body: { category_id: 999999 } }),
      ctx(first.id),
    );
    expect(badCategory.status).toBe(400);
  });

  it("never lets PATCH change stock_qty", async () => {
    const token = await adminToken();
    const category = await createCategory(getDb(), { name: "Ledger Only" });
    const product = await makeProduct(token, { sku: "L-1", name: "Locked", category_id: category.id });

    const onlyStock = await patchProductRoute(
      req("PATCH", `/api/products/${product.id}`, { token, body: { stock_qty: 99 } }),
      ctx(product.id),
    );
    expect(onlyStock.status).toBe(400);

    const mixed = await patchProductRoute(
      req("PATCH", `/api/products/${product.id}`, { token, body: { name: "Renamed", stock_qty: 99 } }),
      ctx(product.id),
    );
    expect(mixed.status).toBe(200);
    expect(((await json(mixed)).product as Record<string, unknown>).stock_qty).toBe(0);
  });

  it("paginates with correct meta", async () => {
    const token = await adminToken();
    const category = await createCategory(getDb(), { name: "Pages" });
    await makeProduct(token, { sku: "P-1", name: "One", category_id: category.id });
    await makeProduct(token, { sku: "P-2", name: "Two", category_id: category.id });
    await makeProduct(token, { sku: "P-3", name: "Three", category_id: category.id });

    const page = await json(await listProductsRoute(req("GET", "/api/products?page=2&per_page=2", { token })));
    expect((page.items as unknown[]).length).toBe(1);
    expect(page).toMatchObject({ page: 2, per_page: 2, total: 3, pages: 2 });
  });
});