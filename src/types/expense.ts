import type { ApprovalHistoryAction, ApprovalStatus } from "@/lib/approval";
import type { PaymentSource } from "@/lib/expense";
import type { ExpensePaymentEntry } from "@/lib/expense-csv";
import type { TravelType } from "@/lib/trip";

/** An expense as `GET /api/expenses` (and the trip endpoints) return it, populated. */
export interface ExpenseListItem {
  _id: string;
  title: string;
  amount: number;
  amountInBaseCurrency?: number;
  /** The rate `amount` was converted at on entry; missing on older documents. */
  exchangeRateToBase?: number | null;
  gstAmount?: number | null;
  currency?: { _id: string; code: string; name: string; symbol: string; isBase: boolean };
  date: string;
  description: string;
  paymentSource?: PaymentSource;
  pocketAmount?: number | null;
  pocketAmountInBaseCurrency?: number | null;
  payments?: ExpensePaymentEntry[];
  receiptKey?: string;
  receiptFilename?: string;
  category: { _id: string; name: string };
  department: { _id: string; name: string };
  createdBy: { _id: string; name: string; email: string; photoURL?: string };
  /** Populated as `{ _id, name }`; `null` when the expense is in no trip. */
  trip?: { _id: string; name: string } | null;
  travelType?: TravelType | null;
  linkedAssetCount?: number;
  /** Missing on expenses created before approvals existed; treat as approved. */
  approvalStatus?: ApprovalStatus | null;
  /** Populated as `{ _id, name, email }` where the endpoint populates it; otherwise an id. */
  reviewedBy?: { _id: string; name: string; email?: string } | string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  approvalHistory?: ApprovalHistoryItem[];
  /** The document's edit revision; sent back with approve/reject/resubmit. */
  assetAllocationRevision?: number;
  createdAt?: string;
}

/** One approval audit entry; `by` is populated on the single-expense GET. */
export interface ApprovalHistoryItem {
  action: ApprovalHistoryAction;
  by: { _id: string; name: string; email?: string } | string;
  at: string;
  note: string | null;
}
