"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Bot, ExternalLink, RefreshCw, Unplug } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Spinner from "@/components/ui/Spinner";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { Dot } from "@/components/ui/Badge";
import Field, { inputClass } from "@/components/ui/Field";
import { FieldGrid } from "@/components/ui/FormSection";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE, linkClass } from "@/components/ui/styles";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { settingsSectionClass } from "@/components/settings/SettingsNav";

export interface TelegramSettingsView {
  configured: boolean;
  appUrl: string;
  linkedUsers: number;
  botUsername?: string;
  maskedToken?: string;
  webhookUrl?: string;
  connectedAt?: string | null;
  connectedBy?: { name: string; email: string } | null;
  webhook?: {
    url: string;
    pendingUpdateCount: number;
    lastErrorMessage: string | null;
    lastErrorDate: string | null;
  } | null;
  webhookError?: string | null;
}

/** Telegram keeps the last delivery error even after later deliveries succeed. */
const RECENT_ERROR_MS = 60 * 60 * 1000;

export function describeWebhookProblem(view: TelegramSettingsView): string | null {
  if (view.webhookError) return `Couldn't check the bot with Telegram: ${view.webhookError}`;
  const webhook = view.webhook;
  if (!webhook) return null;
  if (webhook.url !== view.webhookUrl) {
    return "Telegram is sending updates to a different URL. Reconnect to fix it.";
  }
  const recent =
    webhook.lastErrorDate && Date.now() - new Date(webhook.lastErrorDate).getTime() < RECENT_ERROR_MS;
  if (webhook.lastErrorMessage && (recent || webhook.pendingUpdateCount > 0)) {
    return `Telegram couldn't deliver messages to this app: ${webhook.lastErrorMessage}`;
  }
  return null;
}

