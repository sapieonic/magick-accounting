"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Send, ExternalLink, Unlink, Camera, FileText, Forward, CircleCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";

export interface TelegramLinkStatus {
  available: boolean;
  botUsername: string | null;
  botUrl: string | null;
  link: { username: string | null; firstName: string | null; linkedAt: string } | null;
}

interface PendingLink {
  url: string;
  expiresAt: string;
}

const POLL_MS = 3000;

const USAGE = [
  { icon: Camera, text: "Snap a photo of a receipt" },
  { icon: FileText, text: "Send an invoice as a PDF or image" },
  { icon: Forward, text: "Forward a payment or booking message" },
];

export default function TelegramLinkCard({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<TelegramLinkStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<PendingLink | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const linkedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = (await api.get("/api/telegram/link")) as TelegramLinkStatus;
      setStatus(data);
      setLoadError(false);
      return data;
    } catch {
      setLoadError(true);
      return null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While a link is open, poll until the bot confirms it or the code expires.
  useEffect(() => {
    if (!pending) return;
    linkedRef.current = false;
    const timer = setInterval(async () => {
      if (new Date(pending.expiresAt).getTime() < Date.now()) {
        setPending(null);
        toast("That link expired. Tap Link Telegram to get a new one.", "error");
        return;
      }
      const data = await load();
      if (data?.link && !linkedRef.current) {
        linkedRef.current = true;
        setPending(null);
        toast("Telegram linked");
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pending, load, toast]);

  const startLink = async () => {
    setCreating(true);
    try {
      // Not opened automatically: a window opened after an await is blocked
      // as a popup, so the user taps "Open Telegram" instead.
      setPending((await api.post("/api/telegram/link")) as PendingLink);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create a link", "error");
    } finally {
      setCreating(false);
    }
  };

  const unlink = async () => {
    setUnlinking(true);
    try {
      setStatus((await api.delete("/api/telegram/link")) as TelegramLinkStatus);
      setConfirmUnlink(false);
      toast("Telegram unlinked");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not unlink Telegram", "error");
    } finally {
      setUnlinking(false);
    }
  };

  const linkedName = status?.link
    ? status.link.username
      ? `@${status.link.username}`
      : status.link.firstName || "your Telegram account"
    : null;

  return (
    <div className="card">
      <div className="flex items-center gap-3 border-b border-line px-6 py-4">
        <div className="rounded-lg bg-sky-50 p-2 dark:bg-sky-500/10">
          <Send className="h-5 w-5 text-sky-600 dark:text-sky-400" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Telegram</h2>
          <p className="text-xs text-muted-foreground">Add expenses by sending receipts to our Telegram bot.</p>
        </div>
      </div>

      <div className="space-y-5 px-6 py-5">
        {!status && !loadError && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}

        {loadError && !status && (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load your Telegram status. Refresh to try again.</p>
        )}

        {status && !status.available && !status.link && (
          <p className="text-sm text-muted">
            Telegram isn&apos;t set up for your organization yet.{" "}
            {isAdmin ? (
              <>
                Connect a bot in{" "}
                <Link href="/dashboard/admin/settings" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                  Settings
                </Link>
                .
              </>
            ) : (
              "Ask an admin to connect a bot in Settings."
            )}
          </p>
        )}

        {status && !status.available && status.link && (
          <p className="text-sm text-muted">
            The Telegram bot is disconnected right now, so it isn&apos;t accepting expenses. Your account stays
            linked and works again once an admin reconnects it.
          </p>
        )}

        {status?.link && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <CircleCheck className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-foreground">Linked to {linkedName}</p>
                <p className="text-xs text-muted-foreground">
                  Since {format(new Date(status.link.linkedAt), "d MMM yyyy")}
                  {status.botUrl && (
                    <>
                      {" "}
                      · chat with{" "}
                      <a
                        href={status.botUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                      >
                        @{status.botUsername}
                      </a>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {status.botUrl && (
                <a href={status.botUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm">
                  <ExternalLink className="h-4 w-4" />
                  Open bot
                </a>
              )}
              <button onClick={() => setConfirmUnlink(true)} className="btn-secondary text-sm">
                <Unlink className="h-4 w-4" />
                Unlink
              </button>
            </div>
          </div>
        )}

        {status?.available && !status.link && !pending && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              Link your Telegram account to <span className="font-medium">@{status.botUsername}</span>, then send it
              receipts from your phone.
            </p>
            <button onClick={startLink} className="btn-primary flex-shrink-0 text-sm" disabled={creating}>
              {creating ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
              Link Telegram
            </button>
          </div>
        )}

        {status?.available && !status.link && pending && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-500/20 dark:bg-sky-500/5">
            <p className="text-sm font-medium text-foreground">Finish linking in Telegram</p>
            <p className="mt-1 text-sm text-muted">
              Open Telegram, tap <span className="font-medium">Start</span> in the chat with @{status.botUsername},
              then confirm with <span className="font-medium">Yes, link it</span>. This page updates once you&apos;re
              linked.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a href={pending.url} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
                <ExternalLink className="h-4 w-4" />
                Open Telegram
              </a>
              <button onClick={() => setPending(null)} className="btn-secondary text-sm">
                Cancel
              </button>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner size="sm" /> Waiting… link expires at {format(new Date(pending.expiresAt), "h:mm a")}
              </span>
            </div>
          </div>
        )}

        {status?.available && (
          <ul className="grid gap-2 sm:grid-cols-3">
            {USAGE.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2 rounded-lg bg-subtle/50 px-3 py-2 text-xs text-muted">
                <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                {text}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal isOpen={confirmUnlink} onClose={() => setConfirmUnlink(false)} title="Unlink Telegram">
        <p className="text-sm text-muted">
          The bot will stop accepting expenses from {linkedName}. Expenses you already added stay as they are.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setConfirmUnlink(false)} className="btn-secondary" disabled={unlinking}>
            Cancel
          </button>
          <button onClick={unlink} className="btn-danger" disabled={unlinking}>
            {unlinking ? "Unlinking..." : "Unlink"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
