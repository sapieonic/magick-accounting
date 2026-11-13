import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Bot, Coins, FileText, Shield } from "lucide-react";
import SettingsNav, { pickActiveSection, type SettingsSection } from "./SettingsNav";

const SECTIONS: SettingsSection[] = [
  { id: "access", label: "Sign-in access", icon: Shield },
  { id: "currencies", label: "Currencies", icon: Coins },
  { id: "telegram", label: "Telegram bot", icon: Bot },
  { id: "invoices", label: "Invoice defaults", icon: FileText },
];
const IDS = SECTIONS.map((s) => s.id);

/** Lays the sections out at the given viewport tops, each `height` px tall. */
function layout(tops: Record<string, number>, height = 300) {
  for (const [id, top] of Object.entries(tops)) {
    const el = document.getElementById(id)!;
    el.getBoundingClientRect = () => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  }
}

function Page() {
  return (
    <main style={{ overflowY: "auto" }} data-testid="scroller">
      <SettingsNav sections={SECTIONS} />
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id}>
          {s.label}
        </section>
      ))}
    </main>
  );
}

const current = () => screen.getByRole("link", { current: "location" });

describe("pickActiveSection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mount() {
    document.body.innerHTML = IDS.map((id) => `<section id="${id}"></section>`).join("");
  }

  it("picks the last section whose top passed the reading line, even if the one above still shows", () => {
    mount();
    // Currencies' bottom is still on screen, but Telegram is the one being read.
    layout({ access: -900, currencies: -250, telegram: 88, invoices: 420 });
    expect(pickActiveSection(IDS, { line: 200, viewportHeight: 800, atBottom: false, clicked: null })).toBe("telegram");
  });

  it("falls back to the first section before any reaches the line", () => {
    mount();
    layout({ access: 260, currencies: 600, telegram: 900, invoices: 1200 });
    expect(pickActiveSection(IDS, { line: 200, viewportHeight: 800, atBottom: false, clicked: null })).toBe("access");
  });

  it("highlights the last section at the bottom of the page", () => {
    mount();
    layout({ access: -900, currencies: -500, telegram: 120, invoices: 500 });
    expect(pickActiveSection(IDS, { line: 100, viewportHeight: 800, atBottom: true, clicked: null })).toBe("invoices");
  });

  it("keeps a clicked section that can't reach the line while it is on screen", () => {
    mount();
    layout({ access: -900, currencies: -500, telegram: 120, invoices: 500 });
    expect(pickActiveSection(IDS, { line: 100, viewportHeight: 800, atBottom: true, clicked: "telegram" })).toBe(
      "telegram"
    );
  });
});

describe("SettingsNav", () => {
  it("starts on the first section and follows scrolling", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0; // already ran: nothing pending

    });
    render(<Page />);
    expect(current()).toHaveAttribute("href", "#access");

    layout({ access: -900, currencies: -250, telegram: 88, invoices: 420 });
    act(() => {
      fireEvent.scroll(screen.getByTestId("scroller"));
    });
    expect(current()).toHaveAttribute("href", "#telegram");
    vi.restoreAllMocks();
  });

  it("highlights a clicked section until the person scrolls by hand", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0; // already ran: nothing pending

    });
    render(<Page />);
    layout({ access: -900, currencies: -500, telegram: 120, invoices: 380 });

    fireEvent.click(screen.getByRole("link", { name: "Telegram bot" }));
    act(() => {
      fireEvent.scroll(screen.getByTestId("scroller"));
    });
    expect(current()).toHaveAttribute("href", "#telegram");

    fireEvent.wheel(window);
    layout({ access: -900, currencies: -500, telegram: -200, invoices: 60 });
    act(() => {
      fireEvent.scroll(screen.getByTestId("scroller"));
    });
    expect(current()).toHaveAttribute("href", "#invoices");
    vi.restoreAllMocks();
  });
});
