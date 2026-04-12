"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { PageLoader } from "@/components/ui/Spinner";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import { Globe, Plus, Trash2, Shield, Coins, Pencil } from "lucide-react";

interface AllowedDomain {
  _id: string;
  domain: string;
  addedBy?: { name: string; email: string };
  createdAt: string;
}

interface CurrencyRecord {
  _id: string;
  code: string;
  name: string;
  symbol: string;
  rateToBase: number;
  isBase: boolean;
  isActive: boolean;
}

export default function AdminSettingsPage() {
  useTitle("Settings");
  const { isAdmin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // Domain state
  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [showDomainForm, setShowDomainForm] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [deleteDomainTarget, setDeleteDomainTarget] = useState<AllowedDomain | null>(null);

  // Currency state
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [showCurrencyForm, setShowCurrencyForm] = useState(false);
  const [currencyForm, setCurrencyForm] = useState({ code: "", name: "", symbol: "", rateToBase: "" });
  const [editRateTarget, setEditRateTarget] = useState<CurrencyRecord | null>(null);
  const [editRateValue, setEditRateValue] = useState("");
  const [deleteCurrencyTarget, setDeleteCurrencyTarget] = useState<CurrencyRecord | null>(null);

  // Shared state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAdmin) router.replace("/dashboard");
  }, [isAdmin, router]);

  const loadData = useCallback(async () => {
    try {
      const [domainData, currencyData] = await Promise.all([
        api.get("/api/domains"),
        api.get("/api/currencies"),
      ]);
      setDomains(domainData.domains);
      setCurrencies(currencyData.currencies);
    } catch {
      toast("Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin, loadData]);

  // --- Domain handlers ---
  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/api/domains", { domain: newDomain.trim() });
      toast("Domain added");
      setNewDomain("");
      setShowDomainForm(false);
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add domain", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDomain = async () => {
    if (!deleteDomainTarget) return;
    setSubmitting(true);
    try {
      await api.delete(`/api/domains/${deleteDomainTarget._id}`);
      toast("Domain removed");
      setDeleteDomainTarget(null);
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Currency handlers ---
  const handleAddCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currencyForm.code || !currencyForm.name || !currencyForm.symbol || !currencyForm.rateToBase) return;
    setSubmitting(true);
    try {
      await api.post("/api/currencies", {
        code: currencyForm.code,
        name: currencyForm.name,
        symbol: currencyForm.symbol,
        rateToBase: parseFloat(currencyForm.rateToBase),
      });
      toast("Currency added");
      setCurrencyForm({ code: "", name: "", symbol: "", rateToBase: "" });
      setShowCurrencyForm(false);
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add currency", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRateTarget || !editRateValue) return;
    setSubmitting(true);
    try {
      await api.put(`/api/currencies/${editRateTarget._id}`, {
        rateToBase: parseFloat(editRateValue),
      });
      toast("Exchange rate updated");
      setEditRateTarget(null);
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update rate", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCurrency = async () => {
    if (!deleteCurrencyTarget) return;
    setSubmitting(true);
    try {
      await api.delete(`/api/currencies/${deleteCurrencyTarget._id}`);
      toast("Currency deleted");
      setDeleteCurrencyTarget(null);
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage application access, security, and currencies.</p>
      </div>

      {/* Domain Whitelist Section */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2">
              <Shield className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Allowed Email Domains</h2>
              <p className="text-xs text-gray-500">Only users from these domains can sign in.</p>
            </div>
          </div>
          <button onClick={() => { setNewDomain(""); setShowDomainForm(true); }} className="btn-primary text-sm">
            <Plus className="h-4 w-4" />
            Add Domain
          </button>
        </div>

        {domains.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Globe className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">No domains configured. Add one to allow sign-ins.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {domains.map((domain) => (
              <div
                key={domain._id}
                className="flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-gray-50/50"
              >
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">@{domain.domain}</p>
                    {domain.addedBy && (
                      <p className="text-xs text-gray-400">Added by {domain.addedBy.name}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setDeleteDomainTarget(domain)}
                  disabled={domains.length <= 1}
                  className="cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={`Remove @${domain.domain}`}
                  title={domains.length <= 1 ? "Cannot remove the last domain" : `Remove @${domain.domain}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Currencies & Exchange Rates Section */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2">
              <Coins className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Currencies & Exchange Rates</h2>
              <p className="text-xs text-gray-500">Manage supported currencies and their exchange rates to INR.</p>
            </div>
          </div>
          <button
            onClick={() => {
              setCurrencyForm({ code: "", name: "", symbol: "", rateToBase: "" });
              setShowCurrencyForm(true);
            }}
            className="btn-primary text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Currency
          </button>
        </div>

        {currencies.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Coins className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">No currencies configured. Run seed or add one manually.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {currencies.map((curr) => (
              <div
                key={curr._id}
                className="flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-gray-50/50"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-sm font-semibold text-gray-700">
                    {curr.symbol}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{curr.code}</p>
                      {curr.isBase && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Base
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{curr.name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!curr.isBase && (
                    <span className="mr-2 text-sm tabular-nums text-gray-600">
                      1 {curr.code} = {curr.rateToBase.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} INR
                    </span>
                  )}
                  {!curr.isBase && (
                    <>
                      <button
                        onClick={() => {
                          setEditRateTarget(curr);
                          setEditRateValue(curr.rateToBase.toString());
                        }}
                        className="cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        aria-label={`Edit rate for ${curr.code}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteCurrencyTarget(curr)}
                        className="cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${curr.code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========== MODALS ========== */}

      {/* Add Domain Modal */}
      <Modal isOpen={showDomainForm} onClose={() => setShowDomainForm(false)} title="Add Email Domain">
        <form onSubmit={handleAddDomain} className="space-y-4">
          <div>
            <label htmlFor="domain" className="mb-1.5 block text-sm font-medium text-gray-700">
              Domain <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
                @
              </span>
              <input
                id="domain"
                type="text"
                required
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value.replace("@", ""))}
                placeholder="example.com"
                className="input-field rounded-l-none"
                autoFocus
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              Users with this email domain will be able to sign in.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowDomainForm(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : "Add Domain"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Domain Modal */}
      <Modal isOpen={!!deleteDomainTarget} onClose={() => setDeleteDomainTarget(null)} title="Remove Domain">
        <p className="text-sm text-gray-600">
          Are you sure you want to remove <span className="font-medium">@{deleteDomainTarget?.domain}</span>?
          Users from this domain will no longer be able to sign in.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setDeleteDomainTarget(null)} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button onClick={handleDeleteDomain} className="btn-danger" disabled={submitting}>
            {submitting ? "Removing..." : "Remove Domain"}
          </button>
        </div>
      </Modal>

      {/* Add Currency Modal */}
      <Modal isOpen={showCurrencyForm} onClose={() => setShowCurrencyForm(false)} title="Add Currency">
        <form onSubmit={handleAddCurrency} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="curr-code" className="mb-1.5 block text-sm font-medium text-gray-700">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                id="curr-code"
                type="text"
                required
                maxLength={3}
                value={currencyForm.code}
                onChange={(e) => setCurrencyForm({ ...currencyForm, code: e.target.value.toUpperCase() })}
                placeholder="USD"
                className="input-field uppercase"
                autoFocus
              />
              <p className="mt-1 text-xs text-gray-400">3-letter ISO code</p>
            </div>
            <div>
              <label htmlFor="curr-symbol" className="mb-1.5 block text-sm font-medium text-gray-700">
                Symbol <span className="text-red-500">*</span>
              </label>
              <input
                id="curr-symbol"
                type="text"
                required
                maxLength={3}
                value={currencyForm.symbol}
                onChange={(e) => setCurrencyForm({ ...currencyForm, symbol: e.target.value })}
                placeholder="$"
                className="input-field"
              />
            </div>
          </div>
          <div>
            <label htmlFor="curr-name" className="mb-1.5 block text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="curr-name"
              type="text"
              required
              value={currencyForm.name}
              onChange={(e) => setCurrencyForm({ ...currencyForm, name: e.target.value })}
              placeholder="US Dollar"
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="curr-rate" className="mb-1.5 block text-sm font-medium text-gray-700">
              Exchange Rate to INR <span className="text-red-500">*</span>
            </label>
            <input
              id="curr-rate"
              type="number"
              required
              min="0.0001"
              step="any"
              value={currencyForm.rateToBase}
              onChange={(e) => setCurrencyForm({ ...currencyForm, rateToBase: e.target.value })}
              placeholder="83.50"
              className="input-field tabular-nums"
            />
            <p className="mt-1 text-xs text-gray-400">
              How many INR per 1 unit of this currency.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCurrencyForm(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : "Add Currency"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Exchange Rate Modal */}
      <Modal isOpen={!!editRateTarget} onClose={() => setEditRateTarget(null)} title="Edit Exchange Rate">
        <form onSubmit={handleUpdateRate} className="space-y-4">
          <div>
            <label htmlFor="edit-rate" className="mb-1.5 block text-sm font-medium text-gray-700">
              1 {editRateTarget?.code} = ? INR
            </label>
            <input
              id="edit-rate"
              type="number"
              required
              min="0.0001"
              step="any"
              value={editRateValue}
              onChange={(e) => setEditRateValue(e.target.value)}
              className="input-field tabular-nums"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Changing the rate only affects future expenses. Existing expenses keep their original conversion.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditRateTarget(null)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : "Update Rate"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Currency Modal */}
      <Modal isOpen={!!deleteCurrencyTarget} onClose={() => setDeleteCurrencyTarget(null)} title="Delete Currency">
        <p className="text-sm text-gray-600">
          Are you sure you want to delete <span className="font-medium">{deleteCurrencyTarget?.code} ({deleteCurrencyTarget?.name})</span>?
          Currencies with expenses cannot be deleted.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setDeleteCurrencyTarget(null)} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button onClick={handleDeleteCurrency} className="btn-danger" disabled={submitting}>
            {submitting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
