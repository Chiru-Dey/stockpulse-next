import { describe, expect, it } from "vitest";
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} from "@/lib/validation/products";
import { toPublicProduct, type ProductWithMeta } from "@/lib/services/products";

describe("createProductSchema", () => {
  it("uppercases SKU and defaults threshold to 5", () => {
    const parsed = createProductSchema.parse({
      sku: " abc-123 ",
      name: " Widget ",
      category_id: "3",
    });
    expect(parsed).toEqual({
      sku: "ABC-123",
      name: "Widget",
      description: undefined,
      category_id: 3,
      low_stock_threshold: 5,
    });
  });

  it("normalizes empty description to null and accepts null", () => {
    expect(
      createProductSchema.parse({ sku: "A", name: "B", category_id: 1, description: "  " }).description,
    ).toBeNull();
    expect(
      createProductSchema.parse({ sku: "A", name: "B", category_id: 1, description: null }).description,
    ).toBeNull();
  });

  it("rejects empty sku/name and negative thresholds", () => {
    expect(() => createProductSchema.parse({ sku: " ", name: "B", category_id: 1 })).toThrow();
    expect(() => createProductSchema.parse({ sku: "A", name: " ", category_id: 1 })).toThrow();
    expect(() =>
      createProductSchema.parse({ sku: "A", name: "B", category_id: 1, low_stock_threshold: -1 }),
    ).toThrow();
  });

  it("rejects a non-positive category_id", () => {
    expect(() => createProductSchema.parse({ sku: "A", name: "B", category_id: 0 })).toThrow();
    expect(() => createProductSchema.parse({ sku: "A", name: "B", category_id: "abc" })).toThrow();
  });
});

describe("updateProductSchema", () => {
  it("rejects empty bodies and stock_qty-only bodies (ledger-only field)", () => {
    expect(() => updateProductSchema.parse({})).toThrow();
    expect(() => updateProductSchema.parse({ stock_qty: 9 })).toThrow();
  });

  it("accepts archived flag and zero threshold", () => {
    expect(updateProductSchema.parse({ archived: true })).toEqual({ archived: true });
    expect(updateProductSchema.parse({ low_stock_threshold: 0 })).toEqual({
      low_stock_threshold: 0,
    });
  });
});

describe("listProductsQuerySchema", () => {
  it("coerces category_id and validates enums", () => {
    const parsed = listProductsQuerySchema.parse({
      category_id: "2",
      stock_status: "low",
      include_archived: "true",
    });
    expect(parsed).toEqual({ category_id: 2, stock_status: "low", include_archived: "true" });
    expect(() => listProductsQuerySchema.parse({ stock_status: "empty" })).toThrow();
    expect(() => listProductsQuerySchema.parse({ include_archived: "yes" })).toThrow();
  });
});

describe("toPublicProduct", () => {
  it("emits snake_case fields, derived status, ISO or null archived_at", () => {
    const now = new Date("2026-11-18T00:00:00.000Z");
    const row: ProductWithMeta = {
      product: {
        id: 9,
        sku: "SKU-X",
        name: "Widget",
        description: null,
        categoryId: 2,
        lowStockThreshold: 5,
        stockQty: 3,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      category_name: "Snacks",
      stock_status: "low",
    };
    expect(toPublicProduct(row)).toEqual({
      id: 9,
      sku: "SKU-X",
      name: "Widget",
      description: null,
      category_id: 2,
      category_name: "Snacks",
      low_stock_threshold: 5,
      stock_qty: 3,
      stock_status: "low",
      archived_at: null,
      created_at: "2026-11-18T00:00:00.000Z",
      updated_at: "2026-11-18T00:00:00.000Z",
    });
    expect(
      toPublicProduct({ ...row, product: { ...row.product, archivedAt: now } }).archived_at,
    ).toBe("2026-11-18T00:00:00.000Z");
  });
});