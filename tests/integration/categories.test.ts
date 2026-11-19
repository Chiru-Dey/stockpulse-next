import { describe, expect, it } from "vitest";
import {
  GET as listCategoriesRoute,
  POST as createCategoryRoute,
} from "@/app/api/categories/route";
import {
  GET as getCategoryRoute,
  PATCH as patchCategoryRoute,
  DELETE as deleteCategoryRoute,
} from "@/app/api/categories/[id]/route";
import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { adminToken, staffToken, req, json } from "./helpers";

function ctx(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

async function makeCategory(token: string, name: string, description?: string) {
  const res = await createCategoryRoute(
    req("POST", "/api/categories", { token, body: { name, description } }),
  );
  if (res.status !== 201) throw new Error(`create failed: ${res.status}`);
  return (await json(res)).category as { id: number; name: string };
}

describe("categories API", () => {
  it("enforces RBAC on every verb", async () => {
    const admin = await adminToken();
    const staff = await staffToken();
    const category = await makeCategory(admin, "RBAC Cat");

    const anonymous = await listCategoriesRoute(req("GET", "/api/categories"));
    expect(anonymous.status).toBe(401);

    const staffRead = await listCategoriesRoute(req("GET", "/api/categories", { token: staff }));
    expect(staffRead.status).toBe(200);

    const staffCreate = await createCategoryRoute(
      req("POST", "/api/categories", { token: staff, body: { name: "Nope" } }),
    );
    expect(staffCreate.status).toBe(403);

    const staffPatch = await patchCategoryRoute(
      req("PATCH", `/api/categories/${category.id}`, { token: staff, body: { name: "Nope" } }),
      ctx(category.id),
    );
    expect(staffPatch.status).toBe(403);

    const staffDelete = await deleteCategoryRoute(
      req("DELETE", `/api/categories/${category.id}`, { token: staff }),
      ctx(category.id),
    );
    expect(staffDelete.status).toBe(403);
  });

  it("creates categories and rejects case-insensitive duplicates", async () => {
    const token = await adminToken();
    await makeCategory(token, "Beverages");

    const duplicate = await createCategoryRoute(
      req("POST", "/api/categories", { token, body: { name: "beverages" } }),
    );
    expect(duplicate.status).toBe(409);
    expect((await json(duplicate)).error).toMatchObject({ code: "CATEGORY_NAME_EXISTS" });
  });

  it("searches case-insensitively with pagination", async () => {
    const token = await adminToken();
    await makeCategory(token, "Beverages", "Drinks");
    await makeCategory(token, "Snacks");
    await makeCategory(token, "Stationery");

    const search = await listCategoriesRoute(
      req("GET", "/api/categories?search=BEV", { token }),
    );
    expect(search.status).toBe(200);
    const searchBody = await json(search);
    expect((searchBody.pagination as Record<string, unknown>).total).toBe(1);

    const page = await listCategoriesRoute(
      req("GET", "/api/categories?page=2&per_page=2", { token }),
    );
    const pageBody = await json(page);
    expect((pageBody.data as unknown[]).length).toBe(1);
    expect(pageBody.pagination).toMatchObject({ page: 2, per_page: 2, total: 3, total_pages: 2 });
  });

  it("gets by id, 404s unknown ids, 400s malformed ids", async () => {
    const token = await adminToken();
    const category = await makeCategory(token, "Lookup Cat");

    const found = await getCategoryRoute(
      req("GET", `/api/categories/${category.id}`, { token }),
      ctx(category.id),
    );
    expect(found.status).toBe(200);

    const missing = await getCategoryRoute(
      req("GET", "/api/categories/999999", { token }),
      ctx(999999),
    );
    expect(missing.status).toBe(404);
    expect((await json(missing)).error).toMatchObject({ code: "CATEGORY_NOT_FOUND" });

    const bad = await getCategoryRoute(
      req("GET", "/api/categories/abc", { token }),
      ctx("abc"),
    );
    expect(bad.status).toBe(400);
  });

  it("updates fields and blocks cross-case name collisions", async () => {
    const token = await adminToken();
    const first = await makeCategory(token, "Drinks", "Original");
    const second = await makeCategory(token, "Snacks");

    const renamed = await patchCategoryRoute(
      req("PATCH", `/api/categories/${first.id}`, {
        token,
        body: { name: "Beverages", description: "Updated" },
      }),
      ctx(first.id),
    );
    expect(renamed.status).toBe(200);
    expect(((await json(renamed)).category as Record<string, unknown>).name).toBe("Beverages");

    const collision = await patchCategoryRoute(
      req("PATCH", `/api/categories/${second.id}`, { token, body: { name: "beverages" } }),
      ctx(second.id),
    );
    expect(collision.status).toBe(409);

    const cleared = await patchCategoryRoute(
      req("PATCH", `/api/categories/${first.id}`, { token, body: { description: null } }),
      ctx(first.id),
    );
    expect(cleared.status).toBe(200);
    expect(((await json(cleared)).category as Record<string, unknown>).description).toBeNull();
  });

  it("deletes empty categories but blocks referenced ones, even archived products", async () => {
    const token = await adminToken();
    const empty = await makeCategory(token, "Empty Cat");
    const used = await makeCategory(token, "Used Cat");

    await getDb().insert(products).values({
      sku: "CAT-REF-1",
      name: "Archived referencing product",
      categoryId: used.id,
      archivedAt: new Date(),
    });

    const blocked = await deleteCategoryRoute(
      req("DELETE", `/api/categories/${used.id}`, { token }),
      ctx(used.id),
    );
    expect(blocked.status).toBe(409);
    expect((await json(blocked)).error).toMatchObject({ code: "CATEGORY_IN_USE" });

    const deleted = await deleteCategoryRoute(
      req("DELETE", `/api/categories/${empty.id}`, { token }),
      ctx(empty.id),
    );
    expect(deleted.status).toBe(204);

    const gone = await getCategoryRoute(
      req("GET", `/api/categories/${empty.id}`, { token }),
      ctx(empty.id),
    );
    expect(gone.status).toBe(404);
  });
});