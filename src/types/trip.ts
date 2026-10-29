import type { ExpenseListItem } from "@/types/expense";
import type { TravelType, TripStatus } from "@/lib/trip";

export interface TripPerson {
  _id: string;
  name: string;
  email: string;
  photoURL?: string;
}

/**
 * The trip details `GET /api/expenses?groupTrips=true` sends alongside the
 * page, keyed by trip id, so a clustered row can render its header.
 */
export interface TripSummary {
  _id: string;
  name: string;
  destinations: string[];
  startDate: string;
  endDate: string;
  travelers: TripPerson[];
  status: TripStatus;
}

/** A trip as `GET /api/trips` and `GET /api/trips/[id]` return it. */
export interface TripListItem extends TripSummary {
  purpose: string;
  department: { _id: string; name: string } | null;
  budget: number | null;
  notes: string;
  createdBy: TripPerson;
  /** Expenses the caller can see (their own for `user` role). */
  expenseCount: number;
  /** Base-currency total of those expenses. */
  totalAmount: number;
  /** Whether the caller may edit or delete the trip. */
  canManage: boolean;
}

export interface TripPayerTotal {
  user: TripPerson;
  totalSpend: number;
  /** Paid out of this person's own pocket: what the company owes them. */
  pocketSpend: number;
  companySpend: number;
}

export interface TripDetailSummary {
  totalAmount: number;
  expenseCount: number;
  pocketAmount: number;
  companyAmount: number;
  byType: { travelType: TravelType | null; total: number; count: number }[];
  byPayer: TripPayerTotal[];
}

/** `GET /api/trips/[id]`. */
export interface TripDetailResponse {
  trip: TripListItem;
  summary: TripDetailSummary;
  /** Visible expenses, oldest first. */
  expenses: ExpenseListItem[];
}
