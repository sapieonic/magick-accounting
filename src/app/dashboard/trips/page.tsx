"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { CalendarDays, MapPin, Plane, Plus, Receipt, Search, X } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { formatBaseCurrency } from "@/lib/currency";
import { dayKey, formatTripDates, todayKey, tripDayCount, withViewerStatus, type TripStatus } from "@/lib/trip";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { InlineLoader } from "@/components/ui/Spinner";
import TripFormModal from "@/components/trips/TripFormModal";
import { budgetUsage, TravelerAvatars, TripStatusPill } from "@/components/trips/TripBadges";
import type { TripListItem } from "@/types/trip";

const SECTIONS: { status: TripStatus; title: string; hint: string }[] = [
  { status: "ongoing", title: "Ongoing", hint: "On the road right now" },
  { status: "upcoming", title: "Upcoming", hint: "Soonest first" },
  { status: "completed", title: "Past", hint: "Most recent first" },
];

const STATUS_ICON: Record<TripStatus, string> = {
  ongoing: "bg-gradient-to-br from-emerald-500 to-teal-500 text-white",
  upcoming: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
  completed: "bg-subtle text-muted-foreground",
};

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

function BudgetBar({ spent, budget }: { spent: number; budget: number }) {
  const { percent, over, width, barClass, textClass } = budgetUsage(spent, budget);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">
          Budget <span className="tabular-nums">{formatBaseCurrency(budget)}</span>
        </span>
        <span className={clsx("font-semibold tabular-nums", textClass)}>
          {over ? `${percent}% · over` : `${percent}%`}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-subtle"
        role="progressbar"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
      >
        <div className={clsx("h-full rounded-full transition-all", barClass)} style={{ width }} />
      </div>
    </div>
  );
}

function TripCard({ trip, today }: { trip: TripListItem; today: string }) {
  const days = tripDayCount(trip);
  return (
    <Link
      href={`/dashboard/trips/${trip._id}`}
      data-testid="trip-card"
      className={clsx(
        "card card-hover group flex flex-col gap-4 p-5 focus:outline-none focus:ring-2 focus:ring-brand-500",
        trip.status === "ongoing" &&
          "border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-surface to-surface dark:border-emerald-500/30 dark:from-emerald-500/10"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={clsx("flex-shrink-0 rounded-xl p-2.5", STATUS_ICON[trip.status])}>
          <Plane className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-base font-bold text-foreground group-hover:text-brand-600 dark:group-hover:text-brand-400">
            {trip.name}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{formatTripDates(trip)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {days} day{days !== 1 ? "s" : ""}
            </span>
          </p>
        </div>
        <TripStatusPill status={trip.status} className="hidden sm:inline-flex">
          {statusHint(trip, today)}
        </TripStatusPill>
      </div>

      {trip.destinations.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm text-muted">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-400" aria-hidden="true" />
          <span className="line-clamp-2">{trip.destinations.join(" → ")}</span>
        </p>
      )}

      <TripStatusPill status={trip.status} className="self-start sm:hidden">
        {statusHint(trip, today)}
      </TripStatusPill>

      {trip.budget != null && <BudgetBar spent={trip.totalAmount} budget={trip.budget} />}

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-3">
        <TravelerAvatars travelers={trip.travelers} />
        <div className="text-right">
          <p className="text-base font-bold tabular-nums text-foreground">{formatBaseCurrency(trip.totalAmount)}</p>
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Receipt className="h-3 w-3" aria-hidden="true" />
            {trip.expenseCount} expense{trip.expenseCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}

function TripsSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading trips">
      {[3, 2].map((count, s) => (
        <div key={s} className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: count }).map((_, i) => (
              <Skeleton key={i} className="h-[196px] rounded-2xl" />
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
  const { toast } = useToast();
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [urlSynced, setUrlSynced] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const hasLoaded = useRef(false);
  const today = todayKey();

  // Read ?q= once so a search survives refresh / back navigation.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    setSearchInput(q);
    setSearch(q.trim());
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
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [urlSynced, search]);

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
      SECTIONS.map((section) => {
        const items = trips.filter((t) => t.status === section.status);
        // The API sorts newest start first; upcoming reads better soonest first.
        if (section.status === "upcoming") items.reverse();
        return { ...section, items };
      }).filter((section) => section.items.length > 0),
    [trips]
  );

  const handleSaved = (trip: TripListItem) => {
    setModalOpen(false);
    toast(`Trip "${trip.name}" created`);
    router.push(`/dashboard/trips/${trip._id}`);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trips</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Flights, stays and meals for each business trip, grouped in one place.
          </p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New trip
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search trips"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by trip name or destination"
            className="input-field pl-9 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-subtle hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        {refreshing && <InlineLoader label="Searching..." />}
      </div>

      {loading ? (
        <TripsSkeleton />
      ) : trips.length === 0 ? (
        search ? (
          <EmptyState
            icon={<Search className="h-7 w-7" />}
            title="No trips match your search"
            description={`Nothing found for "${search}". Try a trip name or a city.`}
            action={
              <button type="button" onClick={() => setSearchInput("")} className="btn-secondary">
                Clear search
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={<Plane className="h-7 w-7" />}
            title="No trips yet"
            description="Create a trip to keep its flights, hotels, cabs and meals together, and see who's owed what when you're back."
            action={
              <button type="button" onClick={() => setModalOpen(true)} className="btn-primary">
                <Plus className="h-4 w-4" /> Plan your first trip
              </button>
            }
          />
        )
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.status} aria-labelledby={`trips-${section.status}`} className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 id={`trips-${section.status}`} className="text-lg font-bold text-foreground">
                  {section.title}
                </h2>
                <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">
                  {section.items.length}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:inline">{section.hint}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {section.items.map((trip) => (
                  <TripCard key={trip._id} trip={trip} today={today} />
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
