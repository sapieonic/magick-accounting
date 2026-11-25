"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { CircleAlert, Package } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { FormSkeleton } from "@/components/ui/Skeleton";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import Panel from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE, panelPadX, rowClass, textButtonClass } from "@/components/ui/styles";
import {
  newPaymentDraft,
  paymentDraftsToPayload,
  type PayerOption,
  type PaymentDraft,
} from "@/components/expenses/PaymentSourceFields";
import { useTripOptions } from "@/components/expenses/TripFields";
import ExpenseForm from "@/components/expenses/form/ExpenseForm";
import ReceiptPanel from "@/components/expenses/form/ReceiptPanel";
import {
  ApprovalHistorySection,
  EditApprovalNotice,
  type EditApprovalState,
} from "@/components/expenses/form/ApprovalFormParts";
import { personName } from "@/components/approvals/approval-format";
import {
  LOOKUPS_URL,
  MAX_RECEIPT_SIZE,
  accountingFieldsChanged,
  RECEIPT_TOO_LARGE,
  discardUploadedReceipt,
  getSubmitError,
  listFields,
  mergeAfterConflict,
  toExpensePayload,
  useReceiptUpload,
  useUnsavedChangesWarning,
} from "@/components/expenses/form/expense-form";
import {
  EMPTY_LOOKUPS,
  emptyExpenseValues,
  type CurrencyOption,
  type ExpenseFormValues,
  type ExpenseLookups,
} from "@/components/expenses/form/types";
import { effectiveApprovalStatus, statusAfterEdit, type ApprovalStatus } from "@/lib/approval";
import { formatCurrency } from "@/lib/currency";
import { storedRateToBase } from "@/lib/expense";
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

const RESUBMITTED = "Resubmitted. An admin will review it again.";
const NOT_SAVED_YET = "Your changes aren't saved yet: review them and save again.";

/**
 * The toast after a save: what happened to the expense's approval, in plain
 * words. `after` is the status the server stored (its answer), `before` the
 * one the form was editing.
 */
function savedMessage(before: ApprovalStatus, after: ApprovalStatus, isReviewer: boolean) {
  // Admin edits never change the status.
  if (isReviewer) return "Expense updated";
  if (after === "pending") {
    if (before === "rejected") return RESUBMITTED;
    if (before === "pending") return "Changes saved. It's still awaiting approval.";
    return "Saved and sent back for approval. An admin will review your changes.";
  }
  if (after === "rejected") return "Changes saved. It's still rejected, so resubmit it when it's ready.";
  return "Expense updated";
}

/** Why a save was refused because the expense changed meanwhile, from what it changed to. */
function conflictMessage(before: ApprovalStatus, after: ApprovalStatus): string {
  if (after !== before) {
    if (after === "approved") return `An admin approved this while you were editing. ${NOT_SAVED_YET}`;
    if (after === "rejected") return `An admin rejected this while you were editing. ${NOT_SAVED_YET}`;
    return `This expense was sent back for review while you were editing. ${NOT_SAVED_YET}`;
  }
  return `Someone else saved this expense while you were editing. ${NOT_SAVED_YET}`;
}

/**
 * After a conflict: the fields the person changed that someone else also
 * changed, differently. Their value is kept, so this asks them to check it.
 */
function overlapMessage(fields: string[]): string {
  const one = fields.length === 1;
  return `${listFields(fields)} ${one ? "was" : "were"} also changed by someone else — check ${one ? "it" : "them"} before saving.`;
}

const errorCode = (err: unknown) => (err instanceof ApiError ? err.code : undefined);

