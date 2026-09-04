"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { OrgStructureRow } from "@/lib/organizationalStructure";
import type { SiteBusinessUnitRow } from "@/app/api/organizational-structure/site-business-units/route";

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

export default function MappingSetupPage() {
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

  const { data: sites, isLoading: sitesLoading } = useQuery<OrgStructureRow[]>({
    queryKey: ["organizational_structure_list", "sites"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/sites");
      return res.data.data as OrgStructureRow[];
    },
    enabled: !!canView,
  });

  const { data: businessUnits, isLoading: businessUnitsLoading } = useQuery<
    OrgStructureRow[]
  >({
    queryKey: ["organizational_structure_list", "business-units"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/business-units");
      return res.data.data as OrgStructureRow[];
    },
    enabled: !!canView,
  });

  const { data: mappings, isLoading: mappingsLoading } = useQuery<
    SiteBusinessUnitRow[]
  >({
    queryKey: ["site_business_units"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/site-business-units");
      return res.data.data as SiteBusinessUnitRow[];
    },
    enabled: !!canView,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["site_business_units"] });

  const [newSiteId, setNewSiteId] = useState("");
  const [newBusinessUnitId, setNewBusinessUnitId] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/organizational-structure/site-business-units", {
        site_id: newSiteId,
        business_unit_id: newBusinessUnitId,
      });
      return res.data.data as SiteBusinessUnitRow;
    },
    onSuccess: () => {
      toast.success("Mapping added.");
      setNewSiteId("");
      setNewBusinessUnitId("");
      invalidate();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not add mapping.");
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<SiteBusinessUnitRow | null>(
    null,
  );
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/organizational-structure/site-business-units/${id}`);
    },
    onSuccess: () => {
      toast.success("Mapping removed.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not remove mapping.");
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

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <Link
        href="/dashboard/system-definitions"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to System Definitions
      </Link>

      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900">
          Mapping set up — Sites &amp; business units
        </h2>
      </div>

      {canAdd && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 max-w-xl">
          <p className="text-sm font-semibold text-gray-800 mb-3">Add mapping</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Site
              </label>
              <select
                value={newSiteId}
                onChange={(e) => setNewSiteId(e.target.value)}
                className={inputClass}
                disabled={sitesLoading}
              >
                <option value="">Select a site</option>
                {(sites ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Business unit
              </label>
              <select
                value={newBusinessUnitId}
                onChange={(e) => setNewBusinessUnitId(e.target.value)}
                className={inputClass}
                disabled={businessUnitsLoading}
              >
                <option value="">Select a business unit</option>
                {(businessUnits ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || !newSiteId || !newBusinessUnitId}
            className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {addMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Add mapping
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden max-w-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-500">
              <th className="px-4 py-2.5 font-medium">Site</th>
              <th className="px-4 py-2.5 font-medium">Business unit</th>
              {canEdit && <th className="px-4 py-2.5 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {mappingsLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {!mappingsLoading && (mappings ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  Nothing here yet.
                </td>
              </tr>
            )}
            {(mappings ?? []).map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-900">{row.site_label}</td>
                <td className="px-4 py-2 text-gray-700">{row.business_unit_label}</td>
                {canEdit && (
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(row)}
                      aria-label="Remove mapping"
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove this mapping?"
        message={
          deleteTarget
            ? `"${deleteTarget.site_label}" will no longer be linked to "${deleteTarget.business_unit_label}". This can't be undone.`
            : ""
        }
        confirmLabel="Remove"
        destructive
        confirming={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
