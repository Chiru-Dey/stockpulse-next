import { describe, expect, it } from "vitest";
import { GET as listUsersRoute, POST as createUserRoute } from "@/app/api/users/route";
import {
  GET as getUserRoute,
  PATCH as patchUserRoute,
  DELETE as deleteUserRoute,
} from "@/app/api/users/[id]/route";
import { POST as refreshRoute } from "@/app/api/auth/refresh/route";
import { getDb } from "@/lib/db/client";
import { categories, products, stockMovements } from "@/lib/db/schema";
import { updateUser } from "@/lib/services/users";
import { adminToken, staffToken, makeUser, loginSession, req, json } from "./helpers";

function ctx(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

async function giveMovement(userId: number): Promise<void> {
  const db = getDb();
  const [cat] = await db
    .insert(categories)
    .values({ name: "Movement Holder" })
    .$returningId();
  if (!cat) throw new Error("category insert failed");
  const [prod] = await db
    .insert(products)
    .values({ sku: "TEST-MOV-1", name: "Test product", categoryId: cat.id })
    .$returningId();
  if (!prod) throw new Error("product insert failed");
  await db.insert(stockMovements).values({
    productId: prod.id,
    movementType: "IN",
    quantity: 1,
    createdBy: userId,
  });
}

describe("users API", () => {
  it("rejects anonymous (401) and staff (403) callers", async () => {
    const anonymous = await listUsersRoute(req("GET", "/api/users"));
    expect(anonymous.status).toBe(401);

    const staff = await staffToken();
    const forbidden = await listUsersRoute(req("GET", "/api/users", { token: staff }));
    expect(forbidden.status).toBe(403);
    expect((await json(forbidden)).error).toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists with pagination and case-insensitive search", async () => {
    const token = await adminToken();
    await makeUser("staff");
    await createUserRoute(
      req("POST", "/api/users", {
        token,
        body: { name: "Zelda Query", email: "zelda@test.dev", password: "password-123" },
      }),
    );

    const search = await listUsersRoute(req("GET", "/api/users?search=ZELDA", { token }));
    expect(search.status).toBe(200);
    const searchBody = await json(search);
    expect(searchBody.total).toBe(1);
    expect((searchBody.items as Array<Record<string, unknown>>)[0]?.email).toBe("zelda@test.dev");

    const page = await listUsersRoute(req("GET", "/api/users?page=2&per_page=1", { token }));
    const pageBody = await json(page);
    expect((pageBody.items as unknown[]).length).toBe(1);
    expect(pageBody).toMatchObject({ page: 2, per_page: 1, total: 3, pages: 3 });
  });

  it("creates users, rejects duplicates and weak passwords", async () => {
    const token = await adminToken();
    const payload = { name: "New Admin", email: "newadmin@test.dev", password: "password-123", role: "admin" };

    const created = await createUserRoute(req("POST", "/api/users", { token, body: payload }));
    expect(created.status).toBe(201);
    expect(((await json(created)).user as Record<string, unknown>).role).toBe("admin");

    const duplicate = await createUserRoute(req("POST", "/api/users", { token, body: payload }));
    expect(duplicate.status).toBe(409);

    const weak = await createUserRoute(
      req("POST", "/api/users", { token, body: { ...payload, email: "x@test.dev", password: "short" } }),
    );
    expect(weak.status).toBe(400);
  });

  it("gets a user, 404s unknown ids, 400s malformed ids", async () => {
    const token = await adminToken();
    const { user } = await makeUser("staff");

    const found = await getUserRoute(req("GET", `/api/users/${user.id}`, { token }), ctx(user.id));
    expect(found.status).toBe(200);

    const missing = await getUserRoute(req("GET", "/api/users/999999", { token }), ctx(999999));
    expect(missing.status).toBe(404);

    const bad = await getUserRoute(req("GET", "/api/users/abc", { token }), ctx("abc"));
    expect(bad.status).toBe(400);
  });

  it("deactivation kills access and refresh sessions immediately", async () => {
    const token = await adminToken();
    const target = await makeUser("staff");
    const session = await loginSession(target.email, target.password);

    const deactivate = await patchUserRoute(
      req("PATCH", `/api/users/${target.user.id}`, { token, body: { is_active: false } }),
      ctx(target.user.id),
    );
    expect(deactivate.status).toBe(200);

    const meAccess = await listUsersRoute(req("GET", "/api/users", { token: session.accessToken }));
    expect(meAccess.status).toBe(401);

    const refresh = await refreshRoute(
      req("POST", "/api/auth/refresh", { body: { refresh_token: session.refreshToken } }),
    );
    expect(refresh.status).toBe(401);
  });

  it("blocks self role/active changes and self-delete, allows self rename", async () => {
    const admin = await makeUser("admin");
    const token = await loginSession(admin.email, admin.password).then((s) => s.accessToken);

    const demote = await patchUserRoute(
      req("PATCH", `/api/users/${admin.user.id}`, { token, body: { role: "staff" } }),
      ctx(admin.user.id),
    );
    expect(demote.status).toBe(409);
    expect((await json(demote)).error).toMatchObject({ code: "CANNOT_MODIFY_SELF" });

    const selfDelete = await deleteUserRoute(
      req("DELETE", `/api/users/${admin.user.id}`, { token }),
      ctx(admin.user.id),
    );
    expect(selfDelete.status).toBe(409);
    expect((await json(selfDelete)).error).toMatchObject({ code: "CANNOT_DELETE_SELF" });

    const rename = await patchUserRoute(
      req("PATCH", `/api/users/${admin.user.id}`, { token, body: { name: "Renamed Admin" } }),
      ctx(admin.user.id),
    );
    expect(rename.status).toBe(200);
  });

  it("refuses to delete a user with movements, deletes clean users", async () => {
    const token = await adminToken();
    const withMovements = await makeUser("staff");
    await giveMovement(withMovements.user.id);

    const blocked = await deleteUserRoute(
      req("DELETE", `/api/users/${withMovements.user.id}`, { token }),
      ctx(withMovements.user.id),
    );
    expect(blocked.status).toBe(409);
    expect((await json(blocked)).error).toMatchObject({ code: "USER_HAS_MOVEMENTS" });

    const clean = await makeUser("staff");
    const deleted = await deleteUserRoute(
      req("DELETE", `/api/users/${clean.user.id}`, { token }),
      ctx(clean.user.id),
    );
    expect(deleted.status).toBe(204);

    const gone = await getUserRoute(req("GET", `/api/users/${clean.user.id}`, { token }), ctx(clean.user.id));
    expect(gone.status).toBe(404);
  });

  it("service refuses to remove the last active admin", async () => {
    const { user } = await makeUser("admin");
    await expect(
      updateUser(getDb(), user.id, { isActive: false }),
    ).rejects.toMatchObject({ status: 409, code: "LAST_ADMIN" });
  });
});