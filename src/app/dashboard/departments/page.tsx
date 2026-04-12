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
import { Plus, Building2, Trash2, Pencil } from "lucide-react";

interface Department {
  _id: string;
  name: string;
  description: string;
  isDefault: boolean;
  createdBy?: { name: string; email: string };
  createdAt: string;
}

export default function DepartmentsPage() {
  useTitle("Departments");
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [submitting, setSubmitting] = useState(false);

  const loadDepartments = useCallback(async () => {
    try {
      const data = await api.get("/api/departments");
      setDepartments(data.departments);
    } catch {
      toast("Failed to load departments", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  const openCreateForm = () => {
    setEditTarget(null);
    setFormData({ name: "", description: "" });
    setShowForm(true);
  };

  const openEditForm = (dept: Department) => {
    setEditTarget(dept);
    setFormData({ name: dept.name, description: dept.description });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setSubmitting(true);

    try {
      if (editTarget) {
        await api.put(`/api/departments/${editTarget._id}`, formData);
        toast("Department updated");
      } else {
        await api.post("/api/departments", formData);
        toast("Department created");
      }
      setShowForm(false);
      loadDepartments();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Operation failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await api.delete(`/api/departments/${deleteTarget._id}`);
      toast("Department deleted");
      setDeleteTarget(null);
      loadDepartments();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-sm text-gray-500">Organize expenses by department.</p>
        </div>
        <button onClick={openCreateForm} className="btn-primary">
          <Plus className="h-4 w-4" />
          Add Department
        </button>
      </div>

      {departments.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="No departments yet"
          description="Create departments to organize your expenses."
          action={
            <button onClick={openCreateForm} className="btn-primary">
              <Plus className="h-4 w-4" /> Add Department
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => (
            <div key={dept._id} className="card p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-purple-50 p-2.5">
                    <Building2 className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{dept.name}</h3>
                    {dept.isDefault && (
                      <span className="text-xs text-gray-400">Default</span>
                    )}
                  </div>
                </div>
                {isAdmin && !dept.isDefault && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditForm(dept)}
                      className="cursor-pointer rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      aria-label={`Edit ${dept.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(dept)}
                      className="cursor-pointer rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label={`Delete ${dept.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              {dept.description && (
                <p className="mt-3 text-sm text-gray-500">{dept.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editTarget ? "Edit Department" : "New Department"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="dept-name" className="mb-1.5 block text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="dept-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Engineering"
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="dept-desc" className="mb-1.5 block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="dept-desc"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What does this department handle?"
              className="input-field resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : editTarget ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Department">
        <p className="text-sm text-gray-600">
          Are you sure you want to delete <span className="font-medium">&ldquo;{deleteTarget?.name}&rdquo;</span>?
          Departments with expenses cannot be deleted.
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
