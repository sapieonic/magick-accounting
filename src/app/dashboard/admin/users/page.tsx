"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { PageLoader } from "@/components/ui/Spinner";
import EmptyState from "@/components/ui/EmptyState";
import { Users, Shield, ShieldCheck, User as UserIcon } from "lucide-react";

interface UserRecord {
  _id: string;
  email: string;
  name: string;
  role: "master_admin" | "admin" | "user";
  photoURL?: string;
  createdAt: string;
}

export default function AdminUsersPage() {
  useTitle("Users");
  const { isAdmin, isMasterAdmin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/dashboard");
    }
  }, [isAdmin, router]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.get("/api/users");
      setUsers(data.users);
    } catch {
      toast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers]);

  const toggleRole = async (user: UserRecord) => {
    if (!isMasterAdmin || user.role === "master_admin") return;
    const newRole = user.role === "admin" ? "user" : "admin";
    setUpdatingId(user._id);
    try {
      await api.patch(`/api/users/${user._id}/role`, { role: newRole });
      toast(`${user.name} is now ${newRole === "admin" ? "an admin" : "a member"}`);
      loadUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update role", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const roleConfig = {
    master_admin: { label: "Master Admin", icon: ShieldCheck, color: "bg-purple-100 text-purple-700" },
    admin: { label: "Admin", icon: Shield, color: "bg-blue-100 text-blue-700" },
    user: { label: "Member", icon: UserIcon, color: "bg-gray-100 text-gray-600" },
  };

  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500">
          Manage user roles. {isMasterAdmin ? "Click a user's role badge to change it." : "Only the master admin can change roles."}
        </p>
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No users yet"
          description="Users will appear here once they sign in."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-50">
            {users.map((user) => {
              const config = roleConfig[user.role];
              return (
                <div
                  key={user._id}
                  className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50/50"
                >
                  <div className="flex items-center gap-4">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.name}
                        className="h-10 w-10 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-700">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleRole(user)}
                    disabled={!isMasterAdmin || user.role === "master_admin" || updatingId === user._id}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${config.color} ${
                      isMasterAdmin && user.role !== "master_admin"
                        ? "cursor-pointer hover:opacity-80"
                        : "cursor-default"
                    } ${updatingId === user._id ? "opacity-50" : ""}`}
                    aria-label={`Change role for ${user.name}`}
                  >
                    <config.icon className="h-3.5 w-3.5" />
                    {updatingId === user._id ? "Updating..." : config.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
