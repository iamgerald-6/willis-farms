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
import { GHANA_REGIONS } from "@/lib/organizationalStructure";
import type {
  CustomFieldDef,
  OrgCustomListItem,
  OrgCustomListType,
} from "@/lib/organizationalStructureCustomLists";

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

type FieldValues = Record<string, string>;

function emptyFieldValues(fields: CustomFieldDef[]): FieldValues {
  return Object.fromEntries(fields.map((f) => [f.key, ""]));
}

function fieldValuesFromItem(item: OrgCustomListItem, fields: CustomFieldDef[]): FieldValues {
  return Object.fromEntries(
    fields.map((f) => {
      const value = item[f.key];
      if (f.type === "boolean") return [f.key, value ? "true" : "false"];
      return [f.key, value === null || value === undefined ? "" : String(value)];
    }),
  );
}

function toCustomFieldsPayload(values: FieldValues, fields: CustomFieldDef[]) {
  const payload: Record<string, string | number | boolean | null> = {};
  for (const f of fields) {
    const raw = values[f.key] ?? "";
    if (f.type === "boolean") {
      payload[f.key] = raw === "true";
    } else if (f.type === "number") {
      payload[f.key] = raw === "" ? null : Number(raw);
    } else {
      payload[f.key] = raw.trim() || null;
    }
  }
  return payload;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "boolean") {
    return (
      <select value={value || "false"} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="false">No</option>
        <option value="true">Yes</option>
      </select>
    );
  }
  if (field.type === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Select {field.label.toLowerCase()}</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "date") {
    return (
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    );
  }
  if (field.type === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    );
  }
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
  );
}