function defaultAppUrl(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** Connect, reconnect or disconnect the company's Telegram bot. The token is
 * write-only: the form never echoes it and the server only returns a masked copy. */
export default function TelegramBotSettings({ id = "telegram" }: { id?: string }) {
  const { toast } = useToast();
  const [view, setView] = useState<TelegramSettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const apply = useCallback((next: TelegramSettingsView) => {
    setView(next);
    setAppUrl(next.appUrl || defaultAppUrl());
    setBotToken("");
  }, []);

  useEffect(() => {
    api
      .get("/api/telegram/settings")
      .then((data) => apply(data.telegram))
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load"));
  }, [apply]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await api.put("/api/telegram/settings", {
        appUrl,
        ...(botToken.trim() ? { botToken: botToken.trim() } : {}),
      });
      apply(data.telegram);
      setEditing(false);
      toast(`Connected to @${data.telegram.botUsername}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to connect the bot", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const data = await api.delete("/api/telegram/settings");
      apply(data.telegram);
      setConfirmDisconnect(false);
      toast("Telegram bot disconnected");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to disconnect", "error");
    } finally {
      setDisconnecting(false);
    }
  };

  const showForm = view && (!view.configured || editing);
  const webhookProblem = view?.configured ? describeWebhookProblem(view) : null;

  return (
    <Panel
      id={id}
      className={settingsSectionClass}
      title="Telegram bot"
      meta={
        view && (
          <span className="inline-flex items-center gap-1.5">
            <Dot tone={!view.configured ? "neutral" : webhookProblem ? "amber" : "success"} />
            {!view.configured ? "Not connected" : webhookProblem ? "Needs attention" : "Connected"}
          </span>
        )
      }
      actions={
        view?.configured &&
        !editing && (
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setEditing(true)}>
              Reconnect
            </Button>
            <Button size="sm" variant="danger" icon={Unplug} onClick={() => setConfirmDisconnect(true)}>
              Disconnect
            </Button>
          </span>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ink-2">
          Let people add expenses by sending receipts, invoices and messages to a Telegram bot.
        </p>

        {!view && !loadError && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {loadError && !view && <p className="text-sm text-danger">{loadError}</p>}

        {view?.configured && !editing && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5 text-sm">
              <p className="font-medium text-ink">
                Connected to{" "}
                <a
                  href={`https://t.me/${view.botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  @{view.botUsername}
                </a>
              </p>
              <p className="text-[13px] text-ink-3">
                <span className="num">{view.linkedUsers}</span>{" "}
                {view.linkedUsers === 1 ? "person has" : "people have"} linked their Telegram
                {view.connectedAt && <> · connected {format(new Date(view.connectedAt), "d MMM yyyy")}</>}
                {view.connectedBy && <> by {view.connectedBy.name}</>}
              </p>
            </div>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-px overflow-hidden rounded-control border border-rule bg-rule text-sm">
              <div className="flex min-w-0 flex-col gap-1 bg-surface px-3 py-2.5">
                <dt className="cap text-ink-3">Bot token</dt>
                <dd className="num break-all text-ink">{view.maskedToken}</dd>
              </div>
              <div className="flex min-w-0 flex-col gap-1 bg-surface px-3 py-2.5">
                <dt className="cap text-ink-3">Webhook</dt>
                <dd className="num break-all text-xs text-ink">{view.webhookUrl}</dd>
              </div>
            </dl>
            {webhookProblem && (
              <div role="status" className="flex items-start gap-2 rounded-control bg-amber-soft px-3 py-2.5 text-[13px] text-amber">
                <AlertTriangle aria-hidden="true" size={16} strokeWidth={ICON_STROKE} className="mt-px shrink-0" />
                <span>
                  {webhookProblem}
                  {view.webhook?.lastErrorDate && !view.webhookError && (
                    <> ({format(new Date(view.webhook.lastErrorDate), "d MMM, h:mm a")})</>
                  )}
                </span>
              </div>
            )}
            <p className="text-[13px] text-ink-3">
              Everyone links their own Telegram account from their <span className="font-medium text-ink-2">Profile</span>{" "}
              page.
            </p>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleConnect} className="flex flex-col gap-4">
            {!view.configured && (
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-ink-2 marker:text-ink-3">
                <li>
                  In Telegram, open{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(linkClass, "inline-flex items-center gap-1")}
                  >
                    @BotFather <ExternalLink aria-hidden="true" size={12} strokeWidth={ICON_STROKE} />
                  </a>{" "}
                  and send <code className="num rounded bg-sunk px-1">/newbot</code>.
                </li>
                <li>Pick a name and a username for the bot, e.g. &quot;Magick Expenses&quot;.</li>
                <li>Paste the token BotFather gives you below and connect.</li>
              </ol>
            )}
            <FieldGrid min={260}>
              <Field
                label="Bot token"
                hint={view.configured ? "Leave empty to keep the current token." : "Stored on the server; never shown again."}
              >
                <input
                  id="telegram-bot-token"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  required={!view.configured}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={view.configured ? `Keep ${view.maskedToken}` : "123456789:AA…"}
                  className={cn(inputClass, "num")}
                />
              </Field>
              <Field label="App URL" hint="The public https address of this app. Telegram delivers messages to it.">
                <input
                  id="telegram-app-url"
                  type="url"
                  required
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  placeholder="https://expenses.example.com"
                  className={inputClass}
                />
              </Field>
            </FieldGrid>
            <div className="flex flex-wrap justify-end gap-2">
              {view.configured && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(false);
                    apply(view);
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" icon={Bot} loading={saving}>
                {view.configured ? "Reconnect" : "Connect bot"}
              </Button>
            </div>
          </form>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={handleDisconnect}
        title="Disconnect Telegram bot"
        confirmLabel="Disconnect"
        busyLabel="Disconnecting..."
        busy={disconnecting}
      >
        The bot will stop accepting expenses for everyone. People stay linked, so it works again as soon as you
        reconnect a bot.
      </ConfirmDialog>
    </Panel>
  );
}
