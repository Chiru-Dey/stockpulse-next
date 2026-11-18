import { z } from "zod";
import { emailSchema } from "./auth";

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: z.string().min(8).max(72),
  role: z.enum(["admin", "staff"]).default("staff"),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    password: z.string().min(8).max(72).optional(),
    role: z.enum(["admin", "staff"]).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  role: z.enum(["admin", "staff"]).optional(),
  is_active: z.enum(["true", "false"]).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;