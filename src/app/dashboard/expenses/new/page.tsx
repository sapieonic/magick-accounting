"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { moneyToCents } from "@/lib/asset";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { FormSkeleton } from "@/components/ui/Skeleton";
import AssetPurchaseSection, { AssetDraft } from "@/components/assets/AssetPurchaseSection";
import { categoryForTravelType, useTripOptions } from "@/components/expenses/TripFields";
import ExpenseForm from "@/components/expenses/form/ExpenseForm";
import ReceiptPanel, { ReceiptReadStatus } from "@/components/expenses/form/ReceiptPanel";
import ReceiptUploadModal, { shouldOfferUploadModal } from "@/components/expenses/form/ReceiptUploadModal";
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
import {
  EMPTY_LOOKUPS,
  emptyExpenseValues,
  type AiField,
  type CurrencyOption,
  type Department,
  type ExpenseFormValues,
  type ExpenseLookups,
} from "@/components/expenses/form/types";
import { dayKey, isWithinTrip, type TravelType } from "@/lib/trip";

interface UserOption {
  _id: string;
  name: string;
  email: string;
}

// File types the AI auto-fill can read (images + PDF).
const EXTRACTABLE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Form fields an extraction result fills, in the order they're checked. */
function filledFields(data: Record<string, unknown>): Set<AiField> {
  const fields = new Set<AiField>();
  if (data.title) fields.add("title");
  if (data.amount != null) fields.add("amount");
  if (data.gstAmount != null) fields.add("gstAmount");
  if (data.date) fields.add("date");
  if (data.description) fields.add("description");
  if (data.category) fields.add("category");
  if (data.currency) fields.add("currency");
  return fields;
}

