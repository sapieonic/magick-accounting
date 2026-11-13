"use client";

import { useState } from "react";
import { Globe, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import Panel from "@/components/ui/Panel";
import Button, { IconButton } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Field, { inputClass } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE, rowClass } from "@/components/ui/styles";
import ConfirmDialog, { DialogActions } from "@/components/ui/ConfirmDialog";
import { settingsSectionClass } from "@/components/settings/SettingsNav";

export interface AllowedDomain {
  _id: string;
  domain: string;
  addedBy?: { name: string; email: string };
  createdAt: string;
}

interface DomainSettingsProps {
  id: string;
  domains: AllowedDomain[];
  /** Reloads the page data after a change. */
  onChanged: () => Promise<void>;
}

/** Allowed sign-in email domains: list, add, remove (never the last one). */
export default function DomainSettings({ id, domains, onChanged }: DomainSettingsProps) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AllowedDomain | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/api/domains", { domain: newDomain.trim() });
      toast("Domain added");
      setNewDomain("");
      setShowForm(false);
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add domain", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await api.delete(`/api/domains/${deleteTarget._id}`);
      toast("Domain removed");
      setDeleteTarget(null);
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const lastOne = domains.length <= 1;

  return (
    <Panel
      id={id}
      className={settingsSectionClass}
      title="Allowed email domains"
      meta="Only users from these domains can sign in."
      actions={
        <Button
          size="sm"
          icon={Plus}
          onClick={() => {
            setNewDomain("");
            setShowForm(true);
          }}
        >
          Add domain
        </Button>
      }
      flush
    >
      {domains.length === 0 ? (
        <EmptyState
          icon={<Globe />}
          title="No domains configured"
          description="Add one to allow sign-ins."
        />
      ) : (
        <ul className="flex flex-col">
          {domains.map((domain) => (
            <li
              key={domain._id}
              className={cn(rowClass, "flex min-h-14 items-center gap-3 py-2 pl-[clamp(16px,2vw,24px)] pr-2 sm:pr-3")}
            >
              <Globe aria-hidden="true" size={18} strokeWidth={ICON_STROKE} className="shrink-0 text-ink-3" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="ell font-medium text-ink">@{domain.domain}</span>
                {domain.addedBy && <span className="ell text-[13px] text-ink-3">Added by {domain.addedBy.name}</span>}
              </span>
              <IconButton
                icon={Trash2}
                variant="ghost-danger"
                size="sm"
                onClick={() => setDeleteTarget(domain)}
                disabled={lastOne}
                aria-label={`Remove @${domain.domain}`}
                title={lastOne ? "Cannot remove the last domain" : `Remove @${domain.domain}`}
              />
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Add Email Domain">
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <Field
            label="Domain"
            hint={`Users with ${newDomain.trim() ? `@${newDomain.trim()}` : "this email domain"} addresses will be able to sign in.`}
          >
            <input
              id="domain"
              type="text"
              required
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value.replace("@", ""))}
              placeholder="example.com"
              className={inputClass}
              autoFocus
            />
          </Field>
          <DialogActions onCancel={() => setShowForm(false)} confirmLabel="Add Domain" busy={submitting} />
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Domain"
        confirmLabel="Remove Domain"
        busyLabel="Removing..."
        busy={submitting}
      >
        Are you sure you want to remove <span className="font-medium text-ink">@{deleteTarget?.domain}</span>? Users from
        this domain will no longer be able to sign in.
      </ConfirmDialog>
    </Panel>
  );
}
