import { getDb } from "@/lib/db/client";
import { requireAdmin, requireAuth } from "@/lib/auth/guards";
import {
  createProduct,
  listProducts,
  toPublicProduct,
} from "@/lib/services/products";
import {
  createProductSchema,
  listProductsQuerySchema,
} from "@/lib/validation/products";
import { parsePagination, paginated } from "@/lib/api/pagination";
import { ok, fail } from "@/lib/api/respond";
import { readJsonBody } from "@/lib/api/request";

export async function GET(req: Request) {
  try {
    await requireAuth(req);
    const url = new URL(req.url);
    const pagination = parsePagination(url);
    const query = listProductsQuerySchema.parse({
      search: url.searchParams.get("search") || undefined,
      category_id: url.searchParams.get("category_id") || undefined,
      stock_status: url.searchParams.get("stock_status") || undefined,
      include_archived: url.searchParams.get("include_archived") || undefined,
    });

    const { rows, total } = await listProducts(
      getDb(),
      {
        search: query.search,
        categoryId: query.category_id,
        stockStatus: query.stock_status,
        includeArchived: query.include_archived === "true",
      },
      pagination,
    );

    return ok(paginated(rows.map(toPublicProduct), total, pagination));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const input = createProductSchema.parse(await readJsonBody(req));
    const row = await createProduct(getDb(), {
      sku: input.sku,
      name: input.name,
      description: input.description,
      categoryId: input.category_id,
      lowStockThreshold: input.low_stock_threshold,
    });
    return ok({ product: toPublicProduct(row) }, 201);
  } catch (error) {
    return fail(error);
  }
}