"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, UserCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

// Alphabetical, per spec.
const ACTION_OPTIONS = ["Add", "Approve", "Edit", "Review", "View"] as const;

// Placeholder only — nothing here is persisted yet.
type SelectedAction = {
  id: string;
  name: string;
};

/**
 * Manage setup page for a single Access control item (reached from the
 * "Manage" button on the main Access control table). Lets the user build up
 * a list of "what you can do" actions for this item — visual placeholder
 * only, same as the parent page.
 */
export default function AccessControlItemSetupPage() {
  const params = useParams<{ item: string }>();
  const itemName = decodeURIComponent(params?.item ?? "");

  const [selectedActions, setSelectedActions] = useState<SelectedAction[]>([]);
  const [newAction, setNewAction] = useState("");

  const availableActions = useMemo(
    () => ACTION_OPTIONS.filter((a) => !selectedActions.some((s) => s.name === a)),
    [selectedActions],
  );

  const addAction = () => {
    const name = newAction.trim();
    if (!name) return;
    setSelectedActions((prev) => [...prev, { id: crypto.randomUUID(), name }]);
    setNewAction("");
    toast.success("Added.");
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
        href="/dashboard/system-definitions/access-control"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Access control
      </Link>

      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-red-600" />
          Manage: {itemName}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Nothing is saved yet — this is a placeholder while the page is being
          built out.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 max-w-xl">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
          What you can do
        </label>
        <div className="flex items-center gap-2">
          <select
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            className={inputClass}
          >
            <option value="">Select an action…</option>
            {availableActions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addAction}
            disabled={!newAction.trim()}
            className="shrink-0 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {selectedActions.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-gray-400 text-sm italic">
                  No actions added yet.
                </td>
              </tr>
            ) : (
              selectedActions.map((action) => (
                <tr key={action.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 text-gray-900">{action.name}</td>
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
