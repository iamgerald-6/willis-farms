"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ORG_STRUCTURE_LISTS, type OrgStructureRow } from "@/lib/organizationalStructure";
import {
  ORG_MAPPING_PAIRS,
  type OrgMappingPairKey,
  type OrgMappingRow,
} from "@/lib/organizationalStructureMappings";

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

type MappingPanelProps = {
  pairKey: OrgMappingPairKey;
  open: boolean;
  onToggle: () => void;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
};

export default function MappingPanel({
  pairKey,
  open,
  onToggle,
  canView,
  canAdd,
  canEdit,
}: MappingPanelProps) {
  const queryClient = useQueryClient();
  const config = ORG_MAPPING_PAIRS[pairKey];
  const parentConfig = ORG_STRUCTURE_LISTS[config.parentListKey];
  const childConfig = ORG_STRUCTURE_LISTS[config.childListKey];

  const { data: parentRows, isLoading: parentLoading } = useQuery<OrgStructureRow[]>({
    queryKey: ["organizational_structure_list", config.parentListKey],
    queryFn: async () => {
      const res = await api.get(`/organizational-structure/${config.parentListKey}`);
      return res.data.data as OrgStructureRow[];
    },
    enabled: !!canView && open,
  });

  const { data: childRows, isLoading: childLoading } = useQuery<OrgStructureRow[]>({
    queryKey: ["organizational_structure_list", config.childListKey],
    queryFn: async () => {
      const res = await api.get(`/organizational-structure/${config.childListKey}`);
      return res.data.data as OrgStructureRow[];
    },
    enabled: !!canView && open,
  });

  const { data: mappings, isLoading: mappingsLoading } = useQuery<OrgMappingRow[]>({
    queryKey: ["organizational_structure_mappings", pairKey],
    queryFn: async () => {
      const res = await api.get(`/organizational-structure/mappings/${pairKey}`);
      return res.data.data as OrgMappingRow[];
    },
    enabled: !!canView && open,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["organizational_structure_mappings", pairKey],
    });

  const [newParentId, setNewParentId] = useState("");
  const [newChildId, setNewChildId] = useState("");

  // Child rows already mapped to the selected parent — excluded from the
  // dropdown so the same pair can't be added twice.
  const mappedChildIdsForParent = new Set(
    (mappings ?? [])
      .filter((m) => m.parent_id === newParentId)
      .map((m) => m.child_id),
  );
  const availableChildRows = (childRows ?? []).filter(
    (c) => !mappedChildIdsForParent.has(c.id),
  );

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/organizational-structure/mappings/${pairKey}`, {
        parent_id: newParentId,
        child_id: newChildId,
      });
      return res.data.data as OrgMappingRow;
    },
    onSuccess: () => {
      toast.success("Mapping added.");
      setNewParentId("");
      setNewChildId("");
      invalidate();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not add mapping.");
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<OrgMappingRow | null>(null);
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/organizational-structure/mappings/${pairKey}/${id}`);
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900">{config.title}</span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

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
                    <td className="px-4 py-2 text-gray-900">{row.parent_label}</td>
                    <td className="px-4 py-2 text-gray-700">{row.child_label}</td>
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
                ? `"${deleteTarget.parent_label}" will no longer be linked to "${deleteTarget.child_label}". This can't be undone.`
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
    </div>
  );
}
