"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { PageLoader } from "@/components/ui/Spinner";
import Spinner from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Plus, Tag, Trash2 } from "lucide-react";

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

  const loadCategories = useCallback(async () => {
    try {
      const data = await api.get("/api/categories");
      setCategories(data.categories);
    } catch {
      toast("Failed to load categories", "error");
    } finally {
      setLoading(false);
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
      loadCategories();
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
      loadCategories();
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          <p className="text-sm text-gray-500">Expense categories for classification.</p>
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
              <h2 className="mb-3 text-sm font-semibold text-gray-500">Default Categories</h2>
              <div className="flex flex-wrap gap-2">
                {defaultCats.map((cat) => (
                  <span
                    key={cat._id}
                    className="inline-flex items-center rounded-full bg-gray-100 px-3.5 py-1.5 text-sm font-medium text-gray-700"
                  >
                    {cat.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {customCats.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-gray-500">Custom Categories</h2>
              <div className="flex flex-wrap gap-2">
                {customCats.map((cat) => (
                  <span
                    key={cat._id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-700"
                  >
                    {cat.name}
                    {isAdmin && (
                      <button
                        onClick={() => setDeleteTarget(cat)}
                        className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-brand-100"
                        aria-label={`Delete ${cat.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
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
            <label htmlFor="cat-name" className="mb-1.5 block text-sm font-medium text-gray-700">
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
        <p className="text-sm text-gray-600">
          Are you sure you want to delete <span className="font-medium">&ldquo;{deleteTarget?.name}&rdquo;</span>?
          Categories with expenses cannot be deleted.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button onClick={handleDelete} className="btn-danger" disabled={submitting}>
            {submitting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
