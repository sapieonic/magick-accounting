import type { PayerOption, PaymentDraft } from "@/components/expenses/PaymentSourceFields";
import type { TravelType } from "@/lib/trip";

export interface Department {
  _id: string;
  name: string;
  isDefault?: boolean;
}

export interface Category {
  _id: string;
  name: string;
}

export interface CurrencyOption {
  _id: string;
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
  /** Today's rate to INR, for the form's preview; the server converts on save. */
  rateToBase: number;
}

/** Options the expense forms pick from (`LOOKUPS_URL`). */
export interface ExpenseLookups {
  departments: Department[];
  categories: Category[];
  currencies: CurrencyOption[];
  members: PayerOption[];
}

/** The expense form's values, as typed (amounts are strings). */
export interface ExpenseFormValues {
  title: string;
  amount: string;
  gstAmount: string;
  currency: string;
  category: string;
  department: string;
  date: string;
  description: string;
  paymentSource: string;
  pocketAmount: string;
  payments: PaymentDraft[];
  trip: string;
  travelType: TravelType | null;
}

/** Fields the receipt reader can fill in; they are marked "from receipt". */
export type AiField = "title" | "amount" | "gstAmount" | "date" | "description" | "category" | "currency";

export const EMPTY_LOOKUPS: ExpenseLookups = { departments: [], categories: [], currencies: [], members: [] };

export function emptyExpenseValues(date = ""): ExpenseFormValues {
  return {
    title: "",
    amount: "",
    gstAmount: "",
    currency: "",
    category: "",
    department: "",
    date,
    description: "",
    paymentSource: "pocket",
    pocketAmount: "",
    payments: [],
    trip: "",
    travelType: null,
  };
}
