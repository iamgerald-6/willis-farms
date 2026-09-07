"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import { buildSidebarNav } from "@/lib/moduleRegistry/navigation/buildSidebarNav";

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

// Placeholder only — nothing here is persisted yet. Mirrors the shape of
// Organizational structure set up's list table (name / item count / action)
// until the real data model for this page is defined.
type PlaceholderItem = {
  id: string;
  name: string;
};

/**
 * Flattens the platform's actual sidebar navigation (built from the module
 * registry — same source Sidebar.tsx renders from) into a single pick-list:
 * top-level items as-is, and each collapsible group's children labeled
 * "Group > Child" so nested items (e.g. under Human Capital) stay
 * distinguishable in a flat dropdown.
 */
function getSidebarNavItemOptions(): string[] {
  const nav = buildSidebarNav();
  const options: string[] = [];
  for (const item of nav) {
    if (item.children && item.children.length > 0) {
      for (const child of item.children) {
        options.push(`${item.label} > ${child.label}`);
      }
    } else {
      options.push(item.label);
    }
  }
  return options;
}

/**
 * Same access-gated page shell as Organizational structure / Create job
 * posting. Add item + table are a visual placeholder for now — nothing is
 * saved to the database yet (see the "Access control" submenu under User
 * Management in System Definitions).
 */
export default function SystemDefinitionsAccessControlPage() {
  const [items, setItems] = useState<PlaceholderItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const sidebarNavOptions = useMemo(() => getSidebarNavItemOptions(), []);

  const addItem = () => {
    const name = newItemName.trim();
    if (!name) return;
    setItems((prev) => [...prev, { id: crypto.randomUUID(), name }]);
    setNewItemName("");
    setShowAddForm(false);
  };

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const profile = users?.find((u) => u.user_id === session?.user?.id);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const { data: groupPresetData } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;
  const canView =
    accessProfile &&
    canPerformModuleAction(
      accessProfile,
      "sys:definitions",
      "view",
      sessionRole,
      groupPresets,
    );

  if (sessionLoading || usersLoading) {
    return (
      <div className="p-4 md:p-6 bg-gray-50 min-h-full">
        <div className="h-8 w-56 bg-gray-100 rounded animate-pulse mb-2" />
        <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 text-sm">
            System Definitions view access is required to open this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <Link
        href="/dashboard/system-definitions"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to System Definitions
      </Link>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-red-600" />
            Access control
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Nothing is saved yet — this is a placeholder while the page is
            being built out.
          </p>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add item
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 max-w-xl">
          <p className="text-sm font-semibold text-gray-800 mb-3">New item</p>

          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Item name
            </label>
            <select
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className={inputClass}
              autoFocus
            >
              <option value="">Select a sidebar item…</option>
              {sidebarNavOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addItem}
              disabled={!newItemName.trim()}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              Add item
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setNewItemName("");
              }}
              className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-4 py-2.5 font-medium">Item name</th>
              <th className="px-4 py-2.5 font-medium">Items</th>
              <th className="px-4 py-2.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm italic">
                  No items added yet.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 text-gray-900">{item.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">0</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
