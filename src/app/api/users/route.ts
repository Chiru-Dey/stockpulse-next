import { getDb } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/guards";
import { createUser, listUsers, toPublicUser } from "@/lib/services/users";
import { createUserSchema, listUsersQuerySchema } from "@/lib/validation/users";
import { parsePagination, paginated } from "@/lib/api/pagination";
import { ok, fail } from "@/lib/api/respond";
import { readJsonBody } from "@/lib/api/request";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const pagination = parsePagination(url);
    const query = listUsersQuerySchema.parse({
      search: url.searchParams.get("search") || undefined,
      role: url.searchParams.get("role") || undefined,
      is_active: url.searchParams.get("is_active") || undefined,
    });

    const { rows, total } = await listUsers(
      getDb(),
      {
        search: query.search,
        role: query.role,
        isActive:
          query.is_active === undefined ? undefined : query.is_active === "true",
      },
      pagination,
    );

    return ok(paginated(rows.map(toPublicUser), total, pagination));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const input = createUserSchema.parse(await readJsonBody(req));
    const user = await createUser(getDb(), input);
    return ok({ user: toPublicUser(user) }, 201);
  } catch (error) {
    return fail(error);
  }
}