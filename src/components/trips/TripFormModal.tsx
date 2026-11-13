"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertCircle, Briefcase, Building2, CalendarDays, IndianRupee, MapPin, StickyNote, Users } from "lucide-react";
import { api } from "@/lib/api";
import { dayKey, normalizeTripInput, tripDayCount, TRIP_LIMITS } from "@/lib/trip";
import { useAuth } from "@/contexts/AuthContext";
import type { TripListItem } from "@/types/trip";
import Modal from "@/components/ui/Modal";
import MultiSelect from "@/components/ui/MultiSelect";
import Field, { inputClass, selectClass, textareaClass } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { RemovableChip } from "@/components/ui/Badge";
import { DialogActions } from "@/components/ui/ConfirmDialog";
import { FieldGrid } from "@/components/ui/FormSection";

function Required() {
  return (
    <span aria-hidden="true" className="text-danger">
      *
    </span>
  );
}

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? "Edit trip" : "New trip"} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field label={<>Trip name <Required /></>}>
          <input
            ref={nameRef}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            maxLength={TRIP_LIMITS.name}
            placeholder="Mumbai – Acme pitch"
            className={inputClass}
            autoComplete="off"
          />
        </Field>

        <div className="flex flex-col gap-2">
          <Field label="Destinations" icon={MapPin} hint="Press Enter or comma to add each place.">
            <input
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
              className={inputClass}
              autoComplete="off"
            />
          </Field>
          {form.destinations.length > 0 && (
            <ul aria-label="Destinations added" className="flex flex-wrap gap-1.5">
              {form.destinations.map((place) => (
                <li key={place}>
                  <RemovableChip
                    removeLabel={`Remove ${place}`}
                    onRemove={() => update("destinations", form.destinations.filter((d) => d !== place))}
                  >
                    {place}
                  </RemovableChip>
                </li>
              ))}
            </ul>
          )}
        </div>

        <FieldGrid>
          <Field label={<>Start date <Required /></>} icon={CalendarDays}>
            <input type="date" value={form.startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </Field>
          <Field
            label={<>End date <Required /></>}
            icon={CalendarDays}
            hint={dayCount !== null ? `${dayCount} day${dayCount !== 1 ? "s" : ""}` : undefined}
          >
            <input
              type="date"
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(e) => update("endDate", e.target.value)}
              className={inputClass}
            />
          </Field>
        </FieldGrid>

        <div className="flex flex-col gap-2">
          <Field label={<>Travelers <Required /></>} icon={Users}>
            <MultiSelect
              options={travelerOptions}
              selected={form.travelers}
              onChange={(values) => update("travelers", values)}
              placeholder={loadingLookups ? "Loading people..." : "Who's travelling?"}
              ariaLabel="Travelers"
            />
          </Field>
          {form.travelers.length > 0 && (
            <ul aria-label="Travelers added" className="flex flex-wrap gap-1.5">
              {form.travelers.map((id) => (
                <li key={id}>
                  <RemovableChip
                    removeLabel={`Remove traveler ${labelFor(id)}`}
                    onRemove={() => update("travelers", form.travelers.filter((t) => t !== id))}
                  >
                    {labelFor(id)}
                    {id === user?._id && <span className="ml-1 font-normal text-ink-3">(you)</span>}
                  </RemovableChip>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Field label="Purpose / client" icon={Briefcase}>
          <input
            value={form.purpose}
            onChange={(e) => update("purpose", e.target.value)}
            maxLength={TRIP_LIMITS.purpose}
            placeholder="Quarterly review with Acme Corp"
            className={inputClass}
          />
        </Field>

        <FieldGrid>
          <Field label="Department" icon={Building2}>
            <select value={form.department} onChange={(e) => update("department", e.target.value)} className={selectClass}>
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
          </Field>
          <Field label="Budget (₹)" icon={IndianRupee}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.budget}
              onChange={(e) => update("budget", e.target.value)}
              placeholder="Optional"
              className={cn(inputClass, "num")}
            />
          </Field>
        </FieldGrid>

        <Field label="Notes" icon={StickyNote}>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            maxLength={TRIP_LIMITS.notes}
            placeholder="Hotel booked near the client office, flights via MakeMyTrip..."
            className={cn(textareaClass, "resize-none")}
          />
        </Field>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertCircle aria-hidden="true" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogActions
          onCancel={onClose}
          confirmLabel={isEdit ? "Save changes" : "Create trip"}
          busyLabel="Saving..."
          busy={saving}
        />
      </form>
    </Modal>
  );
}
