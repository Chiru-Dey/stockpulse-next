import { describe, expect, it } from "vitest";
import {
  createMovementSchema,
  listMovementsQuerySchema,
} from "@/lib/validation/movements";
import { toPublicMovement, type MovementWithMeta } from "@/lib/services/movements";

describe("createMovementSchema", () => {
  it("parses and coerces a valid payload", () => {
    expect(
      createMovementSchema.parse({
        product_id: "4",
        movement_type: "IN",
        quantity: "5",
        note: "  restock  ",
      }),
    ).toEqual({ product_id: 4, movement_type: "IN", quantity: 5, note: "restock" });
  });

  it("rejects zero, negative and fractional quantities", () => {
    const base = { product_id: 1, movement_type: "OUT" };
    expect(() => createMovementSchema.parse({ ...base, quantity: 0 })).toThrow();
    expect(() => createMovementSchema.parse({ ...base, quantity: -3 })).toThrow();
    expect(() => createMovementSchema.parse({ ...base, quantity: 1.5 })).toThrow();
  });

  it("rejects unknown movement types", () => {
    expect(() =>
      createMovementSchema.parse({ product_id: 1, movement_type: "MOVE", quantity: 1 }),
    ).toThrow();
  });

  it("normalizes empty note to null and caps length", () => {
    expect(
      createMovementSchema.parse({ product_id: 1, movement_type: "IN", quantity: 1, note: "  " }).note,
    ).toBeNull();
    expect(() =>
      createMovementSchema.parse({ product_id: 1, movement_type: "IN", quantity: 1, note: "x".repeat(501) }),
    ).toThrow();
  });
});

describe("listMovementsQuerySchema", () => {
  it("accepts a valid ordered range", () => {
    expect(
      listMovementsQuerySchema.parse({
        product_id: "2",
        movement_type: "OUT",
        date_from: "2026-11-01",
        date_to: "2026-11-18",
      }),
    ).toEqual({
      product_id: 2,
      movement_type: "OUT",
      date_from: "2026-11-01",
      date_to: "2026-11-18",
    });
  });

  it("rejects a reversed range", () => {
    expect(() =>
      listMovementsQuerySchema.parse({ date_from: "2026-11-18", date_to: "2026-11-01" }),
    ).toThrow();
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => listMovementsQuerySchema.parse({ date_from: "18-11-2026" })).toThrow();
    expect(() => listMovementsQuerySchema.parse({ date_to: "2026-02-30" })).toThrow();
    expect(() => listMovementsQuerySchema.parse({ date_to: "2026-13-01" })).toThrow();
    expect(() => listMovementsQuerySchema.parse({ date_to: "2026-00-10" })).toThrow();
  });

  it("accepts a real leap day and rejects a non-leap Feb 29", () => {
    expect(listMovementsQuerySchema.parse({ date_from: "2024-02-29" }).date_from).toBe("2024-02-29");
    expect(() => listMovementsQuerySchema.parse({ date_from: "2026-02-29" })).toThrow();
  });
});

describe("toPublicMovement", () => {
  it("emits snake_case joined fields and ISO timestamp", () => {
    const now = new Date("2026-11-18T09:00:00.000Z");
    const row: MovementWithMeta = {
      movement: {
        id: 11,
        productId: 4,
        movementType: "OUT",
        quantity: 3,
        note: null,
        createdBy: 2,
        createdAt: now,
      },
      product_sku: "SKU-BEV-001",
      product_name: "Mineral Water 1L",
      created_by_name: "Ravi Kumar",
      created_by_email: "staff@stockpulse.dev",
    };
    expect(toPublicMovement(row)).toEqual({
      id: 11,
      product_id: 4,
      product_sku: "SKU-BEV-001",
      product_name: "Mineral Water 1L",
      movement_type: "OUT",
      quantity: 3,
      note: null,
      created_by: 2,
      created_by_name: "Ravi Kumar",
      created_by_email: "staff@stockpulse.dev",
      created_at: "2026-11-18T09:00:00.000Z",
    });
  });
});