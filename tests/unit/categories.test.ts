import { describe, expect, it } from "vitest";
import {
  createCategorySchema,
  updateCategorySchema,
} from "@/lib/validation/categories";
import { toPublicCategory } from "@/lib/services/categories";
import type { Category } from "@/lib/db/schema";

describe("createCategorySchema", () => {
  it("trims names and normalizes empty description to null", () => {
    expect(
      createCategorySchema.parse({ name: "  Snacks  ", description: "   " }),
    ).toEqual({ name: "Snacks", description: null });
  });

  it("accepts null and omitted description", () => {
    expect(createCategorySchema.parse({ name: "A", description: null }).description).toBeNull();
    expect(createCategorySchema.parse({ name: "A" }).description).toBeUndefined();
  });

  it("rejects empty or oversized names", () => {
    expect(() => createCategorySchema.parse({ name: "   " })).toThrow();
    expect(() => createCategorySchema.parse({ name: "x".repeat(121) })).toThrow();
  });

  it("rejects oversized descriptions", () => {
    expect(() =>
      createCategorySchema.parse({ name: "A", description: "x".repeat(2001) }),
    ).toThrow();
  });
});

describe("updateCategorySchema", () => {
  it("requires at least one field", () => {
    expect(() => updateCategorySchema.parse({})).toThrow();
    expect(updateCategorySchema.parse({ name: "New" })).toEqual({ name: "New" });
  });

  it("allows clearing description with null", () => {
    expect(updateCategorySchema.parse({ description: null })).toEqual({
      description: null,
    });
  });
});

describe("toPublicCategory", () => {
  it("emits snake_case ISO dates and keeps null description", () => {
    const now = new Date("2026-11-18T00:00:00.000Z");
    const category: Category = {
      id: 3,
      name: "Snacks",
      description: null,
      createdAt: now,
      updatedAt: now,
    };
    expect(toPublicCategory(category)).toEqual({
      id: 3,
      name: "Snacks",
      description: null,
      created_at: "2026-11-18T00:00:00.000Z",
      updated_at: "2026-11-18T00:00:00.000Z",
    });
  });
});