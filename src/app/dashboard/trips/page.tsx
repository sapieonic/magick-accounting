"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { CalendarDays, Luggage, MapPin, Plus, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatBaseCurrency } from "@/lib/currency";
import { dayKey, formatTripDates, todayKey, tripDayCount, withViewerStatus, type TripStatus } from "@/lib/trip";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { InlineLoader } from "@/components/ui/Spinner";
import PageHeader from "@/components/ui/PageHeader";
import Button, { IconButton } from "@/components/ui/Button";
import Field, { inputClass } from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { cn } from "@/components/ui/cn";
import { focusRing, panelClass, transition } from "@/components/ui/styles";
import TripFormModal from "@/components/trips/TripFormModal";
import { BudgetMeter, TravelerAvatars, TripStatusBadge } from "@/components/trips/TripMeta";
import type { TripListItem } from "@/types/trip";

type StatusFilter = "all" | TripStatus;

const SECTIONS: { status: TripStatus; title: string; hint: string }[] = [
  { status: "ongoing", title: "Ongoing", hint: "On the road right now" },
  { status: "upcoming", title: "Upcoming", hint: "Soonest first" },
  { status: "completed", title: "Past", hint: "Most recent first" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...SECTIONS.map((s) => ({ value: s.status, label: s.title })),
];

function isStatusFilter(value: string | null): value is StatusFilter {
  return STATUS_OPTIONS.some((o) => o.value === value);
}

/** "Starts tomorrow", "Day 2 of 4", "Ended 3 days ago". */
function statusHint(trip: TripListItem, today: string): string {
  const days = tripDayCount(trip);
  if (trip.status === "upcoming") {
    const until = differenceInCalendarDays(parseISO(dayKey(trip.startDate)), parseISO(today));
    if (until <= 0) return "Starts today";
    if (until === 1) return "Starts tomorrow";
    return `Starts in ${until} days`;
  }
  if (trip.status === "ongoing") {
    const day = differenceInCalendarDays(parseISO(today), parseISO(dayKey(trip.startDate))) + 1;
    return `Day ${Math.min(Math.max(day, 1), days)} of ${days}`;
  }
  const ago = differenceInCalendarDays(parseISO(today), parseISO(dayKey(trip.endDate)));
  if (ago <= 0) return "Ended today";
  if (ago === 1) return "Ended yesterday";
  if (ago < 60) return `Ended ${ago} days ago`;
  return `${days} day${days !== 1 ? "s" : ""}`;
}

function TripCard({ trip, today, showBudget }: { trip: TripListItem; today: string; showBudget: boolean }) {
  const days = tripDayCount(trip);
  return (
    <Link
      href={`/dashboard/trips/${trip._id}`}
      data-testid="trip-card"
      className={cn(panelClass, "group flex min-w-0 flex-col gap-3 p-5 hover:border-accent-line hover:bg-hover", transition, focusRing)}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[15px] font-semibold tracking-[-0.01em] text-ink [overflow-wrap:anywhere] group-hover:text-accent">
          {trip.name}
        </h3>
        <TripStatusBadge status={trip.status}>{statusHint(trip, today)}</TripStatusBadge>
      </div>

      <div className="flex flex-col gap-1 text-[13px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <CalendarDays aria-hidden="true" size={14} strokeWidth={1.6} className="shrink-0 text-ink-3" />
          <span className="num">
            {formatTripDates(trip)} · {days} day{days !== 1 ? "s" : ""}
          </span>
        </span>
        {trip.destinations.length > 0 && (
          <span className="flex items-start gap-1.5">
            <MapPin aria-hidden="true" size={14} strokeWidth={1.6} className="mt-0.5 shrink-0 text-ink-3" />
            <span className="line-clamp-2">{trip.destinations.join(" → ")}</span>
          </span>
        )}
      </div>

      {/* A user's totals cover only their own expenses, so they can't be read against the trip budget. */}
      {showBudget && trip.budget != null && <BudgetMeter spent={trip.totalAmount} budget={trip.budget} />}

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-rule-2 pt-3">
        <TravelerAvatars travelers={trip.travelers} />
        <div className="flex flex-col items-end">
          <span className="num whitespace-nowrap font-medium text-ink">{formatBaseCurrency(trip.totalAmount)}</span>
          <span className="text-xs text-ink-3">
            {trip.expenseCount} expense{trip.expenseCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </Link>
  );
}

const GRID = "grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))]";

function TripsSkeleton() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading trips">
      {[3, 2].map((count, s) => (
        <div key={s} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-28" />
          <div className={GRID}>
            {Array.from({ length: count }).map((_, i) => (
              <Skeleton key={i} className="h-[188px] rounded-panel" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TripsPage() {
  useTitle("Trips");
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [urlSynced, setUrlSynced] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const hasLoaded = useRef(false);
  const today = todayKey();

  // Read ?q= and ?status= once so the view survives refresh / back navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q") ?? "";
    const initialStatus = params.get("status");
    setSearchInput(q);
    setSearch(q.trim());
    if (isStatusFilter(initialStatus)) setStatus(initialStatus);
    setUrlSynced(true);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (!urlSynced) return;
    const params = new URLSearchParams(window.location.search);
    if (search) params.set("q", search);
    else params.delete("q");
    if (status !== "all") params.set("status", status);
    else params.delete("status");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [urlSynced, search, status]);

  useEffect(() => {
    if (!urlSynced) return;
    let active = true;
    if (hasLoaded.current) setRefreshing(true);
    const url = search ? `/api/trips?q=${encodeURIComponent(search)}` : "/api/trips";
    api
      .get(url)
      .then((data: { trips?: TripListItem[] }) => {
        if (active) setTrips((data.trips || []).map((trip) => withViewerStatus(trip)));
      })
      .catch((err) => {
        if (active) toast(err instanceof Error ? err.message : "Failed to load trips", "error");
      })
      .finally(() => {
        if (!active) return;
        hasLoaded.current = true;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [urlSynced, search, toast]);

  const sections = useMemo(
    () =>
      SECTIONS.filter((section) => status === "all" || section.status === status)
        .map((section) => {
          const items = trips.filter((t) => t.status === section.status);
          // The API sorts newest start first; upcoming reads better soonest first.
          if (section.status === "upcoming") items.reverse();
          return { ...section, items };
        })
        .filter((section) => section.items.length > 0),
    [trips, status]
  );

  const handleSaved = (trip: TripListItem) => {
    setModalOpen(false);
    toast(`Trip "${trip.name}" created`);
    router.push(`/dashboard/trips/${trip._id}`);
  };

  const statusTitle = SECTIONS.find((s) => s.status === status)?.title.toLowerCase();

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <PageHeader
        title="Trips"
        meta={
          <>
            Flights, stays and meals for each business trip, grouped in one place.
            {!isAdmin && <span className="block text-xs">Totals and expense counts include only your own expenses.</span>}
          </>
        }
        actions={
          <Button icon={Plus} onClick={() => setModalOpen(true)}>
            New trip
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-0 flex-[1_1_280px] sm:max-w-md">
          <Field label="Search trips" icon={Search}>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Trip name or destination"
              className={cn(inputClass, "pr-11")}
            />
          </Field>
          {searchInput && (
            <IconButton
              icon={X}
              size="sm"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="absolute bottom-0.5 right-0.5"
            />
          )}
        </div>
        <SegmentedControl options={STATUS_OPTIONS} value={status} onChange={setStatus} aria-label="Trip status" />
        {refreshing && <InlineLoader label="Searching..." className="min-h-11" />}
      </div>

      {loading ? (
        <TripsSkeleton />
      ) : trips.length === 0 ? (
        <div className={panelClass}>
          {search ? (
            <EmptyState
              icon={<Search />}
              title="No trips match your search"
              description={`Nothing found for "${search}". Try a trip name or a city.`}
              action={
                <Button variant="secondary" onClick={() => setSearchInput("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Luggage />}
              title="No trips yet"
              description="Create a trip to keep its flights, hotels, cabs and meals together, and see who's owed what when you're back."
              action={
                <Button icon={Plus} onClick={() => setModalOpen(true)}>
                  Plan your first trip
                </Button>
              }
            />
          )}
        </div>
      ) : sections.length === 0 ? (
        <div className={panelClass}>
          <EmptyState
            icon={<Luggage />}
            title={`No ${statusTitle} trips`}
            description="Pick another status to see the rest of your trips."
            action={
              <Button variant="secondary" onClick={() => setStatus("all")}>
                Show all trips
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {sections.map((section) => (
            <section key={section.status} aria-labelledby={`trips-${section.status}`} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <h2 id={`trips-${section.status}`} className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                  {section.title}
                </h2>
                <span className="num text-xs text-ink-3">{section.items.length}</span>
                <span className="hidden text-xs text-ink-3 sm:inline">· {section.hint}</span>
              </div>
              <div className={GRID}>
                {section.items.map((trip) => (
                  <TripCard key={trip._id} trip={trip} today={today} showBudget={isAdmin} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <TripFormModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
    </div>
  );
}
