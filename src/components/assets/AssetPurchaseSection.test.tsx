import { useState } from "react";
import { render, screen } from "@testing-library/react";
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

describe("AssetPurchaseSection", () => {
  it("adds, duplicates, and removes individually trackable assets", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /add company asset/i }));
    const name = screen.getByRole("textbox", { name: "Asset 1 name" });
    const serial = screen.getByRole("textbox", { name: "Asset 1 serial number" });
    await user.type(name, "MacBook Pro");
    await user.type(serial, "SERIAL-001");

    await user.click(screen.getByRole("button", { name: /duplicate asset 1/i }));
    expect(screen.getAllByRole("textbox", { name: /Asset \d name/ })).toHaveLength(2);
    expect(screen.getByRole("textbox", { name: "Asset 2 name" })).toHaveValue("MacBook Pro");
    expect(screen.getByRole("textbox", { name: "Asset 2 serial number" })).toHaveValue("");

    await user.click(screen.getByRole("button", { name: /remove asset 1/i }));
    expect(screen.getAllByRole("textbox", { name: /Asset \d name/ })).toHaveLength(1);
  });

  it("associates accessible names with asset controls", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /add company asset/i }));

    expect(screen.getByRole("combobox", { name: "Asset 1 category" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Asset 1 allocated amount" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Asset 1 depreciation method" })).toBeInTheDocument();
  });
});
