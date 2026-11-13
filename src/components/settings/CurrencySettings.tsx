"use client";

import { useState } from "react";
import { Coins, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Panel from "@/components/ui/Panel";
import Badge from "@/components/ui/Badge";
import Button, { IconButton } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Field, { inputClass } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { rowClass } from "@/components/ui/styles";
import ConfirmDialog, { DialogActions } from "@/components/org/ConfirmDialog";
import { settingsSectionClass } from "@/components/settings/SettingsNav";

export interface CurrencyRecord {
  _id: string;
  code: string;
  name: string;
  symbol: string;
  rateToBase: number;
  isBase: boolean;
  isActive: boolean;
}

interface CurrencySettingsProps {
  id: string;
  currencies: CurrencyRecord[];
  /** Reloads the page data after a change. */
  onChanged: () => Promise<void>;
}

const EMPTY_FORM = { code: "", name: "", symbol: "", rateToBase: "" };

function formatRate(rate: number) {
  return rate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** Supported currencies and their rate to INR: add, edit rate, delete. */
export default function CurrencySettings({ id, currencies, onChanged }: CurrencySettingsProps) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editRateTarget, setEditRateTarget] = useState<CurrencyRecord | null>(null);
  const [editRateValue, setEditRateValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CurrencyRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Runs a mutation with the shared busy flag, toasts, then reloads. */
  const run = async (action: () => Promise<unknown>, success: string, failure: string, done: () => void) => {
    setSubmitting(true);
    try {
      await action();
      toast(success);
      done();
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : failure, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name || !form.symbol || !form.rateToBase) return;
    return run(
      () =>
        api.post("/api/currencies", {
          code: form.code,
          name: form.name,
          symbol: form.symbol,
          rateToBase: parseFloat(form.rateToBase),
        }),
      "Currency added",
      "Failed to add currency",
      () => {
        setForm(EMPTY_FORM);
        setShowForm(false);
      }
    );
  };

  const handleUpdateRate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRateTarget || !editRateValue) return;
    return run(
      () => api.put(`/api/currencies/${editRateTarget._id}`, { rateToBase: parseFloat(editRateValue) }),
      "Exchange rate updated",
      "Failed to update rate",
      () => setEditRateTarget(null)
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    return run(
      () => api.delete(`/api/currencies/${deleteTarget._id}`),
      "Currency deleted",
      "Failed to delete",
      () => setDeleteTarget(null)
    );
  };

  return (
    <Panel
      id={id}
      className={settingsSectionClass}
      title="Currencies & exchange rates"
      meta="Rates convert each expense to INR when it is entered."
      actions={
        <Button
          size="sm"
          icon={Plus}
          onClick={() => {
            setForm(EMPTY_FORM);
            setShowForm(true);
          }}
        >
          Add currency
        </Button>
      }
      flush
    >
      {currencies.length === 0 ? (
        <EmptyState
          icon={<Coins />}
          title="No currencies configured"
          description="Run seed or add one manually."
        />
      ) : (
        <ul className="flex flex-col">
          {currencies.map((curr) => (
            <li
              key={curr._id}
              className={cn(
                rowClass,
                "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2 pl-[clamp(16px,2vw,24px)] pr-2 sm:pr-3"
              )}
            >
              <span className="flex min-w-0 flex-[1_1_200px] items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-sunk text-sm font-semibold text-ink-2"
                >
                  {curr.symbol}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="num font-medium text-ink">{curr.code}</span>
                    {curr.isBase && <Badge tone="accent">Base</Badge>}
                  </span>
                  <span className="ell text-[13px] text-ink-3">{curr.name}</span>
                </span>
              </span>
              {!curr.isBase && (
                <span className="ml-auto flex items-center gap-1">
                  <span className="num mr-2 whitespace-nowrap text-[13px] text-ink-2">
                    1 {curr.code} = {formatRate(curr.rateToBase)} INR
                  </span>
                  <IconButton
                    icon={Pencil}
                    size="sm"
                    aria-label={`Edit rate for ${curr.code}`}
                    onClick={() => {
                      setEditRateTarget(curr);
                      setEditRateValue(curr.rateToBase.toString());
                    }}
                  />
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    aria-label={`Delete ${curr.code}`}
                    onClick={() => setDeleteTarget(curr)}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Add Currency">
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code" hint="3-letter ISO code">
              <input
                type="text"
                required
                maxLength={3}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="USD"
                className={cn(inputClass, "num uppercase")}
                autoFocus
              />
            </Field>
            <Field label="Symbol">
              <input
                type="text"
                required
                maxLength={3}
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="$"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Name">
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="US Dollar"
              className={inputClass}
            />
          </Field>
          <Field label="Exchange rate to INR" hint="How many INR per 1 unit of this currency.">
            <input
              type="number"
              required
              min="0.0001"
              step="any"
              inputMode="decimal"
              value={form.rateToBase}
              onChange={(e) => setForm({ ...form, rateToBase: e.target.value })}
              placeholder="83.50"
              className={cn(inputClass, "num")}
            />
          </Field>
          <DialogActions onCancel={() => setShowForm(false)} confirmLabel="Add Currency" busy={submitting} />
        </form>
      </Modal>

      <Modal isOpen={!!editRateTarget} onClose={() => setEditRateTarget(null)} title="Edit Exchange Rate">
        <form onSubmit={handleUpdateRate} className="flex flex-col gap-4">
          <Field
            label={`1 ${editRateTarget?.code ?? ""} = ? INR`}
            hint="Changing the rate only affects future expenses. Existing expenses keep their original conversion."
          >
            <input
              type="number"
              required
              min="0.0001"
              step="any"
              inputMode="decimal"
              value={editRateValue}
              onChange={(e) => setEditRateValue(e.target.value)}
              className={cn(inputClass, "num")}
              autoFocus
            />
          </Field>
          <DialogActions onCancel={() => setEditRateTarget(null)} confirmLabel="Update Rate" busy={submitting} />
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Currency"
        confirmLabel="Delete"
        busyLabel="Deleting..."
        busy={submitting}
      >
        Are you sure you want to delete{" "}
        <span className="font-medium text-ink">
          {deleteTarget?.code} ({deleteTarget?.name})
        </span>
        ? Currencies with expenses cannot be deleted.
      </ConfirmDialog>
    </Panel>
  );
}
