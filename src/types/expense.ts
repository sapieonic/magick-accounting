import type { PaymentSource } from "@/lib/expense";
import type { ExpensePaymentEntry } from "@/lib/expense-csv";
import type { TravelType } from "@/lib/trip";

/** An expense as `GET /api/expenses` (and the trip endpoints) return it, populated. */
export interface ExpenseListItem {
  _id: string;
  title: string;
  amount: number;
  amountInBaseCurrency?: number;
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
}
