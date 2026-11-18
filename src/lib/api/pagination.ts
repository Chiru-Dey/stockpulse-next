import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = {
  page: number;
  perPage: number;
  offset: number;
  limit: number;
};

export function parsePagination(url: URL): PaginationParams {
  const parsed = paginationQuerySchema.parse({
    page: url.searchParams.get("page") || undefined,
    per_page: url.searchParams.get("per_page") || undefined,
  });
  return {
    page: parsed.page,
    perPage: parsed.per_page,
    offset: (parsed.page - 1) * parsed.per_page,
    limit: parsed.per_page,
  };
}

export type PaginationMeta = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

export function paginationMeta(
  page: number,
  perPage: number,
  total: number,
): PaginationMeta {
  return {
    page,
    per_page: perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  };
}