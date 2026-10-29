"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, Inbox, Search } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { formatBaseCurrency, formatCurrency } from "@/lib/currency";
import { dayKey } from "@/lib/trip";
import type { ExpenseListItem } from "@/types/expense";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";

interface AddExistingExpensesModalProps {
  tripId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called after the expenses were moved into the trip, with how many. */
  onAdded: (count: number) => void;
}

function Checkbox({ checked, partial = false }: { checked: boolean; partial?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
        checked || partial ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong bg-surface"
      )}
    >
      {checked ? <Check className="h-3 w-3" /> : partial ? <span className="h-0.5 w-2 rounded bg-white" /> : null}
    </span>
  );
}

export default function AddExistingExpensesModal({ tripId, isOpen, onClose, onAdded }: AddExistingExpensesModalProps) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<ExpenseListItem[]>([]);
  // Kept as a map so a selection survives changing the search.
  const [selected, setSelected] = useState<Map<string, ExpenseListItem>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start clean each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setSearchInput("");
    setSearch("");
    setSelected(new Map());
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    api
      .get(`/api/trips/${tripId}/candidates${query}`)
      .then((data: { expenses?: ExpenseListItem[] }) => {
        if (active) setCandidates(data.expenses || []);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to load expenses");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, tripId, search]);

  const toggle = (expense: ExpenseListItem) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(expense._id)) next.delete(expense._id);
      else next.set(expense._id, expense);
      return next;
    });
  };

  const visibleSelected = candidates.filter((e) => selected.has(e._id)).length;
  const allSelected = candidates.length > 0 && visibleSelected === candidates.length;

  const toggleAll = () => {
    setSelected((current) => {
      const next = new Map(current);
      if (allSelected) candidates.forEach((e) => next.delete(e._id));
      else candidates.forEach((e) => next.set(e._id, e));
      return next;
    });
  };

  const selectedTotal = [...selected.values()].reduce((sum, e) => sum + (e.amountInBaseCurrency ?? e.amount ?? 0), 0);

  const handleAdd = async () => {
    const ids = [...selected.keys()];
    if (ids.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result: { added?: number } = await api.patch(`/api/trips/${tripId}/expenses`, { add: ids });
      onAdded(result.added ?? ids.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add expenses");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add existing expenses" maxWidth="max-w-2xl">
      <p className="-mt-1 mb-3 text-sm text-muted-foreground">
        Expenses not in any trip, dated from two months before to two weeks after this trip.
      </p>
      <label className="relative mb-3 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          aria-label="Search expenses"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search title or description"
          className="input-field pl-9"
        />
      </label>

      {loading && candidates.length === 0 ? (
        <div className="space-y-2" role="status" aria-label="Loading expenses">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <div className="mb-3 rounded-full bg-subtle p-3 text-muted-foreground">
            <Inbox className="h-6 w-6" />
          </div>
          <p className="font-medium text-foreground">No unassigned expenses around these dates</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {search ? "Try a different search." : "Anything already in a trip, or far from these dates, isn't listed."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <button
            type="button"
            onClick={toggleAll}
            className="flex w-full items-center gap-3 border-b border-line bg-subtle/50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-subtle"
            aria-pressed={allSelected}
          >
            <Checkbox checked={allSelected} partial={visibleSelected > 0 && !allSelected} />
            Select all ({candidates.length})
            {loading && <Spinner size="sm" className="ml-auto" />}
          </button>
          <ul className="max-h-[min(50vh,24rem)] divide-y divide-line overflow-y-auto">
            {candidates.map((expense) => {
              const isSelected = selected.has(expense._id);
              const code = expense.currency?.code || "INR";
              return (
                <li key={expense._id}>
                  <label
                    className={clsx(
                      "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle/50 has-[:focus-visible]:bg-subtle has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-brand-500",
                      isSelected && "bg-brand-50/60 dark:bg-brand-500/10"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={isSelected}
                      onChange={() => toggle(expense)}
                      aria-label={expense.title}
                    />
                    <Checkbox checked={isSelected} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{expense.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {format(parseISO(dayKey(expense.date)), "d MMM yyyy")}
                        {expense.createdBy?.name ? ` · ${expense.createdBy.name}` : ""}
                        {expense.category?.name ? ` · ${expense.category.name}` : ""}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(expense.amount, code)}
                      </p>
                      {code !== "INR" && expense.amountInBaseCurrency != null && (
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {formatBaseCurrency(expense.amountInBaseCurrency)}
                        </p>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="-mx-6 mt-4 flex flex-col-reverse gap-2 border-t border-line px-6 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-center text-xs text-muted-foreground sm:text-left">
          {selected.size > 0 ? (
            <>
              {selected.size} selected · <span className="tabular-nums">{formatBaseCurrency(selectedTotal)}</span>
            </>
          ) : (
            "Pick the expenses that belong to this trip"
          )}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleAdd} className="btn-primary" disabled={selected.size === 0 || saving}>
            {saving ? (
              <>
                <Spinner size="sm" /> Adding...
              </>
            ) : selected.size > 0 ? (
              `Add ${selected.size} to trip`
            ) : (
              "Add to trip"
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
