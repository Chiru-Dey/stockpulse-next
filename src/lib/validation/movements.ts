import { z } from "zod";

// Date.parse rolls impossible dates over (2026-02-30 -> March 2), so we
// round-trip the UTC components instead of trusting NaN checks.
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return false;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "Invalid calendar date");

export const createMovementSchema = z.object({
  product_id: z.coerce.number().int().positive(),
  movement_type: z.enum(["IN", "OUT"]),
  quantity: z.coerce.number().int().positive().max(1_000_000),
  note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((value) => (value === "" ? null : value)),
});

export const listMovementsQuerySchema = z
  .object({
    product_id: z.coerce.number().int().positive().optional(),
    movement_type: z.enum(["IN", "OUT"]).optional(),
    date_from: isoDateSchema.optional(),
    date_to: isoDateSchema.optional(),
  })
  .refine(
    (value) =>
      !value.date_from || !value.date_to || value.date_from <= value.date_to,
    { message: "date_from must be on or before date_to" },
  );

export type CreateMovementInput = z.infer<typeof createMovementSchema>;