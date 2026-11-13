"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Coins, FileText, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { InlineLoader } from "@/components/ui/Spinner";
import { ListPageSkeleton } from "@/components/ui/Skeleton";
import PageHeader from "@/components/ui/PageHeader";
import SettingsNav, { type SettingsSection } from "@/components/settings/SettingsNav";
import DomainSettings, { type AllowedDomain } from "@/components/settings/DomainSettings";
import CurrencySettings, { type CurrencyRecord } from "@/components/settings/CurrencySettings";
import TelegramBotSettings from "@/components/settings/TelegramBotSettings";
import InvoiceDefaultsSettings, {
  EMPTY_INVOICE_SETTINGS,
  normalizeInvoiceSettings,
  type InvoiceSettings,
} from "@/components/settings/InvoiceDefaultsSettings";

const SECTIONS: SettingsSection[] = [
  { id: "access", label: "Sign-in access", icon: Shield },
  { id: "currencies", label: "Currencies", icon: Coins },
  { id: "telegram", label: "Telegram bot", icon: Bot },
  { id: "invoices", label: "Invoice defaults", icon: FileText },
];

export default function AdminSettingsPage() {
  useTitle("Settings");
  const { isAdmin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>(EMPTY_INVOICE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isAdmin) router.replace("/dashboard");
  }, [isAdmin, router]);

  const loadData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const [domainData, currencyData, invoiceData] = await Promise.all([
        api.get("/api/domains"),
        api.get("/api/currencies"),
        api.get("/api/invoice-settings"),
      ]);
      setDomains(domainData.domains);
      setCurrencies(currencyData.currencies);
      setInvoiceSettings(normalizeInvoiceSettings(invoiceData.settings));
    } catch {
      toast("Failed to load settings", "error");
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin, loadData]);

  const reload = useCallback(() => loadData(true), [loadData]);

  if (loading) return <ListPageSkeleton />;

  return (
    <div className="flex animate-fade-in flex-col gap-6">
      <PageHeader
        title="Settings"
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            Manage application access, currencies, and integrations.
            {refreshing && <InlineLoader label="Refreshing..." />}
          </span>
        }
      />

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <SettingsNav sections={SECTIONS} />
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <DomainSettings id="access" domains={domains} onChanged={reload} />
          <CurrencySettings id="currencies" currencies={currencies} onChanged={reload} />
          <TelegramBotSettings id="telegram" />
          <InvoiceDefaultsSettings id="invoices" settings={invoiceSettings} />
        </div>
      </div>
    </div>
  );
}
