import { describe, it, expect } from "vitest";
import { escapeCsvValue, buildCsv } from "@/lib/csv";

describe("escapeCsvValue", () => {
  it("returns plain values unchanged", () => {
    expect(escapeCsvValue("hello")).toBe("hello");
    expect(escapeCsvValue(42)).toBe("42");
  });

  it("returns an empty string for null and undefined", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
  });

  it("quotes values containing commas", () => {
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes values containing newlines", () => {
    expect(escapeCsvValue("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildCsv", () => {
  it("joins headers and rows with CRLF", () => {
    const csv = buildCsv(["a", "b"], [["1", "2"], ["3", "4,x"]]);
    expect(csv).toBe('a,b\r\n1,2\r\n3,"4,x"');
  });

  it("handles an empty row set", () => {
    expect(buildCsv(["a"], [])).toBe("a");
  });
});
