"use client";

import { Building2 } from "lucide-react";
import OrgListPage, { type OrgItem, type OrgListConfig } from "@/components/org/OrgListPage";
import { ICON_STROKE } from "@/components/ui/styles";

interface Department extends OrgItem {
  description: string;
  createdBy?: { name: string; email: string };
  createdAt: string;
}

const config: OrgListConfig<Department> = {
  title: "Departments",
  noun: "Department",
  description: "Organize expenses by department.",
  endpoint: "/api/departments",
  responseKey: "departments",
  filterParam: "department",
  icon: Building2,
  glyph: () => <Building2 aria-hidden="true" size={18} strokeWidth={ICON_STROKE} className="shrink-0 text-ink-3" />,
  emptyTitle: "No departments yet",
  emptyDescription: "Create departments to organize your expenses.",
  emptyAction: true,
  editable: true,
  withDescription: true,
  namePlaceholder: "e.g. Engineering",
  descriptionPlaceholder: "What does this department handle?",
  toPayload: ({ name, description }) => ({ name, description }),
  createError: "Operation failed",
};

export default function DepartmentsPage() {
  return <OrgListPage config={config} />;
}
