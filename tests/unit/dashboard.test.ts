import { describe, expect, it } from "vitest";
import {
  utcDateKey,
  lastNDayKeys,
  fillTrendSeries,
  TREND_DAYS,
} from "@/lib/services/dashboard";

describe("utcDateKey", () => {
  it("uses the UTC calendar day, not local time", () => {
    expect(utcDateKey(new Date("2026-11-18T23:59:59.999Z"))).toBe("2026-11-18");
    expect(utcDateKey(new Date("2026-11-19T00:00:00.000Z"))).toBe("2026-11-19");
  });
});

describe("lastNDayKeys", () => {
  it("returns N ascending keys ending today (UTC)", () => {
    const keys = lastNDayKeys(TREND_DAYS, new Date("2026-11-19T15:00:00.000Z"));
    expect(keys).toEqual([
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
    ]);
  });

  it("crosses month boundaries correctly", () => {
    const keys = lastNDayKeys(3, new Date("2026-03-01T05:00:00.000Z"));
    expect(keys).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });
});

describe("fillTrendSeries", () => {
  it("zero-fills missing days and coerces string sums", () => {
    const keys = ["2026-11-17", "2026-11-18", "2026-11-19"];
    const series = fillTrendSeries(keys, [
      { day: "2026-11-18", in_qty: "12" as unknown as number, out_qty: "5" as unknown as number },
      { day: "2026-10-01", in_qty: 999, out_qty: 999 }, // outside window: ignored
    ]);
    expect(series).toEqual([
      { date: "2026-11-17", in_qty: 0, out_qty: 0 },
      { date: "2026-11-18", in_qty: 12, out_qty: 5 },
      { date: "2026-11-19", in_qty: 0, out_qty: 0 },
    ]);
  });
});