import { z } from "zod";

const descriptionSchema = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((value) => (value === "" ? null : value));

const skuSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase());

export const createProductSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(1).max(200),
  description: descriptionSchema,
  category_id: z.coerce.number().int().positive(),
  low_stock_threshold: z.coerce.number().int().min(0).max(1_000_000).default(5),
});

export const updateProductSchema = z
  .object({
    sku: skuSchema.optional(),
    name: z.string().trim().min(1).max(200).optional(),
    description: descriptionSchema,
    category_id: z.coerce.number().int().positive().optional(),
    low_stock_threshold: z.coerce.number().int().min(0).max(1_000_000).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const listProductsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  stock_status: z.enum(["ok", "low", "out"]).optional(),
  include_archived: z.enum(["true", "false"]).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;