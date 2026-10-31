"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Bot, ExternalLink, AlertTriangle, CircleCheck, Unplug } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";

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

export default function TelegramBotSettings() {
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
    <div className="card">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-sky-50 p-2 dark:bg-sky-500/10">
            <Bot className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Telegram Bot</h2>
            <p className="text-xs text-muted-foreground">
              Let people add expenses by sending receipts, invoices and messages to a Telegram bot.
            </p>
          </div>
        </div>
        {view?.configured && !editing && (
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="btn-secondary text-sm">
              Reconnect
            </button>
            <button onClick={() => setConfirmDisconnect(true)} className="btn-secondary text-sm">
              <Unplug className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        )}
      </div>

      <div className="space-y-5 px-6 py-5">
        {!view && !loadError && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {loadError && !view && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

        {view?.configured && !editing && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CircleCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  Connected to{" "}
                  <a
                    href={`https://t.me/${view.botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline dark:text-brand-400"
                  >
                    @{view.botUsername}
                  </a>
                </p>
                <p className="text-xs text-muted-foreground">
                  {view.linkedUsers} {view.linkedUsers === 1 ? "person has" : "people have"} linked their Telegram
                  {view.connectedAt && <> · connected {format(new Date(view.connectedAt), "d MMM yyyy")}</>}
                  {view.connectedBy && <> by {view.connectedBy.name}</>}
                </p>
              </div>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Bot token</dt>
                <dd className="font-mono text-foreground">{view.maskedToken}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Webhook</dt>
                <dd className="break-all font-mono text-xs text-foreground">{view.webhookUrl}</dd>
              </div>
            </dl>
            {webhookProblem && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  {webhookProblem}
                  {view.webhook?.lastErrorDate && !view.webhookError && (
                    <> ({format(new Date(view.webhook.lastErrorDate), "d MMM, h:mm a")})</>
                  )}
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Everyone links their own Telegram account from their <span className="font-medium">Profile</span> page.
            </p>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleConnect} className="space-y-4">
            {!view.configured && (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>
                  In Telegram, open{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    @BotFather <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  and send <code className="rounded bg-subtle px-1">/newbot</code>.
                </li>
                <li>Pick a name and a username for the bot, e.g. &quot;Magick Expenses&quot;.</li>
                <li>Paste the token BotFather gives you below and connect.</li>
              </ol>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="telegram-bot-token" className="mb-1.5 block text-sm font-medium text-muted">
                  Bot token
                </label>
                <input
                  id="telegram-bot-token"
                  type="password"
                  autoComplete="off"
                  required={!view.configured}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={view.configured ? `Keep ${view.maskedToken}` : "123456789:AA…"}
                  className="input-field font-mono"
                />
              </div>
              <div>
                <label htmlFor="telegram-app-url" className="mb-1.5 block text-sm font-medium text-muted">
                  App URL
                </label>
                <input
                  id="telegram-app-url"
                  type="url"
                  required
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  placeholder="https://expenses.example.com"
                  className="input-field"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  The public https address of this app. Telegram delivers messages to it.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              {view.configured && (
                <button type="button" onClick={() => { setEditing(false); apply(view); }} className="btn-secondary">
                  Cancel
                </button>
              )}
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? <Spinner size="sm" /> : view.configured ? "Reconnect" : "Connect bot"}
              </button>
            </div>
          </form>
        )}
      </div>

      <Modal isOpen={confirmDisconnect} onClose={() => setConfirmDisconnect(false)} title="Disconnect Telegram bot">
        <p className="text-sm text-muted">
          The bot will stop accepting expenses for everyone. People stay linked, so it works again as soon as you
          reconnect a bot.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setConfirmDisconnect(false)} className="btn-secondary" disabled={disconnecting}>
            Cancel
          </button>
          <button onClick={handleDisconnect} className="btn-danger" disabled={disconnecting}>
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
