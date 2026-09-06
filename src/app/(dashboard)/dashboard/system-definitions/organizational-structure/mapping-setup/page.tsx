"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Network } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import type { OrgCustomListType } from "@/lib/organizationalStructureCustomLists";

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";
const selectClass = `${inputClass} mt-1 disabled:bg-gray-50 disabled:text-gray-500`;

type Item = { id: string; label: string; is_active?: boolean; sort_order?: number };

type MappingLevel = {
  id: string;
  position: number;
  list_type_id: string;
  list_type: { id: string; label: string; singular: string; table_name: string };
};

type MappingNode = {
  id: string;
  level_id: string;
  item_id: string;
  parent_node_id: string | null;
};

const NODES_QUERY_KEY = ["org_mapping_nodes_list"];
const LEVELS_QUERY_KEY = ["org_mapping_levels_list"];

type ApiError = { response?: { data?: { error?: string } } };
const errorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

export default function OrgStructureMappingSetupPage() {
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
  const canEdit =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "edit", sessionRole, groupPresets);

  const { data: levelsRaw = [] } = useQuery<MappingLevel[]>({
    queryKey: LEVELS_QUERY_KEY,
    queryFn: async () => (await api.get("/organizational-structure/mapping-levels")).data.data,
    enabled: !!canView,
  });
  const levels = [...levelsRaw].sort((a, b) => a.position - b.position);

  const { data: nodes = [] } = useQuery<MappingNode[]>({
    queryKey: NODES_QUERY_KEY,
    queryFn: async () => (await api.get("/organizational-structure/mapping-nodes")).data.data,
    enabled: !!canView,
  });

  const { data: allListTypes = [] } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/custom-list-types");
      return res.data.data as OrgCustomListType[];
    },
    enabled: !!canView,
  });

  const itemQueries = useQueries({
    queries: levels.map((lvl) => ({
      queryKey: ["org_mapping_list_items", lvl.list_type_id],
      queryFn: async () => {
        const res = await api.get(`/organizational-structure/custom-list-types/${lvl.list_type_id}/items`);
        return (res.data.data as Item[])
          .filter((i) => i.is_active !== false)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      },
      enabled: !!canView,
    })),
  });
  const itemsByLevelId = new Map(levels.map((lvl, i) => [lvl.id, itemQueries[i]?.data ?? []]));

  const [selectedLevelId, setSelectedLevelId] = useState("");
  const [selectedItemPerLevel, setSelectedItemPerLevel] = useState<Record<string, string>>({});
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [selectedChildIds, setSelectedChildIds] = useState<Set<string>>(new Set());

  const activeLevelId = selectedLevelId || levels[0]?.id || "";
  const activeIndex = levels.findIndex((l) => l.id === activeLevelId);
  const activeLevel = activeIndex >= 0 ? levels[activeIndex] : null;
  const ancestorLevels = activeIndex > 0 ? levels.slice(0, activeIndex) : [];
  const nextLevel = activeIndex >= 0 && activeIndex < levels.length - 1 ? levels[activeIndex + 1] : null;

  function nodesForLevel(levelId: string): MappingNode[] {
    return nodes.filter((n) => n.level_id === levelId);
  }

  /** Every item of `level` currently valid under `parentNodeId` (null = root, for a level with no ancestors). */
  function childOptions(level: MappingLevel, parentNodeId: string | null): Item[] {
    const allItems = itemsByLevelId.get(level.id) ?? [];
    const ids = new Set(
      nodesForLevel(level.id)
        .filter((n) => n.parent_node_id === parentNodeId)
        .map((n) => n.item_id),
    );
    return allItems.filter((i) => ids.has(i.id));
  }

  /** The node id representing the full path chosen through ancestorLevels[0..uptoIndex] — null for "no ancestors" (root), undefined if the chain is incomplete or broken. */
  function resolveAncestorChainNodeId(uptoIndex: number): string | null | undefined {
    if (uptoIndex < 0) return null;
    let parentNodeId: string | null = null;
    for (let i = 0; i <= uptoIndex; i++) {
      const level = ancestorLevels[i];
      const itemId = selectedItemPerLevel[level.id];
      if (!itemId) return undefined;
      const node = nodesForLevel(level.id).find(
        (n) => n.item_id === itemId && n.parent_node_id === parentNodeId,
      );
      if (!node) return undefined;
      parentNodeId = node.id;
    }
    return parentNodeId;
  }

  function handleLevelChange(id: string) {
    setSelectedLevelId(id);
    setSelectedItemPerLevel({});
    setShowAddItem(false);
    setNewItemLabel("");
    setSelectedChildIds(new Set());
  }

  function handleAncestorChange(stepIndex: number, itemId: string) {
    setSelectedItemPerLevel((prev) => {
      const next = { ...prev, [ancestorLevels[stepIndex].id]: itemId };
      for (let j = stepIndex + 1; j < ancestorLevels.length; j++) {
        delete next[ancestorLevels[j].id];
      }
      return next;
    });
  }

  const addNodeMutation = useMutation({
    mutationFn: async (body: { level_id: string; item_id: string; parent_node_id: string | null }) => {
      const res = await api.post("/organizational-structure/mapping-nodes", body);
      return res.data.data as MappingNode;
    },
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: NODES_QUERY_KEY });
      const previous = queryClient.getQueryData<MappingNode[]>(NODES_QUERY_KEY) ?? [];
      const optimisticId = `optimistic-${Date.now()}-${Math.random()}`;
      queryClient.setQueryData<MappingNode[]>(NODES_QUERY_KEY, [
        ...previous,
        { id: optimisticId, ...body },
      ]);
      return { previous, optimisticId };
    },
    onError: (err, _body, context) => {
      if (context) queryClient.setQueryData(NODES_QUERY_KEY, context.previous);
      toast.error(errorMessage(err, "Could not add mapping."));
    },
    onSuccess: (data, _body, context) => {
      queryClient.setQueryData<MappingNode[]>(NODES_QUERY_KEY, (curr) =>
        (curr ?? []).map((n) => (n.id === context?.optimisticId ? data : n)),
      );
    },
  });

  const removeNodeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/organizational-structure/mapping-nodes/${id}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: NODES_QUERY_KEY });
      const previous = queryClient.getQueryData<MappingNode[]>(NODES_QUERY_KEY) ?? [];
      queryClient.setQueryData<MappingNode[]>(
        NODES_QUERY_KEY,
        previous.filter((n) => n.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context) queryClient.setQueryData(NODES_QUERY_KEY, context.previous);
      toast.error(errorMessage(err, "Could not remove mapping."));
    },
  });

  function toggleNode(
    existing: MappingNode | undefined,
    checked: boolean,
    levelId: string,
    itemId: string,
    parentNodeId: string | null,
  ) {
    if (checked) {
      if (!existing) addNodeMutation.mutate({ level_id: levelId, item_id: itemId, parent_node_id: parentNodeId });
    } else if (existing) {
      removeNodeMutation.mutate(existing.id);
    }
  }

  const addLevelMutation = useMutation({
    mutationFn: async (listTypeId: string) => {
      const res = await api.post("/organizational-structure/mapping-levels", { list_type_id: listTypeId });
      return res.data.data as MappingLevel;
    },
    onSuccess: (data) => {
      toast.success(`${data.list_type.label} added to the mapping chain.`);
      queryClient.invalidateQueries({ queryKey: LEVELS_QUERY_KEY });
      handleLevelChange(data.id);
    },
    onError: (err) => toast.error(errorMessage(err, "Could not add level.")),
  });

  const removeLevelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/organizational-structure/mapping-levels/${id}`);
    },
    onSuccess: () => {
      toast.success("Level removed.");
      queryClient.invalidateQueries({ queryKey: LEVELS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: NODES_QUERY_KEY });
      handleLevelChange("");
    },
    onError: (err) => toast.error(errorMessage(err, "Could not remove level.")),
  });

  const addItemMutation = useMutation({
    mutationFn: async () => {
      if (!activeLevel) throw new Error("Select a level first.");
      const parentNodeId = resolveAncestorChainNodeId(ancestorLevels.length - 1);
      if (parentNodeId === undefined) throw new Error("Select every level above first.");
      const label = newItemLabel.trim();
      if (!label) throw new Error("Enter a name.");

      const itemRes = await api.post(
        `/organizational-structure/custom-list-types/${activeLevel.list_type_id}/items`,
        { label },
      );
      const newItem = itemRes.data.data as Item;

      const nodeRes = await api.post("/organizational-structure/mapping-nodes", {
        level_id: activeLevel.id,
        item_id: newItem.id,
        parent_node_id: parentNodeId,
      });
      const newNode = nodeRes.data.data as MappingNode;

      if (nextLevel && selectedChildIds.size > 0) {
        await Promise.all(
          Array.from(selectedChildIds).map((childItemId) =>
            api.post("/organizational-structure/mapping-nodes", {
              level_id: nextLevel.id,
              item_id: childItemId,
              parent_node_id: newNode.id,
            }),
          ),
        );
      }
      return newItem;
    },
    onSuccess: () => {
      toast.success("Added.");
      setNewItemLabel("");
      setSelectedChildIds(new Set());
      setShowAddItem(false);
      if (activeLevel) {
        queryClient.invalidateQueries({ queryKey: ["org_mapping_list_items", activeLevel.list_type_id] });
      }
      queryClient.invalidateQueries({ queryKey: NODES_QUERY_KEY });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : errorMessage(err, "Could not add item.")),
  });

  const usedListTypeIds = new Set(levels.map((l) => l.list_type_id));
  const availableListTypesToAdd = allListTypes.filter(
    (lt) => lt.is_active !== false && !usedListTypeIds.has(lt.id),
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

  const ancestorReadyIndex = ancestorLevels.length - 1;
  const activeParentNodeId = resolveAncestorChainNodeId(ancestorReadyIndex);
  const activeItems = activeLevel ? itemsByLevelId.get(activeLevel.id) ?? [] : [];
  const activeLevelNodes = activeLevel ? nodesForLevel(activeLevel.id) : [];

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <Link
        href="/dashboard/system-definitions/organizational-structure"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Organizational structure
      </Link>

      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Network className="w-5 h-5 text-red-600" />
          Org structure mapping set up
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Add any org-structure list as a level, in the order you want it to cascade. Pick the
          level above's specific combination, then check off which items are valid there.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {levels.length === 0 ? (
          <p className="text-sm text-gray-400 mb-4">
            No levels yet — add the first one below to get started.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-gray-100">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Level</span>
              <select
                value={activeLevelId}
                onChange={(e) => handleLevelChange(e.target.value)}
                className={`${selectClass} min-w-[200px]`}
              >
                {levels.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.list_type.label}
                  </option>
                ))}
              </select>
            </label>
            {canEdit && activeLevel && (
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${activeLevel.list_type.label} from the mapping chain? This deletes every mapping under it too.`,
                    )
                  ) {
                    removeLevelMutation.mutate(activeLevel.id);
                  }
                }}
                className="text-xs text-gray-400 hover:text-red-600 mb-2"
              >
                Remove this level
              </button>
            )}
          </div>
        )}

        {canEdit && availableListTypesToAdd.length > 0 && (
          <label className="block max-w-xs mb-5">
            <span className="text-xs font-medium text-gray-600">+ Add level</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) addLevelMutation.mutate(e.target.value);
              }}
              className={selectClass}
              disabled={addLevelMutation.isPending}
            >
              <option value="">Choose a list to add…</option>
              {availableListTypesToAdd.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {activeLevel && (
          <div className="space-y-4 max-w-lg">
            {ancestorLevels.map((lvl, i) => {
              const parentId = resolveAncestorChainNodeId(i - 1);
              const options = parentId === undefined ? [] : childOptions(lvl, parentId);
              return (
                <label key={lvl.id} className="block">
                  <span className="text-xs font-medium text-gray-600">{lvl.list_type.label}</span>
                  <select
                    value={selectedItemPerLevel[lvl.id] ?? ""}
                    onChange={(e) => handleAncestorChange(i, e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Select {lvl.list_type.singular.toLowerCase()}…</option>
                    {options.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.label}
                      </option>
                    ))}
                  </select>
                  {options.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {parentId === undefined
                        ? "Select the level above first."
                        : `Nothing mapped here yet — set that up under ${lvl.list_type.label}.`}
                    </p>
                  )}
                </label>
              );
            })}

            {activeParentNodeId === undefined ? (
              <p className="text-sm text-gray-400">Select every level above first.</p>
            ) : (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {activeLevel.list_type.label}
                </p>
                {activeItems.length === 0 ? (
                  <p className="text-sm text-gray-400">No items in this list yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {activeItems.map((item) => {
                      const existing = activeLevelNodes.find(
                        (n) => n.item_id === item.id && n.parent_node_id === activeParentNodeId,
                      );
                      return (
                        <label
                          key={item.id}
                          className="flex items-center gap-2 text-sm text-gray-800 border border-gray-100 rounded-lg px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={!!existing}
                            disabled={!canEdit}
                            onChange={(e) =>
                              toggleNode(
                                existing,
                                e.target.checked,
                                activeLevel.id,
                                item.id,
                                activeParentNodeId,
                              )
                            }
                            className="accent-red-600 w-4 h-4"
                          />
                          {item.label}
                        </label>
                      );
                    })}
                  </div>
                )}

                {canEdit && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    {!showAddItem ? (
                      <button
                        type="button"
                        onClick={() => setShowAddItem(true)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        + Add new {activeLevel.list_type.singular.toLowerCase()}
                      </button>
                    ) : (
                      <div className="space-y-2 bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <input
                          type="text"
                          value={newItemLabel}
                          onChange={(e) => setNewItemLabel(e.target.value)}
                          placeholder={`New ${activeLevel.list_type.singular.toLowerCase()} name`}
                          className={inputClass}
                        />
                        {nextLevel && (
                          <div>
                            <p className="text-xs font-medium text-gray-600 mb-1">
                              Which {nextLevel.list_type.label.toLowerCase()} belong under this new{" "}
                              {activeLevel.list_type.singular.toLowerCase()}?
                            </p>
                            <div className="max-h-36 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2 bg-white">
                              {(itemsByLevelId.get(nextLevel.id) ?? []).map((child) => (
                                <label key={child.id} className="flex items-center gap-2 text-xs text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={selectedChildIds.has(child.id)}
                                    onChange={(e) => {
                                      setSelectedChildIds((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(child.id);
                                        else next.delete(child.id);
                                        return next;
                                      });
                                    }}
                                  />
                                  {child.label}
                                </label>
                              ))}
                              {(itemsByLevelId.get(nextLevel.id) ?? []).length === 0 && (
                                <p className="text-xs text-gray-400">
                                  No {nextLevel.list_type.label.toLowerCase()} yet.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => addItemMutation.mutate()}
                            disabled={addItemMutation.isPending || !newItemLabel.trim()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-60"
                          >
                            {addItemMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddItem(false);
                              setNewItemLabel("");
                              setSelectedChildIds(new Set());
                            }}
                            className="text-xs text-gray-500 hover:text-gray-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
