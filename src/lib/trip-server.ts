import mongoose from "mongoose";
import type { AuthUser } from "@/lib/auth";
import type { TripInput } from "@/lib/trip";
import Trip from "@/models/Trip";
import User from "@/models/User";
import Department from "@/models/Department";

interface TripAccessFields {
  travelers?: unknown[];
  createdBy?: unknown;
}

/** Ids may arrive raw or populated (`{ _id }`); compare them as strings. */
export function idOf(value: unknown): string {
  if (value && typeof value === "object" && "_id" in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

export function isAdminUser(user: AuthUser): boolean {
  return user.role === "admin" || user.role === "master_admin";
}

/**
 * Trips a person can see: admins see all; everyone else sees the trips they
 * travel on or created. Inside a visible trip, `user`-role people still see
 * only their own expenses (`buildExpenseFilter` scopes that).
 */
export function tripAccessFilter(user: AuthUser): Record<string, unknown> {
  if (isAdminUser(user)) return {};
  const self = new mongoose.Types.ObjectId(user._id);
  return { $or: [{ travelers: self }, { createdBy: self }] };
}

/** Viewing a trip and adding one's own expenses to it go together. */
export function canViewTrip(trip: TripAccessFields, user: AuthUser): boolean {
  if (isAdminUser(user)) return true;
  if (idOf(trip.createdBy) === user._id) return true;
  return (trip.travelers ?? []).some((traveler) => idOf(traveler) === user._id);
}

/** Editing or deleting the trip itself: its creator or an admin. */
export function canManageTrip(trip: TripAccessFields, user: AuthUser): boolean {
  return isAdminUser(user) || idOf(trip.createdBy) === user._id;
}

/**
 * Resolves the `trip` an expense form sent. `undefined` means "leave as is",
 * `null`/"" means "not part of a trip"; anything else must be a trip the
 * caller can see. Throws with a user-facing message otherwise.
 */
export async function resolveTripAssignment(
  raw: unknown,
  user: AuthUser
): Promise<mongoose.Types.ObjectId | null | undefined> {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const id = typeof raw === "object" && raw && "_id" in raw ? idOf(raw) : String(raw);
  if (!mongoose.isValidObjectId(id)) throw new Error("Trip is invalid");
  const trip = await Trip.findById(id).select("travelers createdBy").lean<TripAccessFields | null>();
  if (!trip) throw new Error("Trip is invalid");
  if (!canViewTrip(trip, user)) throw new Error("You can only add expenses to trips you are on");
  return new mongoose.Types.ObjectId(id);
}

/** Rejects travelers who aren't users, or a department that doesn't exist. */
export async function assertTripRefsExist(input: TripInput): Promise<void> {
  const [travelerCount, departmentExists] = await Promise.all([
    User.countDocuments({ _id: { $in: input.travelers } }),
    input.department ? Department.exists({ _id: input.department }) : Promise.resolve(true),
  ]);
  if (travelerCount !== input.travelers.length) {
    throw new Error("A traveler is not a user of this app");
  }
  if (!departmentExists) throw new Error("Department is invalid");
}

/** Converts validated input to the stored document fields. */
export function tripDocumentFields(input: TripInput) {
  return {
    ...input,
    travelers: input.travelers.map((id) => new mongoose.Types.ObjectId(id)),
    department: input.department ? new mongoose.Types.ObjectId(input.department) : null,
  };
}

/** Stored trip back into the shape `normalizeTripInput` accepts, for merging updates. */
export function storedTripInput(trip: {
  name: string;
  purpose?: string;
  destinations?: string[];
  startDate: Date | string;
  endDate: Date | string;
  travelers?: unknown[];
  department?: unknown;
  budget?: number | null;
  notes?: string;
}): Record<string, unknown> {
  return {
    name: trip.name,
    purpose: trip.purpose,
    destinations: trip.destinations ?? [],
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelers: (trip.travelers ?? []).map(idOf),
    department: trip.department ? idOf(trip.department) : null,
    budget: trip.budget ?? null,
    notes: trip.notes,
  };
}

/** Fields populated on a trip wherever the client shows one. */
export const TRIP_TRAVELER_FIELDS = "name email photoURL";
