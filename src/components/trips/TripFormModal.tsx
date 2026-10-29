"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertCircle, Building2, CalendarDays, IndianRupee, MapPin, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { dayKey, normalizeTripInput, tripDayCount, TRIP_LIMITS } from "@/lib/trip";
import { useAuth } from "@/contexts/AuthContext";
import type { TripListItem } from "@/types/trip";
import Modal from "@/components/ui/Modal";
import MultiSelect from "@/components/ui/MultiSelect";
import Spinner from "@/components/ui/Spinner";

interface Member {
  _id: string;
  name: string;
  email: string;
}

interface Department {
  _id: string;
  name: string;
}

interface TripFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The trip to edit; omit (or null) to create one. */
  trip?: TripListItem | null;
  onSaved: (trip: TripListItem) => void;
}

interface FormState {
  name: string;
  destinations: string[];
  destinationDraft: string;
  startDate: string;
  endDate: string;
  travelers: string[];
  purpose: string;
  department: string;
  budget: string;
  notes: string;
}

function emptyForm(currentUserId?: string): FormState {
  return {
    name: "",
    destinations: [],
    destinationDraft: "",
    startDate: "",
    endDate: "",
    travelers: currentUserId ? [currentUserId] : [],
    purpose: "",
    department: "",
    budget: "",
    notes: "",
  };
}

function formFromTrip(trip: TripListItem): FormState {
  return {
    name: trip.name,
    destinations: [...trip.destinations],
    destinationDraft: "",
    startDate: dayKey(trip.startDate),
    endDate: dayKey(trip.endDate),
    travelers: trip.travelers.map((t) => t._id),
    purpose: trip.purpose || "",
    department: trip.department?._id || "",
    budget: trip.budget != null ? String(trip.budget) : "",
    notes: trip.notes || "",
  };
}

/** Splits typed text on commas and appends new (case-insensitively unique) places. */
function addDestinations(current: string[], raw: string): string[] {
  const next = [...current];
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (value && !next.some((d) => d.toLowerCase() === value.toLowerCase())) next.push(value);
  }
  return next;
}

