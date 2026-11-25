import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import ExpenseDetail from "./ExpenseDetail";
import { api } from "@/lib/api";
import type { ExpenseListItem } from "@/types/expense";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(() => Promise.resolve({ downloadUrl: "https://example.com/receipt.png" })) },
}));

const expense: ExpenseListItem = {
  _id: "exp-1",
  title: "Team dinner",
  amount: 865.19,
  amountInBaseCurrency: 865.19,
  currency: { _id: "inr", code: "INR", name: "Indian Rupee", symbol: "₹", isBase: true },
  date: "2026-11-21T00:00:00.000Z",
  description: "",
  paymentSource: "company",
  category: { _id: "cat", name: "Meals & Entertainment" },
  department: { _id: "dep", name: "Meetings" },
  createdBy: { _id: "u1", name: "Manas Nilorout", email: "manas@example.com" },
  receiptKey: "receipts/u1/bill.png",
  receiptFilename: "bill.png",
};

describe("ExpenseDetail receipt preview", () => {
  it("shows a large preview above the fields in the side panel", async () => {
    render(<ExpenseDetail expense={expense} editHref="/edit" showHeader />);

    const preview = await screen.findByRole("img", { name: "Receipt for Team dinner" });
    expect(preview).toHaveClass("h-auto", "w-full");
    expect(preview).not.toHaveClass("object-contain");
    const receipt = screen.getByRole("region", { name: "Receipt" });
    const fields = screen.getByText("Submitted by");
    expect(receipt.compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith("/api/upload?key=receipts%2Fu1%2Fbill.png");
  });

  it("keeps the compact preview under the fields when the detail is inline", async () => {
    render(<ExpenseDetail expense={{ ...expense, receiptFilename: "bill.pdf", receiptKey: "receipts/u1/bill.pdf" }} editHref="/edit" />);

    const preview = await screen.findByTitle("Receipt for Team dinner");
    expect(preview).toHaveClass("h-[min(500px,60dvh)]", "w-full");
    expect(preview).not.toHaveClass("h-[min(72dvh,840px)]");
    const fields = screen.getByText("Submitted by");
    expect(fields.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives a side-panel PDF a tall frame so the viewer scales to the panel width", async () => {
    render(
      <ExpenseDetail
        expense={{ ...expense, receiptFilename: "bill.pdf", receiptKey: "receipts/u1/bill.pdf" }}
        editHref="/edit"
        showHeader
      />
    );

    const preview = await screen.findByTitle("Receipt for Team dinner");
    expect(preview).toHaveClass("h-[min(72dvh,840px)]", "w-full");
    const receipt = screen.getByRole("region", { name: "Receipt" });
    const fields = screen.getByText("Submitted by");
    expect(receipt.compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("ExpenseDetail approval", () => {
  const pending: ExpenseListItem = {
    ...expense,
    receiptKey: undefined,
    receiptFilename: undefined,
    approvalStatus: "pending",
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  };

  it("gives admins Approve and Reject… on a pending expense, with who sent it and when", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(<ExpenseDetail expense={pending} editHref="/edit" review={{ onApprove, onReject, viewerId: "admin" }} />);

    const notice = screen.getByRole("group", { name: "Awaiting approval" });
    expect(notice).toHaveAttribute("data-notice");
    // A notice describes the state the detail opened in; it isn't a live region.
    expect(notice).not.toHaveAttribute("aria-live");
    expect(within(notice).getByText("Awaiting approval")).toBeInTheDocument();
    expect(within(notice).getByText("Submitted by Manas Nilorout 3 days ago. Not in totals yet.")).toBeInTheDocument();
    fireEvent.click(within(notice).getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledWith(pending);
    fireEvent.click(within(notice).getByRole("button", { name: "Reject…" }));
    expect(onReject).toHaveBeenCalledWith(pending);
  });

  it("tells the submitter what happens next, without review buttons", () => {
    render(<ExpenseDetail expense={pending} editHref="/edit" review={{ viewerId: "u1", onResubmit: vi.fn() }} />);
    expect(screen.getByText(/An admin will review this. It isn.t included in company totals until it.s approved./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject…" })).not.toBeInTheDocument();
  });

  it("shows no review buttons on an approved expense, just an Approved badge and who approved it", () => {
    render(
      <ExpenseDetail
        expense={{
          ...pending,
          approvalStatus: "approved",
          reviewedBy: { _id: "p", name: "Priya" },
          reviewedAt: "2026-11-12T09:00:00.000Z",
        }}
        editHref="/edit"
        review={{ onApprove: vi.fn(), onReject: vi.fn() }}
      />
    );
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("by Priya on 12 Nov 2026")).toBeInTheDocument();
  });

  it("calls a legacy expense simply approved, and an admin's own entry approved automatically", () => {
    const { rerender } = render(<ExpenseDetail expense={{ ...pending, approvalStatus: undefined }} editHref="/edit" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
    rerender(
      <ExpenseDetail
        expense={{
          ...pending,
          approvalStatus: "approved",
          approvalHistory: [{ action: "auto_approved", by: "u1", at: "2026-11-12T09:00:00.000Z", note: null }],
        }}
        editHref="/edit"
      />
    );
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("automatically, added by an admin")).toBeInTheDocument();
  });

  it("shows a rejection's reason and, to its submitter, Edit & resubmit and Resubmit as is…", () => {
    const onResubmit = vi.fn();
    const rejected: ExpenseListItem = {
      ...pending,
      approvalStatus: "rejected",
      reviewedBy: { _id: "p", name: "Priya" },
      reviewedAt: "2026-11-12T09:00:00.000Z",
      rejectionReason: "Receipt missing or unreadable",
    };
    render(<ExpenseDetail expense={rejected} editHref="/edit" review={{ viewerId: "u1", onResubmit }} />);

    const notice = screen.getByRole("group", { name: "Rejected" });
    expect(within(notice).getByText("Priya rejected this on 12 Nov 2026.")).toBeInTheDocument();
    expect(within(notice).getByText("Receipt missing or unreadable")).toBeInTheDocument();
    expect(within(notice).getByText(/What next: fix the details and resubmit/)).toBeInTheDocument();
    expect(within(notice).getByRole("link", { name: "Edit & resubmit" })).toHaveAttribute("href", "/edit");
    fireEvent.click(within(notice).getByRole("button", { name: "Resubmit as is…" }));
    expect(onResubmit).toHaveBeenCalledWith(rejected);
    // The plain Edit button would only repeat "Edit & resubmit".
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("doesn't offer an admin the submitter's resubmit actions", () => {
    render(
      <ExpenseDetail
        expense={{ ...pending, approvalStatus: "rejected", rejectionReason: "Duplicate" }}
        editHref="/edit"
        review={{ viewerId: "admin", onApprove: vi.fn(), onReject: vi.fn(), onResubmit: vi.fn() }}
      />
    );
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText(/Manas Nilorout can fix it and resubmit/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit & resubmit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("shows reviewers the submitter's note on a resubmission, and the approval history", () => {
    render(
      <ExpenseDetail
        expense={{
          ...pending,
          approvalHistory: [
            { action: "submitted", by: "u1", at: "2026-11-10T09:00:00.000Z", note: null },
            { action: "rejected", by: { _id: "p", name: "Priya" }, at: "2026-11-12T09:00:00.000Z", note: "Not a business expense" },
            { action: "resubmitted", by: "u1", at: "2026-11-13T09:00:00.000Z", note: "Client was at the dinner" },
          ],
        }}
        editHref="/edit"
        review={{ onApprove: vi.fn(), onReject: vi.fn() }}
      />
    );
    expect(screen.getByText(/Note from Manas Nilorout:/)).toHaveTextContent("Note from Manas Nilorout: Client was at the dinner");
    expect(screen.getByText("Approval history (3)")).toBeInTheDocument();
    expect(screen.getByText("Rejected · Priya · 12 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("Submitted · Manas Nilorout · 10 Nov 2026")).toBeInTheDocument();
  });

  it("turns off the buttons while a review of this expense is pending", () => {
    render(
      <ExpenseDetail
        expense={pending}
        editHref="/edit"
        review={{ onApprove: vi.fn(), onReject: vi.fn(), inFlight: { "exp-1": "approve" }, shortcuts: true }}
      />
    );
    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAttribute("aria-keyshortcuts", "A");
  });

  it("tells an admin their own pending expense needs another admin, without review buttons", () => {
    render(
      <ExpenseDetail
        expense={pending}
        editHref="/edit"
        review={{ onApprove: vi.fn(), onReject: vi.fn(), onReopen: vi.fn(), viewerId: "u1", viewerRole: "admin" }}
      />
    );
    const notice = screen.getByRole("group", { name: "Awaiting approval" });
    expect(notice).toHaveTextContent("Another admin needs to review this — you can't approve your own expense.");
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject…" })).not.toBeInTheDocument();
  });

  it("shows the server's edit marker as an event, not as the person's words, and lists a reopen", () => {
    render(
      <ExpenseDetail
        expense={{
          ...pending,
          approvalHistory: [
            { action: "submitted", by: "u1", at: "2026-11-10T09:00:00.000Z", note: null },
            { action: "approved", by: { _id: "p", name: "Priya" }, at: "2026-11-11T09:00:00.000Z", note: null },
            { action: "resubmitted", by: "u1", at: "2026-11-12T09:00:00.000Z", note: "Edited after approval" },
            { action: "approved", by: { _id: "p", name: "Priya" }, at: "2026-11-13T09:00:00.000Z", note: null },
            { action: "reopened", by: { _id: "p", name: "Priya" }, at: "2026-11-14T09:00:00.000Z", note: "Wrong department" },
          ],
        }}
        editHref="/edit"
        review={{ onApprove: vi.fn(), onReject: vi.fn(), viewerId: "admin" }}
      />
    );
    expect(screen.getByText("Manas Nilorout edited it after it was approved.")).toBeInTheDocument();
    expect(screen.queryByText(/“Edited after approval”/)).not.toBeInTheDocument();
    expect(screen.getByText("Moved back to review · Priya · 14 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("“Wrong department”")).toBeInTheDocument();
    // The notice says who moved it back and why, instead of "submitted just now".
    const notice = screen.getByRole("group", { name: "Awaiting approval" });
    expect(notice).toHaveTextContent("Priya moved it back to review: Wrong department");
    expect(notice).toHaveTextContent("Submitted by Manas Nilorout. Not in totals yet.");
  });
});

describe("ExpenseDetail move back to review", () => {
  const approved: ExpenseListItem = {
    ...expense,
    receiptKey: undefined,
    receiptFilename: undefined,
    approvalStatus: "approved",
    reviewedBy: { _id: "p", name: "Priya" },
    reviewedAt: "2026-11-12T09:00:00.000Z",
  };
  const admin = (overrides = {}) => ({
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onReopen: vi.fn(),
    viewerId: "admin",
    viewerRole: "admin" as const,
    ...overrides,
  });

  it.each([
    ["an approved", approved],
    ["a legacy (no status)", { ...approved, approvalStatus: undefined }],
    ["a rejected", { ...approved, approvalStatus: "rejected" as const, rejectionReason: "Duplicate" }],
  ])("offers admins Move back to review… on %s expense", (_label, target) => {
    const review = admin();
    render(<ExpenseDetail expense={target} editHref="/edit" review={review} />);
    fireEvent.click(screen.getByRole("button", { name: "Move back to review…" }));
    expect(review.onReopen).toHaveBeenCalledWith(target);
  });

  it.each([
    ["a pending expense", { ...approved, approvalStatus: "pending" as const }, admin()],
    ["one with linked assets", { ...approved, linkedAssetCount: 2 }, admin()],
    ["the admin's own expense", approved, admin({ viewerId: "u1" })],
    ["a submitter", approved, { viewerId: "u1", onResubmit: vi.fn() }],
    ["an expense whose review is being sent", approved, admin({ inFlight: { "exp-1": "approve" } })],
  ])("doesn't offer it on %s", (_label, target, review) => {
    render(<ExpenseDetail expense={target} editHref="/edit" review={review} />);
    expect(screen.queryByRole("button", { name: "Move back to review…" })).not.toBeInTheDocument();
  });
});
