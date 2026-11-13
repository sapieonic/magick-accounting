import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// The dashboard layout needs auth and routing to render; these guard the two
// scroller rules by source so they can't silently disappear.
const source = readFileSync("src/app/dashboard/layout.tsx", "utf8");
const footer = readFileSync("src/components/ui/FormSection.tsx", "utf8");

describe("dashboard scroller", () => {
  it("keeps a focused field clear of the tab bar and a sticky FormFooter", () => {
    expect(source).toContain("scroll-pb-[calc(var(--tabbar-h)+var(--form-footer-h,0px)+16px)]");
    expect(source).toContain("scroll-pt-6");
  });

  it("leaves toast room at the page end on phones unless a FormFooter is mounted", () => {
    expect(source).toContain("max-lg:[&:not(:has([data-form-footer]))]:pb-[calc(var(--tabbar-h)+88px)]");
    expect(footer).toContain('data-form-footer=""');
  });
});