export default function NewExpensePage() {
  useTitle("New expense");
  const router = useRouter();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [lookups, setLookups] = useState<ExpenseLookups>(EMPTY_LOOKUPS);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [assets, setAssets] = useState<AssetDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { upload, uploading: uploadingReceipt } = useReceiptUpload();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [extracting, setExtracting] = useState(false);
  // Fields the last receipt read filled in and the user hasn't edited since
  // (null: no read yet / receipt removed).
  const [aiFilled, setAiFilled] = useState<Set<AiField> | null>(null);
  // How many fields that read filled in; unlike the marks, edits don't change it.
  const [readCount, setReadCount] = useState<number | null>(null);
  const [extractFailed, setExtractFailed] = useState(false);

  const { trips, loaded: tripsLoaded } = useTripOptions();
  // `?trip=<id>`: the trip page's "Add expense" opens the form inside that trip
  // and gets the user back to it afterwards.
  // Read after mount: on a client-side navigation Next updates the URL only
  // once the new page has rendered, so a render-time read sees the old URL.
  const [prefillTripId, setPrefillTripId] = useState("");
  const [urlRead, setUrlRead] = useState(false);
  useEffect(() => {
    setPrefillTripId(new URLSearchParams(window.location.search).get("trip") ?? "");
    setUrlRead(true);
  }, []);
  const [openedFromTrip, setOpenedFromTrip] = useState("");
  const [prefillDone, setPrefillDone] = useState(false);
  // A category or department the user (or the receipt) chose is never
  // overwritten by trip/travel-type defaults.
  const [categoryPinned, setCategoryPinned] = useState(false);
  const [departmentPinned, setDepartmentPinned] = useState(false);
  // Travel type read from a receipt before any trip was picked.
  const [pendingTravelType, setPendingTravelType] = useState<TravelType | null>(null);

  // Open the AI-upload modal on arrival unless the user opted out earlier.
  useEffect(() => {
    if (shouldOfferUploadModal()) setShowUploadModal(true);
  }, []);

  const [form, setForm] = useState<ExpenseFormValues>(() =>
    emptyExpenseValues(new Date().toISOString().split("T")[0])
  );

  const [receipt, setReceipt] = useState<{ file: File; filename: string } | null>(null);

  // Warn before discarding typed-in or extracted data on a full page unload.
  const isDirty = Boolean(
    form.title ||
      form.amount ||
      form.description ||
      form.category !== "" ||
      form.pocketAmount ||
      form.payments.some(
        (entry) =>
          entry.amount !== "" || entry.source !== "pocket" || (entry.paidBy && entry.paidBy !== user?._id)
      ) ||
      receipt ||
      assets.length > 0 ||
      form.trip !== openedFromTrip ||
      form.travelType !== null
  );
  useUnsavedChangesWarning(isDirty && !submitting);

  const backHref = openedFromTrip ? `/dashboard/trips/${openedFromTrip}` : "/dashboard/expenses";

  const handleCancel = () => {
    if (isDirty && !window.confirm("Discard this expense? Your changes will be lost.")) {
      return;
    }
    router.push(backHref);
  };

  /** A direct edit drops the field's "from receipt" mark and pins category/department. */
  const handleEdit = (field: keyof ExpenseFormValues) => {
    if (field === "category") setCategoryPinned(true);
    if (field === "department") setDepartmentPinned(true);
    setAiFilled((prev) => {
      if (!prev?.has(field as AiField)) return prev;
      const next = new Set(prev);
      next.delete(field as AiField);
      return next;
    });
  };

  /** Form changes for a travel type: the type plus, unless pinned, its category. */
  const travelTypeFields = (travelType: TravelType | null) => {
    const category = categoryPinned ? null : categoryForTravelType(travelType, lookups.categories);
    return category ? { travelType, category: category._id } : { travelType };
  };

  const handleTravelTypeChange = (travelType: TravelType | null) => {
    setPendingTravelType(null);
    setForm((prev) => ({ ...prev, ...travelTypeFields(prev.trip ? travelType : null) }));
  };

  const handleTripChange = (tripId: string) => {
    const trip = trips.find((t) => t._id === tripId);
    const tripDepartment =
      trip?.department && lookups.departments.some((d) => d._id === trip.department?._id)
        ? trip.department._id
        : null;
    setForm((prev) => {
      if (!tripId) return { ...prev, trip: "", travelType: null };
      return {
        ...prev,
        trip: tripId,
        ...(tripDepartment && !departmentPinned ? { department: tripDepartment } : {}),
        ...(!prev.travelType && pendingTravelType ? travelTypeFields(pendingTravelType) : {}),
      };
    });
    if (tripId && pendingTravelType) setPendingTravelType(null);
  };

  const handlePurchaseDateChange = (date: string) => {
    const previousDate = form.date;
    setForm((current) => ({ ...current, date }));
    setAssets((current) =>
      current.map((asset) => (asset.putToUseDate === previousDate ? { ...asset, putToUseDate: date } : asset))
    );
  };

  useEffect(() => {
    async function loadOptions() {
      try {
        const data = await api.get(LOOKUPS_URL);
        setLookups({
          departments: data.departments,
          categories: data.categories,
          currencies: data.currencies,
          members: data.members || [],
        });

        const defaultDept = data.departments.find((d: Department) => d.isDefault);
        const baseCurrency = data.currencies.find((c: CurrencyOption) => c.isBase);
        setForm((prev) => ({
          ...prev,
          department: defaultDept ? defaultDept._id : prev.department,
          currency: baseCurrency ? baseCurrency._id : prev.currency,
        }));
      } catch {
        toast("Failed to load form options", "error");
      } finally {
        setLoading(false);
      }
    }
    loadOptions();
  }, [toast]);

  // Applies `?trip=<id>` once the trips and form options are in.
  useEffect(() => {
    if (!prefillTripId || prefillDone || loading || !tripsLoaded) return;
    setPrefillDone(true);
    const trip = trips.find((t) => t._id === prefillTripId);
    if (!trip) {
      toast("That trip isn't available, so the expense isn't linked to it.", "info");
      return;
    }
    setOpenedFromTrip(trip._id);
    setForm((prev) => ({
      ...prev,
      trip: trip._id,
      department:
        (!prev.department || !departmentPinned) &&
        trip.department &&
        lookups.departments.some((d) => d._id === trip.department?._id)
          ? trip.department._id
          : prev.department,
      date: isWithinTrip(prev.date, trip) ? prev.date : dayKey(trip.startDate),
    }));
  }, [prefillTripId, prefillDone, loading, tripsLoaded, trips, lookups.departments, departmentPinned, toast]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/api/users")
      .then((data) => setUsers(data.users || []))
      .catch(() => toast("Users could not be loaded; assets can still be left unassigned", "info"));
  }, [isAdmin, toast]);

  // Attaches a receipt file and, for images and PDFs, asks the AI to pre-fill the form.
  const processReceiptFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_RECEIPT_SIZE) {
        toast(RECEIPT_TOO_LARGE, "error");
        return;
      }

      setReceipt({ file, filename: file.name });
      setAiFilled(null);
      setReadCount(null);
      setExtractFailed(false);

      if (!EXTRACTABLE_TYPES.includes(file.type)) {
        setShowUploadModal(false);
        toast("Receipt attached. AI auto-fill supports image and PDF receipts.", "info");
        return;
      }

      setExtracting(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const data = await api.postFormData("/api/expenses/extract", formData);
        if (data.category) setCategoryPinned(true);
        const extractedType: TravelType | null = data.travelType || null;

        setForm((prev) => ({
          ...prev,
          // A receipt's travel type applies inside a trip; otherwise it waits
          // until one is picked.
          ...(extractedType && prev.trip ? { travelType: extractedType } : {}),
          title: data.title || prev.title,
          amount: data.amount != null ? String(data.amount) : prev.amount,
          gstAmount: data.gstAmount != null ? String(data.gstAmount) : prev.gstAmount,
          date: data.date || prev.date,
          description: data.description || prev.description,
          category: data.category || prev.category,
          currency: data.currency || prev.currency,
        }));

        setPendingTravelType(extractedType);
        const filled = filledFields(data);
        setAiFilled(filled);
        setReadCount(filled.size);
        setShowUploadModal(false);
        toast("Details filled from your receipt — please review before creating.", "success");
      } catch (err) {
        setShowUploadModal(false);
        setExtractFailed(true);
        toast(err instanceof Error ? err.message : "Couldn't read the receipt. Please fill the form manually.", "error");
      } finally {
        setExtracting(false);
      }
    },
    [toast]
  );

  const removeReceipt = () => {
    setReceipt(null);
    setAiFilled(null);
    setReadCount(null);
    setExtractFailed(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.amount || !form.category || !form.department || !form.date) {
      toast("Please fill in all required fields", "error");
      return;
    }
    const formError = getSubmitError(form);
    if (formError) {
      toast(formError, "error");
      return;
    }

    const expenseAmountCents = moneyToCents(form.amount);
    const gstAmountCents = moneyToCents(form.gstAmount || null);
    const totalAllocatedCents = assets.reduce((total, asset) => total + moneyToCents(asset.allocatedAmount), 0);
    const totalGstAllocatedCents = assets.reduce(
      (total, asset) => total + moneyToCents(asset.allocatedGstAmount),
      0
    );
    if (totalAllocatedCents > expenseAmountCents) {
      toast("Asset allocations cannot exceed the expense amount", "error");
      return;
    }
    if (totalGstAllocatedCents > gstAmountCents) {
      toast("Asset GST allocations cannot exceed the expense GST amount", "error");
      return;
    }

    setSubmitting(true);
    let uploadedReceiptKey: string | null = null;
    try {
      let receiptData: { receiptKey?: string; receiptFilename?: string } = {};
      if (receipt?.file) {
        const uploaded = await upload(receipt.file);
        uploadedReceiptKey = uploaded.key;
        receiptData = { receiptKey: uploaded.key, receiptFilename: uploaded.filename };
      }

      await api.post("/api/expenses", {
        ...toExpensePayload(form),
        assets: assets.map(({ id: _id, ...asset }) => asset),
        ...receiptData,
      });

      toast(assets.length > 0 ? "Expense and company assets created" : "Expense created");
      // Land on the trip the expense went into, else the one the form was opened from.
      const tripId = form.trip || openedFromTrip;
      router.push(
        tripId ? `/dashboard/trips/${tripId}` : assets.length > 0 ? "/dashboard/assets" : "/dashboard/expenses"
      );
    } catch (err) {
      await discardUploadedReceipt(uploadedReceiptKey);
      toast(err instanceof Error ? err.message : "Failed to create expense", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Hold the form back until `?trip=` is applied, so it doesn't flash empty.
  if (loading || !urlRead || (prefillTripId && !prefillDone)) return <FormSkeleton />;

  const canReadReceipt = Boolean(receipt && EXTRACTABLE_TYPES.includes(receipt.file.type));
  const readState = extracting ? "reading" : extractFailed ? "failed" : readCount !== null ? "done" : null;
  const currencySymbol = lookups.currencies.find((c) => c._id === form.currency)?.symbol || "₹";

  return (
    <>
      <ReceiptUploadModal
        isOpen={showUploadModal}
        extracting={extracting}
        onFile={processReceiptFile}
        onClose={() => setShowUploadModal(false)}
      />

      <ExpenseForm
        heading="New expense"
        backLabel={openedFromTrip ? "Back to Trip" : "Back to Expenses"}
        onCancel={handleCancel}
        values={form}
        onValuesChange={setForm}
        onEdit={handleEdit}
        onDateChange={handlePurchaseDateChange}
        onTripChange={handleTripChange}
        onTravelTypeChange={handleTravelTypeChange}
        lookups={lookups}
        trips={trips}
        defaultPayerId={user?._id}
        aiFilled={aiFilled}
        receipt={
          <ReceiptPanel
            file={receipt?.file}
            filename={receipt?.filename ?? null}
            onFile={processReceiptFile}
            onRemove={removeReceipt}
            disabled={extracting}
            emptyPrompt={
              <>
                <Upload aria-hidden="true" size={24} strokeWidth={1.5} className="mb-1 text-accent" />
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  <Sparkles aria-hidden="true" size={15} strokeWidth={1.75} className="text-accent" />
                  Upload a receipt to auto-fill the form
                </span>
                <span className="text-xs text-ink-3">
                  Click, drag &amp; drop, or paste · JPEG, PNG, WebP, or PDF up to 10MB
                </span>
              </>
            }
            status={
              readState && (
                <ReceiptReadStatus
                  state={readState}
                  count={readCount ?? 0}
                  onRetry={canReadReceipt && receipt ? () => processReceiptFile(receipt.file) : undefined}
                />
              )
            }
          />
        }
        onSubmit={handleSubmit}
        submitLabel={assets.length > 0 ? "Save expense & assets" : "Save expense"}
        busyLabel={uploadingReceipt ? "Uploading…" : "Saving…"}
        busy={submitting || uploadingReceipt}
        submitDisabled={extracting}
      >
        <AssetPurchaseSection
          assets={assets}
          onChange={setAssets}
          purchaseDate={form.date}
          currencySymbol={currencySymbol}
          users={users}
          canAssignOthers={isAdmin}
          currentUser={user ? { _id: user._id, name: user.name, email: user.email } : null}
        />
      </ExpenseForm>
    </>
  );
}
