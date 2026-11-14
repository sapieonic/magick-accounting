import { describe, expect, it } from "vitest";
import { MONTH_KEY, monthFromKey, monthKey, monthProgress } from "@/lib/month";

describe("month keys", () => {
  it("builds the local month's key, zero-padded", () => {
    expect(monthKey(new Date(2026, 0, 31, 23, 59))).toBe("2026-01");
    expect(monthKey(new Date(2026, 11, 1))).toBe("2026-12");
  });

  it("round-trips with monthFromKey", () => {
    const first = monthFromKey("2026-03");
    expect(first).toEqual(new Date(2026, 2, 1));
    expect(monthKey(first)).toBe("2026-03");
  });

  it("accepts only real YYYY-MM months", () => {
    expect(MONTH_KEY.test("2026-09")).toBe(true);
    for (const bad of ["2026-9", "2026-13", "2026-00", "custom", "2026-09-01", ""]) {
      expect(MONTH_KEY.test(bad)).toBe(false);
    }
  });
});

describe("monthProgress", () => {
  it("counts the current month to today's UTC day, other months whole", () => {
    const now = new Date(Date.UTC(2026, 1, 10, 12));
    expect(monthProgress("2026-02", now)).toEqual({ day: 10, days: 28 });
    expect(monthProgress("2026-01", now)).toEqual({ day: 31, days: 31 });
  });
});
