"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Package } from "lucide-react";
import { api } from "@/lib/api";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { FormSkeleton } from "@/components/ui/Skeleton";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { rowClass } from "@/components/ui/styles";
import {
  newPaymentDraft,
  paymentDraftsToPayload,
  type PayerOption,
  type PaymentDraft,
} from "@/components/expenses/PaymentSourceFields";
import { useTripOptions } from "@/components/expenses/TripFields";
import ExpenseForm from "@/components/expenses/form/ExpenseForm";
import ReceiptPanel from "@/components/expenses/form/ReceiptPanel";
import { FORM_PAD_X } from "@/components/expenses/form/FormFooter";
import {
  LOOKUPS_URL,
  MAX_RECEIPT_SIZE,
  RECEIPT_TOO_LARGE,
  discardUploadedReceipt,
  getSubmitError,
  toExpensePayload,
  useReceiptUpload,
  useUnsavedChangesWarning,
} from "@/components/expenses/form/expense-form";
import { EMPTY_LOOKUPS, emptyExpenseValues, type ExpenseFormValues, type ExpenseLookups } from "@/components/expenses/form/types";
import { formatCurrency } from "@/lib/currency";
import { isTravelType } from "@/lib/trip";

interface StoredPayment {
  paidBy: PayerOption | null;
  amount: number;
  source: PaymentDraft["source"];
}

interface LinkedAsset {
  _id: string;
  assetTag: string;
  name: string;
  allocatedAmount: number;
}

const DEFAULT_RETURN_TO = "/dashboard/expenses";

/** `?returnTo=` if it's a dashboard path; anything else (other sites included) is ignored. */
function readReturnTo(): string | null {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  return value && value.startsWith("/dashboard/") && !value.startsWith("//") ? value : null;
}

function backLabel(returnTo: string): string {
  if (returnTo === DEFAULT_RETURN_TO) return "Back to Expenses";
  return returnTo.startsWith("/dashboard/trips/") ? "Back to Trip" : "Back";
}

/** Payer rows only count while "several people" is chosen, so trying it and switching back isn't a change. */
function effectiveValues(values: ExpenseFormValues) {
  return { ...values, payments: paymentDraftsToPayload(values.paymentSource, values.payments) };
}