export default function TripFormModal({ isOpen, onClose, trip, onSaved }: TripFormModalProps) {
  const { user } = useAuth();
  const isEdit = Boolean(trip);
  const [form, setForm] = useState<FormState>(() => (trip ? formFromTrip(trip) : emptyForm(user?._id)));
  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [lookupsLoaded, setLookupsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Read at open time only, so a background refresh of the trip can't wipe edits.
  const initial = useRef({ trip, userId: user?._id });
  initial.current = { trip, userId: user?._id };

  // Fresh form every time the modal opens (create defaults to "me" as traveler).
  useEffect(() => {
    if (!isOpen) return;
    const { trip: source, userId } = initial.current;
    setForm(source ? formFromTrip(source) : emptyForm(userId));
    setError(null);
    setSaving(false);
    // The Modal focuses its panel after mounting; take focus back for the name.
    const timer = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || lookupsLoaded) return;
    let active = true;
    setLoadingLookups(true);
    api
      .get("/api/lookups?include=members,departments")
      .then((data: { members?: Member[]; departments?: Department[] }) => {
        if (!active) return;
        setMembers(data.members || []);
        setDepartments(data.departments || []);
        setLookupsLoaded(true);
      })
      .catch(() => {
        if (active) setError("Couldn't load people and departments. You can still save with the defaults.");
      })
      .finally(() => {
        if (active) setLoadingLookups(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, lookupsLoaded]);

  // Travelers already on the trip stay selectable even if they aren't listed.
  const travelerOptions = useMemo(() => {
    const options = members.map((m) => ({ value: m._id, label: m.name || m.email }));
    const known = new Set(options.map((o) => o.value));
    for (const person of trip?.travelers ?? []) {
      if (!known.has(person._id)) options.push({ value: person._id, label: person.name || person.email });
    }
    if (user && !known.has(user._id) && !options.some((o) => o.value === user._id)) {
      options.push({ value: user._id, label: user.name || user.email });
    }
    return options;
  }, [members, trip, user]);

  const labelFor = (id: string) =>
    travelerOptions.find((o) => o.value === id)?.label ?? (id === user?._id ? user.name : "Traveler");

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const setStartDate = (value: string) => {
    setForm((current) => ({
      ...current,
      startDate: value,
      // End follows the start until it is set later than it.
      endDate: !current.endDate || (value && current.endDate < value) ? value : current.endDate,
    }));
  };

  const commitDestinationDraft = () => {
    setForm((current) =>
      current.destinationDraft.trim()
        ? { ...current, destinations: addDestinations(current.destinations, current.destinationDraft), destinationDraft: "" }
        : current
    );
  };

  const onDestinationKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDestinationDraft();
    } else if (e.key === "Backspace" && !form.destinationDraft && form.destinations.length > 0) {
      update("destinations", form.destinations.slice(0, -1));
    }
  };

  const dayCount =
    form.startDate && form.endDate && form.endDate >= form.startDate
      ? tripDayCount({ startDate: form.startDate, endDate: form.endDate })
      : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const destinations = addDestinations(form.destinations, form.destinationDraft);
    const body = {
      name: form.name,
      purpose: form.purpose,
      destinations,
      startDate: form.startDate,
      endDate: form.endDate || form.startDate,
      travelers: form.travelers,
      department: form.department || null,
      budget: form.budget.trim() === "" ? null : Number(form.budget),
      notes: form.notes,
    };
    try {
      normalizeTripInput(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please check the trip details");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const data: { trip: TripListItem } = trip
        ? await api.put(`/api/trips/${trip._id}`, body)
        : await api.post("/api/trips", body);
      setForm((current) => ({ ...current, destinations, destinationDraft: "" }));
      onSaved(data.trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save trip");
    } finally {
      setSaving(false);
    }
  };

  const labelClass = "mb-1.5 block text-sm font-medium text-muted";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? "Edit trip" : "New trip"} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} noValidate>
        {/* Scrolls on short (phone) screens; the actions stay pinned below. */}
        <div className="-mx-6 -mt-1 max-h-[calc(100dvh-12rem)] space-y-4 overflow-y-auto px-6 pb-4 pt-1">
          <div>
            <label htmlFor="trip-name" className={labelClass}>
              Trip name <span className="text-red-500">*</span>
            </label>
            <input
              id="trip-name"
              ref={nameRef}
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              maxLength={TRIP_LIMITS.name}
              placeholder="Mumbai – Acme pitch"
              className="input-field"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="trip-destinations" className={labelClass}>
              Destinations
            </label>
            <div className="input-field flex min-h-[42px] flex-wrap items-center gap-1.5 py-1.5 pl-3 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10">
              <MapPin className="h-4 w-4 flex-shrink-0 text-rose-400" aria-hidden="true" />
              {form.destinations.map((place) => (
                <span
                  key={place}
                  className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                >
                  {place}
                  <button
                    type="button"
                    onClick={() => update("destinations", form.destinations.filter((d) => d !== place))}
                    className="rounded-full p-0.5 hover:bg-sky-100 dark:hover:bg-sky-500/20"
                    aria-label={`Remove ${place}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                id="trip-destinations"
                value={form.destinationDraft}
                onChange={(e) => {
                  const value = e.target.value;
                  // Pasting "Pune, Mumbai" turns into chips straight away.
                  if (value.includes(",")) {
                    setForm((current) => ({
                      ...current,
                      destinations: addDestinations(current.destinations, value),
                      destinationDraft: "",
                    }));
                  } else {
                    update("destinationDraft", value);
                  }
                }}
                onKeyDown={onDestinationKeyDown}
                onBlur={commitDestinationDraft}
                placeholder={form.destinations.length ? "Add another" : "Mumbai, Pune"}
                className="min-w-[8rem] flex-1 border-0 bg-transparent p-0.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-0"
                autoComplete="off"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Press Enter or comma to add each place.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="trip-start" className={labelClass}>
                Start date <span className="text-red-500">*</span>
              </label>
              <input
                id="trip-start"
                type="date"
                value={form.startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="trip-end" className={labelClass}>
                End date <span className="text-red-500">*</span>
              </label>
              <input
                id="trip-end"
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(e) => update("endDate", e.target.value)}
                className="input-field"
              />
            </div>
          </div>
          {dayCount !== null && (
            <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {dayCount} day{dayCount !== 1 ? "s" : ""}
            </p>
          )}

          <div>
            <span className={labelClass}>
              Travelers <span className="text-red-500">*</span>
            </span>
            <MultiSelect
              options={travelerOptions}
              selected={form.travelers}
              onChange={(values) => update("travelers", values)}
              placeholder={loadingLookups ? "Loading people..." : "Who's travelling?"}
              ariaLabel="Travelers"
              icon={<Users className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-brand-400" />}
            />
            {form.travelers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.travelers.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  >
                    {labelFor(id)}
                    {id === user?._id && <span className="text-brand-500/80">(you)</span>}
                    <button
                      type="button"
                      onClick={() => update("travelers", form.travelers.filter((t) => t !== id))}
                      className="rounded-full p-0.5 hover:bg-brand-100 dark:hover:bg-brand-500/20"
                      aria-label={`Remove traveler ${labelFor(id)}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="trip-purpose" className={labelClass}>
              Purpose / client
            </label>
            <input
              id="trip-purpose"
              value={form.purpose}
              onChange={(e) => update("purpose", e.target.value)}
              maxLength={TRIP_LIMITS.purpose}
              placeholder="Quarterly review with Acme Corp"
              className="input-field"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="trip-department" className={labelClass}>
                Department
              </label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-400" />
                <select
                  id="trip-department"
                  value={form.department}
                  onChange={(e) => update("department", e.target.value)}
                  className="input-field pl-10"
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                  {trip?.department && !departments.some((d) => d._id === trip.department?._id) && (
                    <option value={trip.department._id}>{trip.department.name}</option>
                  )}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="trip-budget" className={labelClass}>
                Budget (₹)
              </label>
              <div className="relative">
                <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
                <input
                  id="trip-budget"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={form.budget}
                  onChange={(e) => update("budget", e.target.value)}
                  placeholder="Optional"
                  className="input-field pl-10 tabular-nums"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="trip-notes" className={labelClass}>
              Notes
            </label>
            <textarea
              id="trip-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              maxLength={TRIP_LIMITS.notes}
              placeholder="Hotel booked near the client office, flights via MakeMyTrip..."
              className="input-field resize-none"
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div className="-mx-6 flex flex-col-reverse gap-2 border-t border-line px-6 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? (
              <>
                <Spinner size="sm" /> Saving...
              </>
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Create trip"
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
