"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  ORG_STRUCTURE_LISTS,
  isOrgStructureListKey,
  type OrgStructureRow,
} from "@/lib/organizationalStructure";

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

export default function ManageOrgStructureListPage() {
  const params = useParams();
  const listParam = (params?.list as string) ?? "";
  const queryClient = useQueryClient();

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
    canPerformModuleAction(accessProfile, "sys:definitions", "view", sessionRole, groupPresets);
  const canAdd =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "add", sessionRole, groupPresets);
  const canEdit =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "edit", sessionRole, groupPresets);

  const isValidList = isOrgStructureListKey(listParam);
  const config = isValidList ? ORG_STRUCTURE_LISTS[listParam] : null;

  const { data: rows, isLoading: rowsLoading } = useQuery<OrgStructureRow[]>({
    queryKey: ["organizational_structure_list", listParam],
    queryFn: async () => {
      const res = await api.get(`/organizational-structure/${listParam}`);
      return res.data.data as OrgStructureRow[];
    },
    enabled: !!canView && isValidList,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["organizational_structure_list", listParam] });
    queryClient.invalidateQueries({ queryKey: ["organizational_structure_summary"] });
  };

  // Add form state
  const [newLabel, setNewLabel] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newActive, setNewActive] = useState(true);

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/organizational-structure/${listParam}`, {
        label: newLabel.trim(),
        region: config?.hasRegion ? newRegion.trim() || null : undefined,
        notes: newNotes.trim() || null,
        is_active: newActive,
      });
      return res.data.data as OrgStructureRow;
    },
    onSuccess: () => {
      toast.success(`${config?.singular ?? "Item"} added.`);
      setNewLabel("");
      setNewRegion("");
      setNewNotes("");
      setNewActive(true);
      invalidate();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not add item.");
    },
  });

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editActive, setEditActive] = useState(true);

  const startEdit = (row: OrgStructureRow) => {
    setEditingId(row.id);
    setEditLabel(row.label);
    setEditRegion(row.region ?? "");
    setEditNotes(row.notes ?? "");
    setEditActive(row.is_active);
  };

  const editMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/organizational-structure/${listParam}/${id}`, {
        label: editLabel.trim(),
        region: config?.hasRegion ? editRegion.trim() || null : undefined,
        notes: editNotes.trim() || null,
        is_active: editActive,
      });
      return res.data.data as OrgStructureRow;
    },
    onSuccess: () => {
      toast.success("Saved.");
      setEditingId(null);
      invalidate();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not save changes.");
    },
  });

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<OrgStructureRow | null>(null);
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/organizational-structure/${listParam}/${id}`);
    },
    onSuccess: () => {
      toast.success("Deleted.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not delete.");
    },
  });

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

  if (!isValidList || !config) {
    return (
      <div className="p-6">
        <Link
          href="/dashboard/system-definitions/organizational-structure"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to organizational structure
        </Link>
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 text-sm">Unknown list.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <Link
        href="/dashboard/system-definitions/organizational-structure"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to organizational structure
      </Link>

      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900">Manage — {config.label}</h2>
      </div>

      {canAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 max-w-lg">
          <p className="text-sm font-semibold text-gray-800 mb-3">
            Add {config.singular}
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Label
              </label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={`e.g. ${config.key === "sites" ? "Nsawam" : "Livestock production"}`}
                className={inputClass}
              />
            </div>
            {config.hasRegion && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Region
                </label>
                <input
                  type="text"
                  value={newRegion}
                  onChange={(e) => setNewRegion(e.target.value)}
                  placeholder="e.g. Eastern region"
                  className={inputClass}
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Notes (optional)
              </label>
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Any internal notes"
                className={inputClass}
              />
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newActive}
                onChange={(e) => setNewActive(e.target.checked)}
                className="accent-red-600 w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>
            <div>
              <button
                type="button"
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending || !newLabel.trim()}
                className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
              >
                {addMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Add {config.singular}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-4 py-2.5 font-medium">Label</th>
              <th className="px-4 py-2.5 font-medium">Code</th>
              {config.hasRegion && <th className="px-4 py-2.5 font-medium">Region</th>}
              <th className="px-4 py-2.5 font-medium">Active</th>
              <th className="px-4 py-2.5 font-medium">Updated</th>
              {canEdit && <th className="px-4 py-2.5 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rowsLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {!rowsLoading && (rows ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Nothing here yet.
                </td>
              </tr>
            )}
            {(rows ?? []).map((row) => {
              const isEditing = editingId === row.id;
              return (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 align-top">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className={inputClass}
                      />
                    ) : (
                      <span className="text-gray-900">{row.label}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top text-gray-400 font-mono text-xs">
                    {row.code}
                  </td>
                  {config.hasRegion && (
                    <td className="px-4 py-2 align-top">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editRegion}
                          onChange={(e) => setEditRegion(e.target.value)}
                          className={inputClass}
                        />
                      ) : (
                        <span className="text-gray-700">{row.region ?? "—"}</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2 align-top">
                    {isEditing ? (
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(e) => setEditActive(e.target.checked)}
                        className="accent-red-600 w-4 h-4"
                      />
                    ) : row.is_active ? (
                      <span className="text-green-700">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top text-gray-400">
                    {new Date(row.updated_at).toLocaleDateString()}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 align-top text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => editMutation.mutate(row.id)}
                            disabled={editMutation.isPending || !editLabel.trim()}
                            aria-label="Save"
                            className="text-green-600 hover:text-green-700 disabled:opacity-60"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            aria-label="Cancel"
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            aria-label="Edit"
                            className="text-gray-400 hover:text-gray-700"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            aria-label="Delete"
                            className="text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete this ${config.singular}?`}
        message={`"${deleteTarget?.label}" will be permanently removed from ${config.label}. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        confirming={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
