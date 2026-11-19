import { describe, expect, it } from "vitest";
import { crossedLowStock } from "@/lib/services/alerts";

describe("crossedLowStock", () => {
  it("fires when dropping from above the threshold to below it", () => {
    expect(crossedLowStock(10, 3, 5)).toBe(true);
  });

  it("fires when landing exactly on the threshold", () => {
    expect(crossedLowStock(10, 5, 5)).toBe(true);
  });

  it("fires when going to zero", () => {
    expect(crossedLowStock(10, 0, 5)).toBe(true);
  });

  it("does not fire when already at or below the threshold", () => {
    expect(crossedLowStock(4, 2, 5)).toBe(false);
    expect(crossedLowStock(5, 1, 5)).toBe(false);
    expect(crossedLowStock(0, 0, 5)).toBe(false);
  });

  it("does not fire while staying above the threshold", () => {
    expect(crossedLowStock(20, 10, 5)).toBe(false);
  });

  it("does not fire on restock", () => {
    expect(crossedLowStock(2, 8, 5)).toBe(false);
  });
});