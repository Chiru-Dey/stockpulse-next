import { z } from "zod";

const descriptionSchema = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((value) => (value === "" ? null : value));

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: descriptionSchema,
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: descriptionSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const listCategoriesQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;