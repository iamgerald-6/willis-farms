"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ORG_STRUCTURE_LISTS } from "@/lib/organizationalStructure";
import {
  parseListRef,
  type OrgListRef,
  type OrgMappingGroup,
  type OrgMappingRow,
} from "@/lib/organizationalStructureMappings";
import type { OrgCustomListType } from "@/lib/organizationalStructureCustomLists";

/** Minimal shape shared by fixed org structure rows and custom list items —
 * all the panel needs for the dropdowns and the table. */
type MappingSideRow = { id: string; label: string };

function urlForRef(ref: OrgListRef | null): string | null {
  if (!ref) return null;
  return ref.kind === "fixed"
    ? `/organizational-structure/${ref.key}`
    : `/organizational-structure/custom-list-types/${ref.id}/items`;
}

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

type MappingPanelProps = {
  group: OrgMappingGroup;
  open: boolean;
  onToggle: () => void;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
};

export default function MappingPanel({
  group,
  open,
  onToggle,
  canView,
  canAdd,
  canEdit,
}: MappingPanelProps) {
  const queryClient = useQueryClient();
  const parentRef = parseListRef(group.parent_list_key);
  const childRef = parseListRef(group.child_list_key);
  const needsCustomListTypes = parentRef?.kind === "custom" || childRef?.kind === "custom";

  const { data: customListTypes } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/custom-list-types");
      return res.data.data as OrgCustomListType[];
    },
    enabled: !!canView && open && needsCustomListTypes,
  });

  const configFor = (ref: OrgListRef | null): { label: string; singular: string } => {
    if (!ref) return { label: "Unknown", singular: "item" };
    if (ref.kind === "fixed") return ORG_STRUCTURE_LISTS[ref.key];
    const customType = customListTypes?.find((t) => t.id === ref.id);
    return { label: customType?.label ?? "Unknown", singular: customType?.singular ?? "item" };
  };
  const parentConfig = configFor(parentRef);
  const childConfig = configFor(childRef);
  const parentUrl = urlForRef(parentRef);
  const childUrl = urlForRef(childRef);

  const { data: parentRows, isLoading: parentLoading } = useQuery<MappingSideRow[]>({
    queryKey: ["organizational_structure_mapping_side", group.parent_list_key],
    queryFn: async () => {
      const res = await api.get(parentUrl as string);
      return res.data.data as MappingSideRow[];
    },
    enabled: !!canView && open && !!parentUrl,
  });

  const { data: childRows, isLoading: childLoading } = useQuery<MappingSideRow[]>({
    queryKey: ["organizational_structure_mapping_side", group.child_list_key],
    queryFn: async () => {
      const res = await api.get(childUrl as string);
      return res.data.data as MappingSideRow[];
    },
    enabled: !!canView && open && !!childUrl,
  });

  const { data: mappings, isLoading: mappingsLoading } = useQuery<OrgMappingRow[]>({
    queryKey: ["organizational_structure_mappings", group.id],
    queryFn: async () => {
      const res = await api.get(`/organizational-structure/mappings`, {
        params: { group_id: group.id },
      });
      return res.data.data as OrgMappingRow[];
    },
    enabled: !!canView && open,
  });

  const parentLabelById = new Map((parentRows ?? []).map((p) => [p.id, p.label]));
  const childLabelById = new Map((childRows ?? []).map((c) => [c.id, c.label]));

  const invalidateMappings = () =>
    queryClient.invalidateQueries({
      queryKey: ["organizational_structure_mappings", group.id],
    });

  const [newParentId, setNewParentId] = useState("");
  const [newChildId, setNewChildId] = useState("");

  // Child rows already mapped to the selected parent — excluded from the
  // dropdown so the same pair can't be added twice.
  const mappedChildIdsForParent = new Set(
    (mappings ?? [])
      .filter((m) => m.parent_row_id === newParentId)
      .map((m) => m.child_row_id),
  );
  const availableChildRows = (childRows ?? []).filter(
    (c) => !mappedChildIdsForParent.has(c.id),
  );

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/organizational-structure/mappings`, {
        group_id: group.id,
        parent_row_id: newParentId,
        child_row_id: newChildId,
      });
      return res.data.data as OrgMappingRow;
    },
    onSuccess: () => {
      toast.success("Mapping added.");
      setNewParentId("");
      setNewChildId("");
      invalidateMappings();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not add mapping.");
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<OrgMappingRow | null>(null);
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/organizational-structure/mappings/${id}`, {
        params: { group_id: group.id },
      });
    },
    onSuccess: () => {
      toast.success("Mapping removed.");
      setDeleteTarget(null);
      invalidateMappings();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not remove mapping.");
    },
  });

  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const deleteGroupMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/organizational-structure/mapping-groups/${group.id}`);
    },
    onSuccess: () => {
      toast.success("Mapping group removed.");
      setConfirmDeleteGroup(false);
      queryClient.invalidateQueries({
        queryKey: ["organizational_structure_mapping_groups"],
      });
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not remove mapping group.");
    },
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center gap-2.5 text-left"
        >
          <span className="text-sm font-semibold text-gray-900">{group.title}</span>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          {canEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDeleteGroup(true);
              }}
              aria-label="Delete mapping group"
              className="text-gray-300 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={onToggle} aria-label="Toggle mapping group">
            {open ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          {canAdd && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 mb-5 max-w-xl">
              <p className="text-sm font-semibold text-gray-800 mb-3">Add mapping</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {parentConfig.label}
                  </label>
                  <select
                    value={newParentId}
                    onChange={(e) => {
                      setNewParentId(e.target.value);
                      setNewChildId("");
                    }}
                    className={inputClass}
                    disabled={parentLoading}
                  >
                    <option value="">Select a {parentConfig.singular}</option>
                    {(parentRows ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                    {childConfig.label}
                  </label>
                  <select
                    value={newChildId}
                    onChange={(e) => setNewChildId(e.target.value)}
                    className={inputClass}
                    disabled={childLoading || !newParentId}
                  >
                    <option value="">Select a {childConfig.singular}</option>
                    {availableChildRows.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {newParentId && availableChildRows.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      All {childConfig.label.toLowerCase()} are already mapped to this{" "}
                      {parentConfig.singular}.
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending || !newParentId || !newChildId}
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
                  <th className="px-4 py-2.5 font-medium">{parentConfig.label}</th>
                  <th className="px-4 py-2.5 font-medium">{childConfig.label}</th>
                  {canEdit && (
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  )}
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
                    <td className="px-4 py-2 text-gray-900">
                      {parentLabelById.get(row.parent_row_id) ?? "Unknown"}
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {childLabelById.get(row.child_row_id) ?? "Unknown"}
                    </td>
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
                ? `"${parentLabelById.get(deleteTarget.parent_row_id) ?? "This item"}" will no longer be linked to "${
                    childLabelById.get(deleteTarget.child_row_id) ?? "that item"
                  }". This can't be undone.`
                : ""
            }
            confirmLabel="Remove"
            destructive
            confirming={deleteMutation.isPending}
            onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            onCancel={() => setDeleteTarget(null)}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteGroup}
        title="Delete this mapping group?"
        message={`"${group.title}" and every mapping in it will be removed. This can't be undone.`}
        confirmLabel="Delete group"
        destructive
        confirming={deleteGroupMutation.isPending}
        onConfirm={() => deleteGroupMutation.mutate()}
        onCancel={() => setConfirmDeleteGroup(false)}
      />
    </div>
  );
}
