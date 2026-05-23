"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { InlineLoader, PageLoader } from "@/components/ui/Spinner";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Plus, Tag, Trash2, ArrowUpRight } from "lucide-react";

interface Category {
  _id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

export default function CategoriesPage() {
  useTitle("Categories");
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadCategories = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const data = await api.get("/api/categories");
      setCategories(data.categories);
    } catch {
      toast("Failed to load categories", "error");
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/api/categories", { name: newName.trim() });
      toast("Category created");
      setNewName("");
      setShowForm(false);
      await loadCategories(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create category", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await api.delete(`/api/categories/${deleteTarget._id}`);
      toast("Category deleted");
      setDeleteTarget(null);
      await loadCategories(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader />;

  const defaultCats = categories.filter((c) => c.isDefault);
  const customCats = categories.filter((c) => !c.isDefault);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
          <h1 className="text-2xl font-bold text-foreground">Categories</h1>
          <p className="text-sm text-muted-foreground">Expense categories for classification.</p>
          </div>
          {refreshing && <InlineLoader label="Refreshing..." />}
        </div>
        <button onClick={() => { setNewName(""); setShowForm(true); }} className="btn-primary">
          <Plus className="h-4 w-4" />
          Add Category
        </button>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-8 w-8" />}
          title="No categories yet"
          description="Run the seed to create default categories or add your own."
        />
      ) : (
        <div className="space-y-6">
          {defaultCats.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Default Categories</h2>
              <div className="flex flex-wrap gap-2">
                {defaultCats.map((cat) => (
                  <Link
                    key={cat._id}
                    href={`/dashboard/expenses?category=${cat._id}`}
                    className="group inline-flex items-center gap-1.5 rounded-full bg-subtle px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-subtle-hover"
                    aria-label={`View expenses in ${cat.name}`}
                  >
                    {cat.name}
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-muted" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {customCats.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Custom Categories</h2>
              <div className="flex flex-wrap gap-2">
                {customCats.map((cat) => (
                  <Link
                    key={cat._id}
                    href={`/dashboard/expenses?category=${cat._id}`}
                    className="group inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/15"
                    aria-label={`View expenses in ${cat.name}`}
                  >
                    {cat.name}
                    <ArrowUpRight className="h-3.5 w-3.5 text-brand-400 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand-600 dark:group-hover:text-brand-400" />
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(cat); }}
                        className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-brand-200 dark:hover:bg-brand-500/20"
                        aria-label={`Delete ${cat.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="New Category">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="cat-name" className="mb-1.5 block text-sm font-medium text-muted">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="cat-name"
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Team Events"
              className="input-field"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Category">
        <p className="text-sm text-muted">
          Are you sure you want to delete <span className="font-medium">&ldquo;{deleteTarget?.name}&rdquo;</span>?
          Categories with expenses cannot be deleted.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button onClick={handleDelete} className="btn-danger" disabled={submitting}>
            {submitting ? <Spinner size="sm" /> : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
