"use client";

import { Tag } from "lucide-react";
import OrgListPage, { type OrgItem, type OrgListConfig } from "@/components/org/OrgListPage";
import CategoryGlyph from "@/components/ui/CategoryGlyph";

interface Category extends OrgItem {
  createdAt: string;
}

const config: OrgListConfig<Category> = {
  title: "Categories",
  noun: "Category",
  description: "Expense categories for classification.",
  endpoint: "/api/categories",
  responseKey: "categories",
  filterParam: "category",
  icon: Tag,
  glyph: (category) => <CategoryGlyph name={category.name} />,
  emptyTitle: "No categories yet",
  emptyDescription: "Run the seed to create default categories or add your own.",
  namePlaceholder: "e.g. Team Events",
  toPayload: ({ name }) => ({ name: name.trim() }),
  createError: "Failed to create category",
};

export default function CategoriesPage() {
  return <OrgListPage config={config} />;
}
