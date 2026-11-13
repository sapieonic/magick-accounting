import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AssetPurchaseSection, { AssetDraft } from "./AssetPurchaseSection";

function Harness() {
  const [assets, setAssets] = useState<AssetDraft[]>([]);
  return (
    <AssetPurchaseSection
      assets={assets}
      onChange={setAssets}
      purchaseDate="2026-08-16"
      currencySymbol="₹"
      users={[]}
      canAssignOthers={false}
      currentUser={{ _id: "user-1", name: "Test User", email: "test@example.com" }}
    />
  );
}

/** The card for asset `n` (a group named "Asset n"). */
function assetCard(n: number) {
  return within(screen.getByRole("group", { name: `Asset ${n}` }));
}

describe("AssetPurchaseSection", () => {
  it("adds, duplicates, and removes individually trackable assets", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /add company asset/i }));
    const name = assetCard(1).getByRole("textbox", { name: "Asset name" });
    const serial = assetCard(1).getByRole("textbox", { name: /^serial number/i });
    await user.type(name, "MacBook Pro");
    await user.type(serial, "SERIAL-001");

    await user.click(screen.getByRole("button", { name: /duplicate asset 1/i }));
    expect(screen.getAllByRole("textbox", { name: "Asset name" })).toHaveLength(2);
    expect(assetCard(2).getByRole("textbox", { name: "Asset name" })).toHaveValue("MacBook Pro");
    expect(assetCard(2).getByRole("textbox", { name: /^serial number/i })).toHaveValue("");

    await user.click(screen.getByRole("button", { name: /remove asset 1/i }));
    expect(screen.getAllByRole("textbox", { name: "Asset name" })).toHaveLength(1);
    expect(screen.queryByRole("group", { name: "Asset 2" })).not.toBeInTheDocument();
  });

  it("names each control by its visible label, inside a group per asset", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /add company asset/i }));

    const card = assetCard(1);
    expect(card.getByRole("combobox", { name: "Asset category" })).toBeInTheDocument();
    expect(card.getByRole("spinbutton", { name: "Allocated amount (₹)" })).toBeInTheDocument();
    expect(
      within(card.getByRole("group", { name: "Depreciation" })).getByRole("combobox", { name: "Method" })
    ).toBeInTheDocument();
  });
});
