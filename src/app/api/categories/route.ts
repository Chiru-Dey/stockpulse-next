import { getDb } from "@/lib/db/client";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import {
  createCategory,
  listCategories,
  toPublicCategory,
} from "@/lib/services/categories";
import {
  createCategorySchema,
  listCategoriesQuerySchema,
} from "@/lib/validation/categories";
import { parsePagination, paginationMeta } from "@/lib/api/pagination";
import { ok, fail } from "@/lib/api/respond";
import { readJsonBody } from "@/lib/api/request";

export async function GET(req: Request) {
  try {
    await requireAuth(req);
    const url = new URL(req.url);
    const pagination = parsePagination(url);
    const query = listCategoriesQuerySchema.parse({
      search: url.searchParams.get("search") || undefined,
    });

    const { rows, total } = await listCategories(
      getDb(),
      { search: query.search },
      pagination,
    );

    return ok({
      data: rows.map(toPublicCategory),
      pagination: paginationMeta(pagination.page, pagination.perPage, total),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const input = createCategorySchema.parse(await readJsonBody(req));
    const category = await createCategory(getDb(), input);
    return ok({ category: toPublicCategory(category) }, 201);
  } catch (error) {
    return fail(error);
  }
}