/** The approval facts the form shows, read off `GET /api/expenses/[id]`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function approvalState(exp: any): EditApprovalState {
  const history: EditApprovalState["history"] = Array.isArray(exp.approvalHistory) ? exp.approvalHistory : [];
  const lastRejection = [...history].reverse().find((entry) => entry.action === "rejected");
  return {
    status: effectiveApprovalStatus(exp),
    reviewer: exp.reviewedBy || lastRejection ? personName(exp.reviewedBy ?? lastRejection?.by, "an admin") : null,
    reviewedAt: exp.reviewedAt ?? lastRejection?.at ?? null,
    reason: exp.rejectionReason ?? lastRejection?.note ?? null,
    history,
    submitterName: personName(exp.createdBy, "The submitter"),
  };
}

/** The form's values for a stored expense. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formValuesOf(exp: any): ExpenseFormValues {
  const storedPayments: StoredPayment[] = exp.paymentSource === "multiple" ? exp.payments || [] : [];
  const storedTripId: string = (typeof exp.trip === "string" ? exp.trip : exp.trip?._id) || "";
  return {
    title: exp.title,
    amount: exp.amount.toString(),
    gstAmount: exp.gstAmount != null ? exp.gstAmount.toString() : "",
    currency: exp.currency?._id || "",
    category: exp.category?._id || "",
    department: exp.department?._id || "",
    date: new Date(exp.date).toISOString().split("T")[0],
    description: exp.description || "",
    paymentSource: exp.paymentSource || "pocket",
    pocketAmount: exp.paymentSource === "split" && exp.pocketAmount != null ? exp.pocketAmount.toString() : "",
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
}

/**
 * `lookups` with the expense's own currency and payers added when the lists
 * no longer offer them (deactivated, or no longer a member), so they stay selectable.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withStoredOptions(lookups: ExpenseLookups, exp: any): ExpenseLookups {
  const storedPayments: StoredPayment[] = exp.paymentSource === "multiple" ? exp.payments || [] : [];
  const payerOptions = new Map<string, PayerOption>(lookups.members.map((member) => [member._id, member]));
  for (const { paidBy } of storedPayments) {
    if (paidBy?._id && !payerOptions.has(paidBy._id)) payerOptions.set(paidBy._id, paidBy);
  }
  const currencies: CurrencyOption[] = [...lookups.currencies];
  const storedCurrency: CurrencyOption | undefined = exp.currency?._id ? exp.currency : undefined;
  if (storedCurrency && !currencies.some((c) => c._id === storedCurrency._id)) {
    currencies.push(storedCurrency);
  }
  return { ...lookups, currencies, members: [...payerOptions.values()] };
}

/** Company assets bought with this expense, and the way to add more. */
function LinkedAssetsPanel({
  expenseId,
  assets,
  currencyCode,
  canAddMore,
  awaitingApprovalNote,
}: {
  expenseId: string;
  assets: LinkedAsset[];
  currencyCode: string;
  canAddMore: boolean;
  /** Set while the expense isn't approved: assets can't be registered yet, and this says why. */
  awaitingApprovalNote?: string;
}) {
  const createHref = `/dashboard/expenses/${expenseId}/assets/new`;
  if (assets.length === 0 && awaitingApprovalNote) {
    return (
      <Panel title="Company assets">
        <p className="text-[13px] text-ink-3 [text-wrap:pretty]">{awaitingApprovalNote}</p>
      </Panel>
    );
  }
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
      description="The expense amount and GST cannot be reduced below their asset allocations."
      flush
      footer={
        canAddMore ? (
          <Link href={createHref} className={textButtonClass}>
            <Package aria-hidden="true" size={16} strokeWidth={ICON_STROKE} />
            Add more assets from this expense
          </Link>
        ) : undefined
      }
    >
      <ul>
        {assets.map((asset) => (
          <li key={asset._id}>
            <Link
              href={`/dashboard/assets/${asset._id}`}
              className={cn(rowClass, panelPadX, "flex min-h-12 items-center justify-between gap-3 py-2")}
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
  useTitle("Edit expense");
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
  // The saved conversion, kept by the server while the currency is unchanged.
  const [savedRate, setSavedRate] = useState<{ currencyId: string; rateToBase: number } | null>(null);
  const [submitter, setSubmitter] = useState<{ _id: string; name?: string; email?: string } | null>(null);
  const [approval, setApproval] = useState<EditApprovalState | null>(null);
  // The expense's edit revision as loaded: sent with the save, so a review
  // (or another save) since then is a conflict rather than silently overwritten.
  const [revision, setRevision] = useState(0);

  const [form, setForm] = useState<ExpenseFormValues>(() => emptyExpenseValues());
  const [initialForm, setInitialForm] = useState<ExpenseFormValues>(() => emptyExpenseValues());
  // The stored receipt the edit started from (null: none).
  const [storedReceiptKey, setStoredReceiptKey] = useState<string | null>(null);
  const initialHadReceipt = storedReceiptKey !== null;
  // After a conflict: fields the person changed that someone else changed too (their value is kept).
  const [overlaps, setOverlaps] = useState<string[]>([]);
  // The latest values, for merging them with a re-read after a conflict.
  const formRef = useRef(form);
  formRef.current = form;
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
  const receiptChanged = newReceipt !== null || (initialHadReceipt && !existingReceipt);
  const isDirty =
    JSON.stringify(effectiveValues(form)) !== JSON.stringify(effectiveValues(initialForm)) || receiptChanged;
  // Mirrors the server: these edits send a submitter's approved expense back for approval.
  const accountingChanged = accountingFieldsChanged(initialForm, form, receiptChanged);
  // A submitter's rejected expense with nothing changed: "Resubmit" sends it back as it is.
  const resubmitAsIs = !isAdmin && approval?.status === "rejected" && !isDirty;
  useUnsavedChangesWarning(isDirty && !submitting);

  const handleCancel = () => {
    if (isDirty && !window.confirm("Discard your changes to this expense?")) {
      return;
    }
    router.push(returnTo);
  };

  /**
   * Everything the page keeps about the stored expense besides the form's
   * values: approval, revision, linked assets, the saved conversion, the
   * stored trip's name, and its currency and payers kept selectable.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyStored = (exp: any, assets: LinkedAsset[] | undefined) => {
    setLinkedAssets(assets || []);
    setSubmitter(exp.createdBy?._id ? exp.createdBy : null);
    setApproval(approvalState(exp));
    setRevision(exp.assetAllocationRevision ?? 0);
    setCurrencyCode(exp.currency?.code || "INR");
    const storedTripId: string = (typeof exp.trip === "string" ? exp.trip : exp.trip?._id) || "";
    setStoredTrip(storedTripId ? { _id: storedTripId, name: exp.trip?.name || "Current trip" } : null);
    const rate = storedRateToBase(exp);
    setSavedRate(exp.currency?._id && rate ? { currencyId: exp.currency._id, rateToBase: rate } : null);
    setStoredReceiptKey(exp.receiptKey || null);
    setLookups((prev) => withStoredOptions(prev, exp));
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [expData, lookupData] = await Promise.all([api.get(`/api/expenses/${params.id}`), api.get(LOOKUPS_URL)]);

        const exp = expData.expense;
        // The lists first: `applyStored` adds the expense's own currency and payers to them.
        setLookups({
          departments: lookupData.departments,
          categories: lookupData.categories,
          currencies: lookupData.currencies || [],
          members: lookupData.members || [],
        });
        applyStored(exp, expData.assets);
        const loadedForm = formValuesOf(exp);
        setForm(loadedForm);
        setInitialForm(loadedForm);
        if (exp.receiptKey) {
          setExistingReceipt({ key: exp.receiptKey, filename: exp.receiptFilename || "Receipt" });
        }
      } catch {
        toast("Failed to load expense", "error");
        router.push("/dashboard/expenses");
      } finally {
        setLoading(false);
      }
    }
    loadData();
    // `applyStored` only calls state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, toast, router]);

  const handleReceiptFile = (file: File) => {
    if (file.size > MAX_RECEIPT_SIZE) {
      toast(RECEIPT_TOO_LARGE, "error");
      return;
    }
    setNewReceipt({ file, filename: file.name });
    setExistingReceipt(null);
  };

  /**
   * After a 409: reads the expense again and makes it the form's baseline
   * (status, reason, history, revision, saved rate, trip, receipt), so the
   * Notice and the submit button describe what saving will do now. The form
   * is merged three ways: a field the person didn't touch takes the saved
   * value (someone else's fix isn't overwritten on the next save), one they
   * changed keeps theirs; one both changed keeps theirs and is listed in
   * `overlaps`. Returns the status it is in now and those overlaps, or null
   * if it couldn't be read.
   */
  const refreshAfterConflict = async (): Promise<{ status: ApprovalStatus; overlaps: string[] } | null> => {
    try {
      const data = await api.get(`/api/expenses/${params.id}`);
      const exp = data?.expense;
      if (!exp) return null;
      const fresh = formValuesOf(exp);
      // `initialForm` is still the version this edit started from: only this re-read replaces it.
      const merged = mergeAfterConflict(initialForm, formRef.current, fresh);
      const freshReceiptKey: string | null = exp.receiptKey || null;
      if (receiptChanged) {
        // Keep the person's new or removed receipt; flag it if the stored one changed meanwhile too.
        const removedOnBothSides = !newReceipt && freshReceiptKey === null;
        if (freshReceiptKey !== storedReceiptKey && !removedOnBothSides) merged.overlaps.push("Receipt");
      } else {
        setExistingReceipt(freshReceiptKey ? { key: freshReceiptKey, filename: exp.receiptFilename || "Receipt" } : null);
      }
      applyStored(exp, data.assets);
      setInitialForm(fresh);
      setForm(merged.values);
      setOverlaps(merged.overlaps);
      return { status: effectiveApprovalStatus(exp), overlaps: merged.overlaps };
    } catch {
      return null;
    }
  };

  /** A save or resubmit that the server refused. */
  const handleSaveError = async (err: unknown, fallback: string) => {
    const before = approval?.status ?? "approved";
    const code = errorCode(err);
    if (code === "stale" || code === "not_rejected") {
      const refreshed = await refreshAfterConflict();
      if (refreshed === null) {
        toast(err instanceof Error ? err.message : fallback, "error");
        return;
      }
      const conflict = conflictMessage(before, refreshed.status);
      const overlap = refreshed.overlaps.length > 0 ? ` ${overlapMessage(refreshed.overlaps)}` : "";
      if (code === "not_rejected") {
        toast(`This expense isn't rejected any more, so there's nothing to resubmit. ${conflict}${overlap}`, "error");
      } else {
        toast(`${conflict}${overlap}`, "error");
      }
      return;
    }
    toast(err instanceof Error ? err.message : fallback, "error");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // A submitter's rejected expense, unchanged: send it back as it is.
    if (resubmitAsIs) {
      setSubmitting(true);
      try {
        await api.post(`/api/expenses/${params.id}/approval`, { action: "resubmit", revision });
        toast(RESUBMITTED);
        router.push(returnTo);
      } catch (err) {
        await handleSaveError(err, "Couldn't resubmit. Check your connection and try again.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const formError = getSubmitError(form);
    if (formError) {
      toast(formError, "error");
      return;
    }

    setSubmitting(true);
    let uploadedReceiptKey: string | null = null;
    const before = approval?.status ?? "approved";

    try {
      const updateData: Record<string, unknown> = { ...toExpensePayload(form), revision };

      if (newReceipt?.file) {
        const uploaded = await upload(newReceipt.file);
        uploadedReceiptKey = uploaded.key;
        updateData.receiptKey = uploaded.key;
        updateData.receiptFilename = uploaded.filename;
      } else if (initialHadReceipt && !existingReceipt) {
        updateData.receiptKey = null;
        updateData.receiptFilename = null;
      }

      const result: { expense?: { approvalStatus?: ApprovalStatus | null } } | undefined = await api.put(
        `/api/expenses/${params.id}`,
        updateData
      );
      // The server's answer decides the message; predict it only if it didn't say.
      const after = result?.expense
        ? effectiveApprovalStatus(result.expense)
        : statusAfterEdit({
            role: user?.role ?? (isAdmin ? "admin" : "user"),
            isOwner: !submitter || submitter._id === user?._id,
            current: before,
            accountingChanged,
          }) ?? before;
      toast(savedMessage(before, after, isAdmin));
      router.push(returnTo);
    } catch (err) {
      await discardUploadedReceipt(uploadedReceiptKey);
      await handleSaveError(err, "Failed to update expense");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <FormSkeleton />;
  const hasLinkedAssets = linkedAssets.length > 0;
  const accountingLocked = hasLinkedAssets && !isAdmin;
  const expenseId = String(params.id);
  // Pocket shares are credited to the submitter, who isn't "you" when an admin edits someone else's expense.
  const submitterName =
    submitter && submitter._id !== user?._id ? submitter.name || submitter.email || "the submitter" : undefined;
  const status = approval?.status ?? "approved";
  // A submitter's save that will put the expense (back) in the approval queue.
  const resubmits = !isAdmin && (status === "rejected" || (status === "approved" && accountingChanged));
  const submitLabel = isAdmin
    ? "Save changes"
    : status === "rejected"
      ? "Resubmit for approval"
      : resubmits
        ? "Save & resubmit"
        : "Save changes";

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
      savedRate={savedRate}
      submitterName={submitterName}
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
            awaitingApprovalNote={
              status === "approved"
                ? undefined
                : isAdmin
                  ? "Approve this expense first, then create its assets."
                  : "You can register assets for this purchase once it's approved."
            }
          />
        </>
      }
      onSubmit={handleSubmit}
      submitLabel={submitLabel}
      busyLabel={resubmits ? "Resubmitting…" : "Saving…"}
      busy={submitting || uploadingReceipt}
      notice={
        <>
          {overlaps.length > 0 && (
            <Notice icon={CircleAlert} title="Also changed by someone else">
              {overlapMessage(overlaps)} The form keeps what you entered; everything else shows the saved version.
            </Notice>
          )}
          {approval && (
            <EditApprovalNotice
              approval={approval}
              isReviewer={isAdmin}
              ownExpense={isAdmin && Boolean(submitter && user && submitter._id === user._id)}
              accountingLocked={accountingLocked}
            />
          )}
        </>
      }
      footerNote={
        resubmits
          ? status === "rejected"
            ? resubmitAsIs
              ? "You haven't changed anything, so this sends it back as it is. If the reason above asks for a fix, make it first."
              : "Saving resubmits this expense. An admin will review it again before it counts in company totals."
            : "You changed an accounting detail, so saving sends this expense back to an admin. It won't count in company totals until it's approved again."
          : undefined
      }
      extraSections={approval && <ApprovalHistorySection history={approval.history} />}
    />
  );
}
