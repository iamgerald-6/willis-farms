"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import { buildSidebarNav } from "@/lib/moduleRegistry/navigation/buildSidebarNav";

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

type AccessControlItemAction = {
  id: string;
  action_label: string;
};

type AccessControlItem = {
  id: string;
  sidebar_item: string;
  sidebar_submenu_item: string | null;
  access_control_item_actions?: AccessControlItemAction[];
};

/** Top-level sidebar labels, each with its sub-menu labels (empty when flat). */
type NavOption = { label: string; children: string[] };

/**
 * The platform's actual sidebar navigation (built from the module registry —
 * same source Sidebar.tsx renders from), reduced to just labels for the two
 * cascading dropdowns below.
 */
function getSidebarNavOptions(): NavOption[] {
  return buildSidebarNav().map((item) => ({
    label: item.label,
    children: (item.children ?? []).map((child) => child.label),
  }));
}

function displayName(item: AccessControlItem) {
  return item.sidebar_submenu_item
    ? `${item.sidebar_item} > ${item.sidebar_submenu_item}`
    : item.sidebar_item;
}

/**
 * Same access-gated page shell as Organizational structure / Create job
 * posting. Backed by the access_control_items / access_control_item_actions
 * tables (docs/access-control/access-control-tables.sql) — same pattern as
 * Organizational structure's custom lists: no Postgres RLS, access enforced
 * in the API routes via requireSystemDefinitionsAccess.
 */
export default function SystemDefinitionsAccessControlPage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedTopLevel, setSelectedTopLevel] = useState("");
  const [selectedSubmenu, setSelectedSubmenu] = useState("");
  const navOptions = useMemo(() => getSidebarNavOptions(), []);

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

  const { data: items, isLoading: itemsLoading } = useQuery<AccessControlItem[]>({
    queryKey: ["access_control_items"],
    queryFn: async () => {
      const res = await api.get("/access-control/items");
      return res.data.data as AccessControlItem[];
    },
    enabled: !!canView,
  });

  const allItems = items ?? [];

  const isFlatItemAdded = (label: string) =>
    allItems.some((i) => i.sidebar_item === label && !i.sidebar_submenu_item);

  const isSubmenuItemAdded = (label: string, child: string) =>
    allItems.some((i) => i.sidebar_item === label && i.sidebar_submenu_item === child);

  // A group stays selectable while it still has an un-added child; a flat
  // item drops out once it's been added.
  const availableTopLevel = navOptions.filter((option) =>
    option.children.length > 0
      ? option.children.some((child) => !isSubmenuItemAdded(option.label, child))
      : !isFlatItemAdded(option.label),
  );

  const selectedNavOption = navOptions.find((o) => o.label === selectedTopLevel);
  const availableSubmenuOptions =
    selectedNavOption?.children.filter(
      (child) => !isSubmenuItemAdded(selectedTopLevel, child),
    ) ?? [];

  const resetAddForm = () => {
    setSelectedTopLevel("");
    setSelectedSubmenu("");
    setShowAddForm(false);
  };

  const addItemMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/access-control/items", {
        sidebar_item: selectedTopLevel,
        sidebar_submenu_item: selectedSubmenu || null,
      });
      return res.data.data as AccessControlItem;
    },
    onSuccess: () => {
      toast.success("Item added.");
      resetAddForm();
      queryClient.invalidateQueries({ queryKey: ["access_control_items"] });
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not add item.");
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/access-control/items/${id}`);
    },
    onSuccess: () => {
      toast.success("Item removed.");
      queryClient.invalidateQueries({ queryKey: ["access_control_items"] });
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not remove item.");
    },
  });

  const canAdd =
    !!selectedTopLevel &&
    (selectedNavOption && selectedNavOption.children.length > 0
      ? !!selectedSubmenu
      : true);

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
            Choose a sidebar item (and its sub-menu item, where it has one) to
            set up what people can do with it.
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
              value={selectedTopLevel}
              onChange={(e) => {
                setSelectedTopLevel(e.target.value);
                setSelectedSubmenu("");
              }}
              className={inputClass}
              autoFocus
            >
              <option value="">Select a sidebar item…</option>
              {availableTopLevel.map((option) => (
                <option key={option.label} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {selectedNavOption && selectedNavOption.children.length > 0 && (
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Sub-menu item
              </label>
              <select
                value={selectedSubmenu}
                onChange={(e) => setSelectedSubmenu(e.target.value)}
                className={inputClass}
                autoFocus
              >
                <option value="">Select a sub-menu item…</option>
                {availableSubmenuOptions.map((child) => (
                  <option key={child} value={child}>
                    {child}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addItemMutation.mutate()}
              disabled={!canAdd || addItemMutation.isPending}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              Add item
            </button>
            <button
              type="button"
              onClick={resetAddForm}
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
            {itemsLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm italic">
                  Loading…
                </td>
              </tr>
            ) : allItems.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm italic">
                  No items added yet.
                </td>
              </tr>
            ) : (
              allItems.map((item) => (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 text-gray-900">{displayName(item)}</td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {item.access_control_item_actions?.length ?? 0}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/dashboard/system-definitions/access-control/${item.id}`}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Manage
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItemMutation.mutate(item.id)}
                        title="Remove"
                        className="inline-flex items-center p-1.5 border border-gray-200 text-gray-400 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
