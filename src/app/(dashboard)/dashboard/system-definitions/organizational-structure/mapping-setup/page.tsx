"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import type { OrgMappingGroup } from "@/lib/organizationalStructureMappings";
import type { OrgCustomListType } from "@/lib/organizationalStructureCustomLists";
import MappingPanel from "./MappingPanel";

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

  const { data: mappingGroups, isLoading: groupsLoading } = useQuery<OrgMappingGroup[]>({
    queryKey: ["organizational_structure_mapping_groups"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/mapping-groups");
      return res.data.data as OrgMappingGroup[];
    },
    enabled: !!canView,
  });

  const { data: customListTypes } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/custom-list-types");
      return res.data.data as OrgCustomListType[];
    },
    enabled: !!canView,
  });

  // Every list an admin can pick from when creating a mapping group — all
  // of them now live in org_custom_list_types.
  const listOptions = (customListTypes ?? []).map((t) => ({
    value: t.id,
    label: t.label,
  }));
  const listLabelByValue = new Map(listOptions.map((o) => [o.value, o.label]));

  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newParentListKey, setNewParentListKey] = useState("");
  const [newChildListKey, setNewChildListKey] = useState("");

  const existingPairKeys = new Set(
    (mappingGroups ?? []).flatMap((g) => [
      `${g.parent_list_key}|${g.child_list_key}`,
      `${g.child_list_key}|${g.parent_list_key}`,
    ]),
  );
  const availableChildListOptions = listOptions.filter(
    (opt) =>
      opt.value !== newParentListKey &&
      !(newParentListKey && existingPairKeys.has(`${newParentListKey}|${opt.value}`)),
  );

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/organizational-structure/mapping-groups", {
        parent_list_key: newParentListKey,
        child_list_key: newChildListKey,
      });
      return res.data.data as OrgMappingGroup;
    },
    onSuccess: (group) => {
      toast.success("Mapping group added.");
      setNewParentListKey("");
      setNewChildListKey("");
      setShowNewGroupForm(false);
      setOpenGroupId(group.id);
      queryClient.invalidateQueries({
        queryKey: ["organizational_structure_mapping_groups"],
      });
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not add mapping group.");
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

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Organizational structure mapping set up
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Link the items set up in Organizational structure to each other. Expand a
            section to add or remove a mapping.
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={() => setShowNewGroupForm((prev) => !prev)}
            className="shrink-0 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add mapping
          </button>
        )}
      </div>

      {showNewGroupForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 max-w-xl">
          <p className="text-sm font-semibold text-gray-800 mb-3">New mapping group</p>
          <p className="text-xs text-gray-500 mb-3">
            Pick any two lists to link. You'll add the individual pairs once the group
            is created.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                First list
              </label>
              <select
                value={newParentListKey}
                onChange={(e) => {
                  setNewParentListKey(e.target.value);
                  setNewChildListKey("");
                }}
                className={inputClass}
              >
                <option value="">Select a list</option>
                {listOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Second list
              </label>
              <select
                value={newChildListKey}
                onChange={(e) => setNewChildListKey(e.target.value)}
                className={inputClass}
                disabled={!newParentListKey}
              >
                <option value="">Select a list</option>
                {availableChildListOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {newParentListKey && availableChildListOptions.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Every other list is already mapped to{" "}
                  {(listLabelByValue.get(newParentListKey) ?? "").toLowerCase()}.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => createGroupMutation.mutate()}
              disabled={
                createGroupMutation.isPending || !newParentListKey || !newChildListKey
              }
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
            >
              {createGroupMutation.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              Create group
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewGroupForm(false);
                setNewParentListKey("");
                setNewChildListKey("");
              }}
              className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 max-w-3xl">
        {groupsLoading && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
            Loading…
          </div>
        )}
        {!groupsLoading && (mappingGroups ?? []).length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
            No mapping groups yet. Use "Add mapping" to create one.
          </div>
        )}
        {(mappingGroups ?? []).map((group) => (
          <MappingPanel
            key={group.id}
            group={group}
            open={openGroupId === group.id}
            onToggle={() =>
              setOpenGroupId((prev) => (prev === group.id ? null : group.id))
            }
            canView={!!canView}
            canAdd={!!canAdd}
            canEdit={!!canEdit}
          />
        ))}
      </div>
    </div>
  );
}
