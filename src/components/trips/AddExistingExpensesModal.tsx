"use client";

import { useEffect, useState } from "react";
import { Check, Inbox } from "lucide-react";
import { api } from "@/lib/api";
import { formatBaseCurrency, formatCurrency } from "@/lib/currency";
import type { ExpenseListItem } from "@/types/expense";
import Modal from "@/components/ui/Modal";
import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Field from "@/components/ui/Field";
import SearchInput from "@/components/ui/SearchInput";
import CategoryGlyph from "@/components/ui/CategoryGlyph";
import { cn } from "@/components/ui/cn";
import { focusRing, rowClass, rowSelectedClass, transition } from "@/components/ui/styles";
import { DialogActions } from "@/components/ui/ConfirmDialog";
import { baseAmount, expenseDate } from "@/components/expenses/ledger/format";

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
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        transition,
        checked || partial ? "border-accent bg-accent text-accent-ink" : "border-rule bg-surface"
      )}
    >
      {checked ? <Check size={12} strokeWidth={2.5} /> : partial ? <span className="h-0.5 w-2 rounded bg-accent-ink" /> : null}
    </span>
  );
}

export default function AddExistingExpensesModal({ tripId, isOpen, onClose, onAdded }: AddExistingExpensesModalProps) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<ExpenseListItem[]>([]);
  // More matched than the endpoint returns (it sends the most recent ones).
  const [truncated, setTruncated] = useState(false);
  // Kept as a map so a selection survives changing the search.
  const [selected, setSelected] = useState<Map<string, ExpenseListItem>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the open-reset has applied, so a reopen fetches once, with the
  // cleared search, and never shows the previous list.
  const [ready, setReady] = useState(false);

  // Start clean each time the modal opens.
  useEffect(() => {
    if (!isOpen) {
      setReady(false);
      return;
    }
    setSearchInput("");
    setSearch("");
    setCandidates([]);
    setTruncated(false);
    setSelected(new Map());
    setError(null);
    setLoading(true);
    setReady(true);
  }, [isOpen]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (!isOpen || !ready) return;
    let active = true;
    setLoading(true);
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    api
      .get(`/api/trips/${tripId}/candidates${query}`)
      .then((data: { expenses?: ExpenseListItem[]; truncated?: boolean }) => {
        if (!active) return;
        setCandidates(data.expenses || []);
        setTruncated(Boolean(data.truncated));
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
  }, [isOpen, ready, tripId, search]);

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

  const selectedTotal = [...selected.values()].reduce((sum, e) => sum + baseAmount(e), 0);

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
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-3">
          Expenses not in any trip, dated from two months before to two weeks after this trip.
        </p>
        <Field label="Search expenses">
          <SearchInput value={searchInput} onValueChange={setSearchInput} placeholder="Title or description" />
        </Field>

        {!ready || (loading && candidates.length === 0) ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading expenses">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title="No unassigned expenses around these dates"
            description={search ? "Try a different search." : "Anything already in a trip, or far from these dates, isn't listed."}
          />
        ) : (
          <div className="overflow-hidden rounded-panel border border-rule">
            <button
              type="button"
              onClick={toggleAll}
              className={cn(
                "cap flex min-h-11 w-full cursor-pointer items-center gap-3 bg-sunk px-4 text-left text-ink-3 hover:bg-tint-2",
                transition,
                focusRing
              )}
              aria-pressed={allSelected}
            >
              <Checkbox checked={allSelected} partial={visibleSelected > 0 && !allSelected} />
              {truncated ? "Select all shown" : "Select all"} ({candidates.length})
              {loading && <Spinner size="sm" className="ml-auto" />}
            </button>
            <ul className="max-h-[min(50vh,24rem)] overflow-y-auto">
              {candidates.map((expense) => {
                const isSelected = selected.has(expense._id);
                const code = expense.currency?.code || "INR";
                const foreign = Boolean(expense.currency && !expense.currency.isBase);
                return (
                  <li key={expense._id}>
                    <label
                      className={cn(
                        "flex min-h-[58px] cursor-pointer items-center gap-3 px-4 py-2",
                        rowClass,
                        "has-[:focus-visible]:shadow-[inset_0_0_0_2px_rgb(var(--accent))]",
                        isSelected && rowSelectedClass
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
                      <CategoryGlyph name={expense.category?.name} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="ell font-medium text-ink">{expense.title}</span>
                        <span className="ell text-xs text-ink-3">
                          {expenseDate(expense, "d MMM yyyy")}
                          {expense.createdBy?.name ? ` · ${expense.createdBy.name}` : ""}
                          {expense.category?.name ? ` · ${expense.category.name}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className="num font-medium text-ink">{formatCurrency(expense.amount, code)}</span>
                        {foreign && expense.amountInBaseCurrency != null && (
                          <span className="num text-xs text-ink-3">{formatBaseCurrency(expense.amountInBaseCurrency)}</span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {truncated && (
              <p className="border-t border-rule bg-sunk px-4 py-2 text-xs text-ink-3">
                Showing the {candidates.length} most recent — search to narrow it down.
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <DialogActions
          onCancel={onClose}
          onConfirm={handleAdd}
          disabled={selected.size === 0}
          confirmLabel={selected.size > 0 ? `Add ${selected.size} to trip` : "Add to trip"}
          busyLabel="Adding..."
          busy={saving}
        >
          <p className="text-center text-xs text-ink-3 sm:mr-auto sm:text-left">
            {selected.size > 0 ? (
              <>
                {selected.size} selected · <span className="num">{formatBaseCurrency(selectedTotal)}</span>
              </>
            ) : (
              "Pick the expenses that belong to this trip"
            )}
          </p>
        </DialogActions>
      </div>
    </Modal>
  );
}
