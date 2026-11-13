"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Send, ExternalLink, Unlink, Camera, FileText, Forward } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Spinner from "@/components/ui/Spinner";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import Badge, { Dot, type Tone } from "@/components/ui/Badge";
import { ICON_STROKE, linkClass } from "@/components/ui/styles";

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

  const state: { label: string; tone: Tone } | null = !status
    ? null
    : status.link
      ? status.available
        ? { label: "Linked", tone: "success" }
        : { label: "Bot offline", tone: "amber" }
      : pending
        ? { label: "Waiting", tone: "accent" }
        : { label: status.available ? "Not linked" : "Not set up", tone: "neutral" };

  return (
    <Panel
      title="Telegram"
      description="Add expenses by sending receipts to our Telegram bot."
      actions={state && <Badge tone={state.tone} dot>{state.label}</Badge>}
      bodyClassName="gap-4"
      footer={
        status?.available && (
          <ul className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-x-4 gap-y-2">
            {USAGE.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2 text-ink-2">
                <Icon aria-hidden="true" size={15} strokeWidth={ICON_STROKE} className="shrink-0 text-ink-3" />
                {text}
              </li>
            ))}
          </ul>
        )
      }
    >
      {!status && !loadError && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {loadError && !status && (
        <p className="text-sm text-ink-3">Couldn&apos;t load your Telegram status. Refresh to try again.</p>
      )}

      {status && !status.available && !status.link && (
        <p className="text-sm text-ink-2">
          Telegram isn&apos;t set up for your organization yet.{" "}
          {isAdmin ? (
            <>
              Connect a bot in{" "}
              <Link href="/dashboard/admin/settings" className={linkClass}>
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
        <p className="text-sm text-ink-2">
          The Telegram bot is disconnected right now, so it isn&apos;t accepting expenses. Your account stays
          linked and works again once an admin reconnects it.
        </p>
      )}

      {status?.link && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-start gap-3">
            <Dot tone={status.available ? "success" : "amber"} className="mt-[7px]" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Linked to {linkedName}</p>
              <p className="text-[13px] text-ink-3">
                Since <span className="num">{format(new Date(status.link.linkedAt), "d MMM yyyy")}</span>
                {status.botUrl && (
                  <>
                    {" "}
                    · chat with{" "}
                    <a href={status.botUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      @{status.botUsername}
                    </a>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {status.botUrl && (
              <Button variant="secondary" size="sm" icon={ExternalLink} href={status.botUrl} target="_blank" rel="noopener noreferrer">
                Open bot
              </Button>
            )}
            <Button variant="secondary" size="sm" icon={Unlink} onClick={() => setConfirmUnlink(true)}>
              Unlink
            </Button>
          </div>
        </div>
      )}

      {status?.available && !status.link && !pending && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className="min-w-0 basis-[320px] grow text-sm text-ink-2">
            Link your Telegram account to <span className="font-medium text-ink">@{status.botUsername}</span>, then
            send it receipts from your phone.
          </p>
          <Button icon={Send} loading={creating} onClick={startLink}>
            Link Telegram
          </Button>
        </div>
      )}

      {status?.available && !status.link && pending && (
        <div className="flex flex-col gap-3 rounded-panel border border-accent-line bg-tint p-4">
          <div>
            <p className="text-sm font-medium text-ink">Finish linking in Telegram</p>
            <p className="mt-1 text-sm text-ink-2">
              Open Telegram, tap <span className="font-medium text-ink">Start</span> in the chat with @
              {status.botUsername}, then confirm with <span className="font-medium text-ink">Yes, link it</span>. This
              page updates once you&apos;re linked.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={ExternalLink} href={pending.url} target="_blank" rel="noopener noreferrer">
              Open Telegram
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <span role="status" className="flex items-center gap-2 text-[13px] text-ink-3">
              <Spinner size="sm" /> Waiting… link expires at{" "}
              <span className="num">{format(new Date(pending.expiresAt), "h:mm a")}</span>
            </span>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmUnlink}
        onClose={() => setConfirmUnlink(false)}
        onConfirm={unlink}
        title="Unlink Telegram"
        confirmLabel="Unlink"
        busyLabel="Unlinking..."
        busy={unlinking}
      >
        The bot will stop accepting expenses from {linkedName}. Expenses you already added stay as they are.
      </ConfirmDialog>
    </Panel>
  );
}
