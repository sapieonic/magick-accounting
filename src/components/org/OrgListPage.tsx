"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { InlineLoader } from "@/components/ui/Spinner";
import { ListPageSkeleton } from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import Button, { IconButton } from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import Panel from "@/components/ui/Panel";
import Badge from "@/components/ui/Badge";
import Field, { inputClass, textareaClass } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { panelPadL, rowClass } from "@/components/ui/styles";
import ConfirmDialog, { DialogActions } from "@/components/ui/ConfirmDialog";

export interface OrgItem {
  _id: string;
  name: string;
  description?: string;
  isDefault: boolean;
}

interface OrgForm {
  name: string;
  description: string;
}

export interface OrgListConfig<T extends OrgItem> {
  /** Page title, also the document title ("Departments"). */
  title: string;
  /** Singular noun for copy and dialogs ("Department"). */
  noun: string;
  /** Line under the title. */
  description: string;
  /** API collection, e.g. "/api/departments"; items live under `responseKey`. */
  endpoint: string;
  responseKey: string;
  /** Expenses list filter param ("department", "category"). */
  filterParam: string;
  /** Icon for the empty state. */
  icon: LucideIcon;
  /** Leading visual for a row. */
  glyph: (item: T) => ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  /** Show an Add button inside the empty state. */
  emptyAction?: boolean;
  /** Admins may rename / re-describe custom items (PUT endpoint/:id). */
  editable?: boolean;
  /** Ask for a description in the form. */
  withDescription?: boolean;
  namePlaceholder: string;
  descriptionPlaceholder?: string;
  /** Request body for create / update. */
  toPayload: (form: OrgForm) => Record<string, unknown>;
  createError: string;
}

const EMPTY_FORM: OrgForm = { name: "", description: "" };

/**
 * One CRUD list page for organisation lookups (departments, categories):
 * ruled rows linking to the filtered expenses, admin-only edit/delete on
 * custom items, create/edit in a modal and a delete confirmation.
 */
export default function OrgListPage<T extends OrgItem>({ config }: { config: OrgListConfig<T> }) {
  const { title, noun, endpoint, responseKey } = config;
  const pluralLower = title.toLowerCase();
  // Sentence case in buttons and dialog titles ("Add department").
  const nounLower = noun.toLowerCase();
  useTitle(title);
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<T | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [form, setForm] = useState<OrgForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) setRefreshing(true);
      try {
        const data = await api.get(endpoint);
        setItems(data[responseKey]);
      } catch {
        toast(`Failed to load ${pluralLower}`, "error");
      } finally {
        setLoading(false);
        if (showRefreshing) setRefreshing(false);
      }
    },
    [endpoint, responseKey, pluralLower, toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (item: T) => {
    setEditTarget(item);
    setForm({ name: item.name, description: item.description ?? "" });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      if (editTarget) {
        await api.put(`${endpoint}/${editTarget._id}`, config.toPayload(form));
        toast(`${noun} updated`);
      } else {
        await api.post(endpoint, config.toPayload(form));
        toast(`${noun} created`);
      }
      setShowForm(false);
      await load(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : config.createError, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await api.delete(`${endpoint}/${deleteTarget._id}`);
      toast(`${noun} deleted`);
      setDeleteTarget(null);
      await load(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <ListPageSkeleton />;

  const defaults = items.filter((item) => item.isDefault).length;
  const addButton = (
    <Button icon={Plus} onClick={openCreate}>
      Add {nounLower}
    </Button>
  );

  return (
    <div className="flex animate-fade-in flex-col gap-6">
      <PageHeader
        title={title}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {config.description}
            {refreshing && <InlineLoader label="Refreshing..." />}
          </span>
        }
        actions={addButton}
      />

      {items.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<config.icon />}
            title={config.emptyTitle}
            description={config.emptyDescription}
            action={config.emptyAction ? addButton : undefined}
          />
        </Panel>
      ) : (
        <Panel
          title={`All ${pluralLower}`}
          meta={
            <span className="num">
              {items.length}
              {defaults > 0 && ` · ${defaults} default`}
            </span>
          }
          flush
        >
          <ul className="flex flex-col">
            {items.map((item) => {
              const manageable = isAdmin && !item.isDefault;
              return (
                <li key={item._id} className={cn(rowClass, "group flex min-h-14 items-center gap-1 pr-2 sm:pr-3")}>
                  <Link
                    href={`/dashboard/expenses?${config.filterParam}=${item._id}`}
                    aria-label={`View expenses in ${item.name}`}
                    className={cn(panelPadL, "flex min-w-0 flex-1 items-center gap-3 self-stretch py-2.5")}
                  >
                    {config.glyph(item)}
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="ell font-medium text-ink">{item.name}</span>
                        {item.isDefault && <Badge>Default</Badge>}
                      </span>
                      {item.description && <span className="ell text-[13px] text-ink-3">{item.description}</span>}
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      size={15}
                      strokeWidth={1.75}
                      className="ml-auto shrink-0 text-ink-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    />
                  </Link>
                  {manageable && config.editable && (
                    <IconButton icon={Pencil} size="sm" aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)} />
                  )}
                  {manageable && (
                    <IconButton
                      icon={Trash2}
                      variant="ghost-danger"
                      size="sm"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => setDeleteTarget(item)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editTarget ? `Edit ${nounLower}` : `New ${nounLower}`}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Name">
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={config.namePlaceholder}
              className={inputClass}
              autoFocus
            />
          </Field>
          {config.withDescription && (
            <Field label="Description" optional>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={config.descriptionPlaceholder}
                className={cn(textareaClass, "resize-none")}
              />
            </Field>
          )}
          <DialogActions
            onCancel={() => setShowForm(false)}
            confirmLabel={editTarget ? "Update" : "Create"}
            busy={submitting}
          />
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${nounLower}`}
        confirmLabel="Delete"
        busy={submitting}
      >
        Are you sure you want to delete <span className="font-medium text-ink">&ldquo;{deleteTarget?.name}&rdquo;</span>?{" "}
        {title} with expenses cannot be deleted.
      </ConfirmDialog>
    </div>
  );
}