export default function ManageCustomListPage() {
  const params = useParams();
  const listTypeId = (params?.id as string) ?? "";
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

  const { data: listTypes, isLoading: listTypesLoading } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/custom-list-types");
      return res.data.data as OrgCustomListType[];
    },
    enabled: !!canView,
  });
  const config = listTypes?.find((t) => t.id === listTypeId);
  const fields = config?.fields ?? [];

  const { data: items, isLoading: itemsLoading } = useQuery<OrgCustomListItem[]>({
    queryKey: ["organizational_structure_custom_list_items", listTypeId],
    queryFn: async () => {
      const res = await api.get(
        `/organizational-structure/custom-list-types/${listTypeId}/items`,
      );
      return res.data.data as OrgCustomListItem[];
    },
    enabled: !!canView && !!listTypeId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["organizational_structure_custom_list_items", listTypeId],
    });
    queryClient.invalidateQueries({
      queryKey: ["organizational_structure_custom_list_types"],
    });
  };

  // Add form state
  const [newLabel, setNewLabel] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newActive, setNewActive] = useState(true);
  const [newFieldValues, setNewFieldValues] = useState<FieldValues>({});

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(
        `/organizational-structure/custom-list-types/${listTypeId}/items`,
        {
          label: newLabel.trim(),
          region: config?.has_region ? newRegion.trim() || null : undefined,
          notes: newNotes.trim() || null,
          is_active: newActive,
          custom_fields: toCustomFieldsPayload(newFieldValues, fields),
        },
      );
      return res.data.data as OrgCustomListItem;
    },
    onSuccess: () => {
      toast.success(`${config?.singular ?? "Item"} added.`);
      setNewLabel("");
      setNewRegion("");
      setNewNotes("");
      setNewActive(true);
      setNewFieldValues(emptyFieldValues(fields));
      invalidate();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not add item.");
    },
  });

  // Numeric-range generator state (Age, Salary, etc.)
  const [rangeMin, setRangeMin] = useState("");
  const [rangeMax, setRangeMax] = useState("");
  const [rangeLength, setRangeLength] = useState("");
  const isBandsMode = config?.numeric_range_mode === "bands";

  const generateRangeMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(
        `/organizational-structure/custom-list-types/${listTypeId}/items/generate-range`,
        {
          min: Number(rangeMin),
          max: Number(rangeMax),
          ...(isBandsMode ? { length: Number(rangeLength) } : {}),
        },
      );
      return res.data.added as number;
    },
    onSuccess: (added) => {
      toast.success(
        added > 0
          ? `Added ${added} ${isBandsMode ? "range" : "number"}${added === 1 ? "" : "s"}.`
          : "Those already exist in the list.",
      );
      setRangeMin("");
      setRangeMax("");
      setRangeLength("");
      invalidate();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not generate range.");
    },
  });

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editFieldValues, setEditFieldValues] = useState<FieldValues>({});

  const startEdit = (row: OrgCustomListItem) => {
    setEditingId(row.id);
    setEditLabel(row.label);
    setEditRegion(row.region ?? "");
    setEditNotes(row.notes ?? "");
    setEditActive(row.is_active);
    setEditFieldValues(fieldValuesFromItem(row, fields));
  };

  const editMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(
        `/organizational-structure/custom-list-types/${listTypeId}/items/${id}`,
        {
          label: editLabel.trim(),
          region: config?.has_region ? editRegion.trim() || null : undefined,
          notes: editNotes.trim() || null,
          is_active: editActive,
          custom_fields: toCustomFieldsPayload(editFieldValues, fields),
        },
      );
      return res.data.data as OrgCustomListItem;
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
  const [deleteTarget, setDeleteTarget] = useState<OrgCustomListItem | null>(null);
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(
        `/organizational-structure/custom-list-types/${listTypeId}/items/${id}`,
      );
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

  if (sessionLoading || usersLoading || listTypesLoading) {
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

  if (!config) {
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

      {canAdd && config.is_numeric_range && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 max-w-lg">
          <p className="text-sm font-semibold text-gray-800 mb-3">Fill {config.label.toLowerCase()}</p>
          <p className="text-xs text-gray-500 mb-3">
            {isBandsMode
              ? "Enter a minimum, maximum, and range length — bucketed ranges will be added (e.g. 1000-2000, 2000-3000...)."
              : "Enter a minimum and maximum and every whole number in between will be added."}{" "}
            Entries already in the list are skipped.
          </p>
          <div className={`grid ${isBandsMode ? "grid-cols-3" : "grid-cols-2"} gap-3 mb-3`}>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Minimum
              </label>
              <input
                type="number"
                value={rangeMin}
                onChange={(e) => setRangeMin(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Maximum
              </label>
              <input
                type="number"
                value={rangeMax}
                onChange={(e) => setRangeMax(e.target.value)}
                className={inputClass}
              />
            </div>
            {isBandsMode && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Range length
                </label>
                <input
                  type="number"
                  value={rangeLength}
                  onChange={(e) => setRangeLength(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => generateRangeMutation.mutate()}
            disabled={
              generateRangeMutation.isPending ||
              rangeMin === "" ||
              rangeMax === "" ||
              Number(rangeMin) > Number(rangeMax) ||
              (isBandsMode && (rangeLength === "" || Number(rangeLength) <= 0))
            }
            className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {generateRangeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Generate
          </button>
        </div>
      )}

      {canAdd && !config.is_numeric_range && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 max-w-lg">
          <p className="text-sm font-semibold text-gray-800 mb-3">Add {config.singular}</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                Label
              </label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className={inputClass}
              />
            </div>
            {config.has_region && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  Region
                </label>
                <select value={newRegion} onChange={(e) => setNewRegion(e.target.value)} className={inputClass}>
                  <option value="">Select a region</option>
                  {GHANA_REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {fields.map((field) => (
              <div key={field.key}>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
                  {field.label}
                </label>
                <FieldInput
                  field={field}
                  value={newFieldValues[field.key] ?? ""}
                  onChange={(value) =>
                    setNewFieldValues((prev) => ({ ...prev, [field.key]: value }))
                  }
                />
              </div>
            ))}
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
              {config.has_region && <th className="px-4 py-2.5 font-medium">Region</th>}
              {fields.map((field) => (
                <th key={field.key} className="px-4 py-2.5 font-medium">
                  {field.label}
                </th>
              ))}
              <th className="px-4 py-2.5 font-medium">Active</th>
              <th className="px-4 py-2.5 font-medium">Updated</th>
              {canEdit && <th className="px-4 py-2.5 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {itemsLoading && (
              <tr>
                <td colSpan={99} className="px-4 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {!itemsLoading && (items ?? []).length === 0 && (
              <tr>
                <td colSpan={99} className="px-4 py-6 text-center text-gray-400">
                  Nothing here yet.
                </td>
              </tr>
            )}
            {(items ?? []).map((row) => {
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
                  {config.has_region && (
                    <td className="px-4 py-2 align-top">
                      {isEditing ? (
                        <select
                          value={editRegion}
                          onChange={(e) => setEditRegion(e.target.value)}
                          className={inputClass}
                        >
                          <option value="">Select a region</option>
                          {GHANA_REGIONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-700">{row.region ?? "—"}</span>
                      )}
                    </td>
                  )}
                  {fields.map((field) => (
                    <td key={field.key} className="px-4 py-2 align-top">
                      {isEditing ? (
                        <FieldInput
                          field={field}
                          value={editFieldValues[field.key] ?? ""}
                          onChange={(value) =>
                            setEditFieldValues((prev) => ({ ...prev, [field.key]: value }))
                          }
                        />
                      ) : (
                        <span className="text-gray-700">
                          {(() => {
                            const value = row[field.key];
                            if (value === null || value === undefined || value === "") return "—";
                            if (field.type === "boolean") return value ? "Yes" : "No";
                            return String(value);
                          })()}
                        </span>
                      )}
                    </td>
                  ))}
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
