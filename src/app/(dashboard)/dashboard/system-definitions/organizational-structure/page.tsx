"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import {
  ORG_STRUCTURE_LIST_KEYS,
  type OrgStructureListKey,
} from "@/lib/organizationalStructure";
import {
  CUSTOM_FIELD_TYPES,
  type CustomFieldDef,
  type CustomFieldType,
  type OrgCustomListType,
} from "@/lib/organizationalStructureCustomLists";

type ListCount = { key: OrgStructureListKey; label: string; count: number };

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

type DraftField = {
  label: string;
  type: CustomFieldType;
  options: string;
};

export default function OrganizationalStructurePage() {
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
    canPerformModuleAction(
      accessProfile,
      "sys:definitions",
      "view",
      sessionRole,
      groupPresets,
    );
  const canAdd =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "add", sessionRole, groupPresets);

  const { data: lists, isLoading: listsLoading } = useQuery<ListCount[]>({
    queryKey: ["organizational_structure_summary"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure");
      return res.data.data as ListCount[];
    },
    enabled: !!canView,
  });

  const { data: customListTypes, isLoading: customListTypesLoading } = useQuery<
    OrgCustomListType[]
  >({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/custom-list-types");
      return res.data.data as OrgCustomListType[];
    },
    enabled: !!canView,
  });

  // New list builder form state
  const [showNewListForm, setShowNewListForm] = useState(false);
  const [newListLabel, setNewListLabel] = useState("");
  const [newListHasRegion, setNewListHasRegion] = useState(false);
  const [newListIsNumericRange, setNewListIsNumericRange] = useState(false);
  const [newListFields, setNewListFields] = useState<DraftField[]>([]);

  const addFieldRow = () =>
    setNewListFields((prev) => [...prev, { label: "", type: "text", options: "" }]);
  const removeFieldRow = (index: number) =>
    setNewListFields((prev) => prev.filter((_, i) => i !== index));
  const updateFieldRow = (index: number, updates: Partial<DraftField>) =>
    setNewListFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f)),
    );

  const resetNewListForm = () => {
    setNewListLabel("");
    setNewListHasRegion(false);
    setNewListIsNumericRange(false);
    setNewListFields([]);
    setShowNewListForm(false);
  };

  const createListMutation = useMutation({
    mutationFn: async () => {
      const fields: (Omit<CustomFieldDef, "key"> & { options?: string[] })[] =
        newListFields
          .filter((f) => f.label.trim())
          .map((f) => ({
            label: f.label.trim(),
            type: f.type,
            ...(f.type === "select"
              ? {
                  options: f.options
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean),
                }
              : {}),
          }));

      const res = await api.post("/organizational-structure/custom-list-types", {
        label: newListLabel.trim(),
        has_region: newListHasRegion,
        is_numeric_range: newListIsNumericRange,
        fields: newListIsNumericRange ? [] : fields,
      });
      return res.data.data as OrgCustomListType;
    },
    onSuccess: () => {
      toast.success("List added.");
      resetNewListForm();
      queryClient.invalidateQueries({
        queryKey: ["organizational_structure_custom_list_types"],
      });
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not add list.");
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

  const countFor = (key: OrgStructureListKey) =>
    lists?.find((l) => l.key === key)?.count;

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
            <Building2 className="w-5 h-5 text-red-600" />
            Organizational structure
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Company-wide lists. Sites, business units, departments, sections,
            and grade levels are managed here.
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={() => setShowNewListForm((prev) => !prev)}
            className="shrink-0 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add new list
          </button>
        )}
      </div>

      {showNewListForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 max-w-xl">
          <p className="text-sm font-semibold text-gray-800 mb-3">New list</p>

          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              List name
            </label>
            <input
              type="text"
              value={newListLabel}
              onChange={(e) => setNewListLabel(e.target.value)}
              placeholder="e.g. Cost centres"
              className={inputClass}
            />
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={newListIsNumericRange}
              onChange={(e) => setNewListIsNumericRange(e.target.checked)}
              className="accent-red-600 w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-700">
              This is a range of numbers (e.g. Age, Salary)
            </span>
          </label>
          {newListIsNumericRange && (
            <p className="text-xs text-gray-500 -mt-3 mb-4">
              Instead of typing items one at a time, Manage will let you fill this list
              by entering a minimum and maximum number.
            </p>
          )}

          {!newListIsNumericRange && (
            <>
              <label className="inline-flex items-center gap-2 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={newListHasRegion}
                  onChange={(e) => setNewListHasRegion(e.target.checked)}
                  className="accent-red-600 w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700">
                  Include a region field (like Sites)
                </span>
              </label>

              <div className="mb-4 bg-gray-50 border border-gray-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Included by default
                </p>
                <p className="text-xs text-gray-500">
                  Label, code (auto), sort order (auto), active toggle, notes
                </p>
              </div>

              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Extra fields (optional)
                </p>
                <button
                  type="button"
                  onClick={addFieldRow}
                  className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add field
                </button>
              </div>

              {newListFields.length > 0 && (
                <div className="space-y-2 mb-4">
                  {newListFields.map((field, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateFieldRow(index, { label: e.target.value })}
                        placeholder="Field name"
                        className={`${inputClass} flex-1`}
                      />
                      <select
                        value={field.type}
                        onChange={(e) =>
                          updateFieldRow(index, { type: e.target.value as CustomFieldType })
                        }
                        className={`${inputClass} w-36 shrink-0`}
                      >
                        {CUSTOM_FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeFieldRow(index)}
                        aria-label="Remove field"
                        className="text-gray-400 hover:text-red-600 mt-2 shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      {field.type === "select" && (
                        <input
                          type="text"
                          value={field.options}
                          onChange={(e) => updateFieldRow(index, { options: e.target.value })}
                          placeholder="Options, comma separated"
                          className={`${inputClass} basis-full`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => createListMutation.mutate()}
              disabled={createListMutation.isPending || !newListLabel.trim()}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
            >
              {createListMutation.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              Create list
            </button>
            <button
              type="button"
              onClick={resetNewListForm}
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
              <th className="px-4 py-2.5 font-medium">List name</th>
              <th className="px-4 py-2.5 font-medium">Items</th>
              <th className="px-4 py-2.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {ORG_STRUCTURE_LIST_KEYS.map((key) => {
              const label = lists?.find((l) => l.key === key)?.label ?? key;
              const count = countFor(key);
              return (
                <tr key={key} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 text-gray-900">{label}</td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {listsLoading || count === undefined ? "…" : count}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/dashboard/system-definitions/organizational-structure/${key}`}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(customListTypes ?? []).map((listType) => (
              <tr key={listType.id} className="border-t border-gray-100">
                <td className="px-4 py-2.5 text-gray-900">{listType.label}</td>
                <td className="px-4 py-2.5 text-gray-500">
                  {customListTypesLoading ? "…" : listType.item_count ?? 0}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/dashboard/system-definitions/organizational-structure/custom/${listType.id}`}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