/** Company assets bought with this expense, and the way to add more. */
function LinkedAssetsPanel({
  expenseId,
  assets,
  currencyCode,
  canAddMore,
}: {
  expenseId: string;
  assets: LinkedAsset[];
  currencyCode: string;
  canAddMore: boolean;
}) {
  const createHref = `/dashboard/expenses/${expenseId}/assets/new`;
  if (assets.length === 0) {
    return (
      <Panel title="Company assets">
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13px] text-ink-3">
            This expense has no linked assets. Create inventory records without entering the purchase again.
          </p>
          <Button variant="secondary" size="sm" icon={Package} href={createHref}>
            Create assets
          </Button>
        </div>
      </Panel>
    );
  }
  return (
    <Panel
      title="Company assets"
      meta={`${assets.length} linked`}
      flush
      footer={
        canAddMore ? (
          <Button variant="ghost" size="sm" icon={Package} href={createHref} className="-ml-3 text-accent">
            Add more assets from this expense
          </Button>
        ) : undefined
      }
    >
      <p className={cn(FORM_PAD_X, "pb-3 text-[13px] text-ink-3")}>
        The expense amount and GST cannot be reduced below their asset allocations.
      </p>
      <ul>
        {assets.map((asset) => (
          <li key={asset._id}>
            <Link
              href={`/dashboard/assets/${asset._id}`}
              className={cn(rowClass, FORM_PAD_X, "flex min-h-12 items-center justify-between gap-3 py-2")}
            >
              <span className="flex min-w-0 flex-col">
                <span className="ell text-sm font-medium text-ink">{asset.name}</span>
                <span className="num text-xs text-ink-3">{asset.assetTag}</span>
              </span>
              <span className="num whitespace-nowrap text-sm text-ink-2">
                {formatCurrency(asset.allocatedAmount, currencyCode)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function EditExpensePage() {
  useTitle("Edit Expense");
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [lookups, setLookups] = useState<ExpenseLookups>(EMPTY_LOOKUPS);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { upload, uploading: uploadingReceipt } = useReceiptUpload();
  const [linkedAssets, setLinkedAssets] = useState<LinkedAsset[]>([]);
  const [currencyCode, setCurrencyCode] = useState("INR");
  const { trips } = useTripOptions();
  // The stored trip, so it still shows by name if it isn't in `trips`.
  const [storedTrip, setStoredTrip] = useState<{ _id: string; name: string } | null>(null);

  const [form, setForm] = useState<ExpenseFormValues>(() => emptyExpenseValues());
  const [initialForm, setInitialForm] = useState<ExpenseFormValues>(() => emptyExpenseValues());
  const [initialHadReceipt, setInitialHadReceipt] = useState(false);
  // Where Back, Cancel and Save go, e.g. the trip the edit was opened from.
  const [returnTo, setReturnTo] = useState(DEFAULT_RETURN_TO);

  // Read after mount: on client navigation Next updates the URL only once
  // the new page has rendered.
  useEffect(() => {
    const value = readReturnTo();
    if (value) setReturnTo(value);
  }, []);

  const [existingReceipt, setExistingReceipt] = useState<{ key: string; filename: string } | null>(null);
  const [newReceipt, setNewReceipt] = useState<{ file: File; filename: string } | null>(null);

  // Warn before discarding unsaved edits on a full page unload.
  const isDirty =
    JSON.stringify(effectiveValues(form)) !== JSON.stringify(effectiveValues(initialForm)) ||
    newReceipt !== null ||
    (initialHadReceipt && !existingReceipt && !newReceipt);
  useUnsavedChangesWarning(isDirty && !submitting);

  const handleCancel = () => {
    if (isDirty && !window.confirm("Discard your changes to this expense?")) {
      return;
    }
    router.push(returnTo);
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [expData, lookupData] = await Promise.all([api.get(`/api/expenses/${params.id}`), api.get(LOOKUPS_URL)]);

        const exp = expData.expense;
        const storedPayments: StoredPayment[] = exp.paymentSource === "multiple" ? exp.payments || [] : [];
        setLinkedAssets(expData.assets || []);
        setCurrencyCode(exp.currency?.code || "INR");
        const storedTripId: string = (typeof exp.trip === "string" ? exp.trip : exp.trip?._id) || "";
        const loadedForm: ExpenseFormValues = {
          title: exp.title,
          amount: exp.amount.toString(),
          gstAmount: exp.gstAmount != null ? exp.gstAmount.toString() : "",
          currency: exp.currency?._id || "",
          category: exp.category?._id || "",
          department: exp.department?._id || "",
          date: new Date(exp.date).toISOString().split("T")[0],
          description: exp.description || "",
          paymentSource: exp.paymentSource || "pocket",
          pocketAmount:
            exp.paymentSource === "split" && exp.pocketAmount != null ? exp.pocketAmount.toString() : "",
          payments: storedPayments.map((entry) =>
            newPaymentDraft({
              paidBy: entry.paidBy?._id ?? "",
              amount: entry.amount.toString(),
              source: entry.source,
            })
          ),
          trip: storedTripId,
          travelType: storedTripId && isTravelType(exp.travelType) ? exp.travelType : null,
        };
        setStoredTrip(storedTripId ? { _id: storedTripId, name: exp.trip?.name || "Current trip" } : null);
        setForm(loadedForm);
        setInitialForm(loadedForm);

        if (exp.receiptKey) {
          setExistingReceipt({ key: exp.receiptKey, filename: exp.receiptFilename || "Receipt" });
          setInitialHadReceipt(true);
        }

        // Keep current payers selectable even if they no longer appear in the member list.
        const payerOptions = new Map<string, PayerOption>(
          (lookupData.members || []).map((member: PayerOption) => [member._id, member])
        );
        for (const { paidBy } of storedPayments) {
          if (paidBy?._id && !payerOptions.has(paidBy._id)) payerOptions.set(paidBy._id, paidBy);
        }
        setLookups({
          departments: lookupData.departments,
          categories: lookupData.categories,
          currencies: lookupData.currencies,
          members: [...payerOptions.values()],
        });
      } catch {
        toast("Failed to load expense", "error");
        router.push("/dashboard/expenses");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [params.id, toast, router]);

  const handleReceiptFile = (file: File) => {
    if (file.size > MAX_RECEIPT_SIZE) {
      toast(RECEIPT_TOO_LARGE, "error");
      return;
    }
    setNewReceipt({ file, filename: file.name });
    setExistingReceipt(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formError = getSubmitError(form);
    if (formError) {
      toast(formError, "error");
      return;
    }

    setSubmitting(true);
    let uploadedReceiptKey: string | null = null;

    try {
      const updateData: Record<string, unknown> = toExpensePayload(form);

      if (newReceipt?.file) {
        const uploaded = await upload(newReceipt.file);
        uploadedReceiptKey = uploaded.key;
        updateData.receiptKey = uploaded.key;
        updateData.receiptFilename = uploaded.filename;
      } else if (initialHadReceipt && !existingReceipt) {
        updateData.receiptKey = null;
        updateData.receiptFilename = null;
      }

      await api.put(`/api/expenses/${params.id}`, updateData);
      toast("Expense updated");
      router.push(returnTo);
    } catch (err) {
      await discardUploadedReceipt(uploadedReceiptKey);
      toast(err instanceof Error ? err.message : "Failed to update expense", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <FormSkeleton />;
  const hasLinkedAssets = linkedAssets.length > 0;
  const accountingLocked = hasLinkedAssets && !isAdmin;
  const expenseId = String(params.id);

  return (
    <ExpenseForm
      heading="Edit expense"
      backLabel={backLabel(returnTo)}
      onCancel={handleCancel}
      values={form}
      onValuesChange={setForm}
      onTripChange={(trip) => setForm((prev) => ({ ...prev, trip, travelType: trip ? prev.travelType : null }))}
      onTravelTypeChange={(travelType) =>
        setForm((prev) => ({ ...prev, travelType: prev.trip ? travelType : null }))
      }
      lookups={lookups}
      trips={trips}
      currentTrip={storedTrip}
      defaultPayerId={user?._id}
      locked={accountingLocked}
      currencyLocked={hasLinkedAssets}
      receipt={
        <>
          <ReceiptPanel
            file={newReceipt?.file}
            filename={newReceipt?.filename || existingReceipt?.filename || null}
            onFile={handleReceiptFile}
            onRemove={() => {
              setNewReceipt(null);
              setExistingReceipt(null);
            }}
            disabled={accountingLocked}
          />
          <LinkedAssetsPanel
            expenseId={expenseId}
            assets={linkedAssets}
            currencyCode={currencyCode}
            canAddMore={isAdmin}
          />
        </>
      }
      onSubmit={handleSubmit}
      submitLabel="Save changes"
      busy={submitting || uploadingReceipt}
    />
  );
}
