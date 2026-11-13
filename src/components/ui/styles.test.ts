import { describe, it, expect } from "vitest";
import {
  aiFilledClass,
  compactSelectClass,
  inlineLinkClass,
  inputClass,
  linkClass,
  selectClass,
  textButtonClass,
  textareaClass,
} from "@/components/ui/styles";

const classes = (s: string) => s.split(/\s+/).filter(Boolean);
const ring = "focus-visible:shadow-[0_0_0_2px_rgb(var(--accent))]";

describe("form control classes", () => {
  it.each([
    ["inputClass", inputClass],
    ["selectClass", selectClass],
    ["compactSelectClass", compactSelectClass],
    ["textareaClass", textareaClass],
  ])("%s shows focus as an opaque 2px ring, independent of the border colour", (_, cls) => {
    const list = classes(cls);
    expect(list).toContain(ring);
    expect(list).toContain("focus-visible:outline-none");
    // A border-only cue disappears where the border is already accent or danger.
    expect(list.filter((c) => c.startsWith("focus-visible:border"))).toEqual([]);
    expect(list).toContain("border-control-line");
    expect(list).toContain("aria-[invalid=true]:border-danger");
  });

  it("keeps the 3:1 control-line boundary on auto-filled fields (tint only)", () => {
    expect(classes(aiFilledClass)).toEqual(["!bg-tint"]);
  });

  it("gives the compact select no w-full, so a width beside it applies (cn has no tailwind-merge)", () => {
    expect(classes(compactSelectClass)).not.toContain("w-full");
    expect(classes(compactSelectClass)).toEqual(expect.arrayContaining(["h-11", "pl-2", "pr-6"]));
    expect(classes(selectClass)).toContain("w-full");
    expect(classes(inputClass)).toContain("w-full");
    expect(classes(textareaClass)).toContain("w-full");
  });
});

describe("link classes", () => {
  it("dims a disabled link button and drops its hover colour", () => {
    expect(classes(linkClass)).toEqual(
      expect.arrayContaining(["disabled:cursor-not-allowed", "disabled:opacity-50", "disabled:hover:text-accent"])
    );
  });

  it("textButtonClass is a 40px link-styled button", () => {
    expect(classes(textButtonClass)).toEqual(
      expect.arrayContaining([...classes(linkClass), "inline-flex", "min-h-10", "items-center", "gap-1.5", "rounded-control", "text-[13px]"])
    );
  });

  it("inlineLinkClass gives small links a 24px target", () => {
    expect(classes(inlineLinkClass)).toEqual(expect.arrayContaining([...classes(linkClass), "inline-flex", "min-h-6", "items-center"]));
  });
});
