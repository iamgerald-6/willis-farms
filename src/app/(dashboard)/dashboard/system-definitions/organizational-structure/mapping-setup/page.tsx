"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Network } from "lucide-react";
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

// Site, Business unit, Department, Section, and Position always exist as
// levels here and can't be removed — Create job posting relies on this
// exact chain for its always-required fields (see CHAIN_TABLE_ORDER in
// create-job-posting/page.tsx). Anything else is optional, admin-added.
const REQUIRED_TABLE_ORDER = ["sites", "business_units", "departments", "sections", "custom_position"];

type Item = { id: string; label: string; is_active?: boolean; sort_order?: number };

type MappingLevel = {
  id: string;
  position: number;
  parent_level_id: string | null;
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

/** A node created by an in-flight add hasn't been confirmed by the server yet — its id is a
 * placeholder, not a real one, so it can't be used in a DELETE (or as a parent for a further
 * add) until the real id comes back. Checkboxes disable themselves while this is true. */
const isOptimisticId = (id: string) => id.startsWith("optimistic-");

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

  const { data: levelsRaw = [], isLoading: levelsLoading } = useQuery<MappingLevel[]>({
    queryKey: LEVELS_QUERY_KEY,
    queryFn: async () => (await api.get("/organizational-structure/mapping-levels")).data.data,
    enabled: !!canView,
  });
  // Display order: depth-first from the roots (levels with no parent), siblings
  // ordered by `position`. This just decides how the Level dropdown lists
  // things — the actual hierarchy is parent_level_id, not this order.
  function orderLevelsAsTree(all: MappingLevel[]): MappingLevel[] {
    const byParent = new Map<string | null, MappingLevel[]>();
    for (const lvl of all) {
      const key = lvl.parent_level_id;
      const list = byParent.get(key) ?? [];
      list.push(lvl);
      byParent.set(key, list);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.position - b.position);
    const seen = new Set<string>();
    const ordered: MappingLevel[] = [];
    function visit(parentId: string | null) {
      for (const lvl of byParent.get(parentId) ?? []) {
        if (seen.has(lvl.id)) continue;
        seen.add(lvl.id);
        ordered.push(lvl);
        visit(lvl.id);
      }
    }
    visit(null);
    // Anything orphaned (parent_level_id pointing at a level that got removed
    // from the list somehow) still needs to show up somewhere.
    for (const lvl of all) {
      if (!seen.has(lvl.id)) {
        seen.add(lvl.id);
        ordered.push(lvl);
      }
    }
    return ordered;
  }
  const levels = orderLevelsAsTree(levelsRaw);

  const { data: nodes = [] } = useQuery<MappingNode[]>({
    queryKey: NODES_QUERY_KEY,
    queryFn: async () => (await api.get("/organizational-structure/mapping-nodes")).data.data,
    enabled: !!canView,
  });

  const { data: allListTypes = [], isLoading: listTypesLoading } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/custom-list-types");
      return res.data.data as OrgCustomListType[];
    },
    enabled: !!canView,
  });

  // One-time auto-setup: Site/Business unit/Department/Section/Position are
  // always supposed to exist as levels here. If this is a fresh install (or
  // this page has simply never been opened before), create whichever of the
  // five are missing, in order, so nobody has to do that by hand.
  const [seedAttempted, setSeedAttempted] = useState(false);
  useEffect(() => {
    if (seedAttempted || levelsLoading || listTypesLoading || !canEdit) return;
    setSeedAttempted(true);
    const existingTableNames = new Set(levels.map((l) => l.list_type.table_name));
    const missing = REQUIRED_TABLE_ORDER.filter((t) => !existingTableNames.has(t));
    if (missing.length === 0) return;
    (async () => {
      // Site -> Business unit -> Department -> Section -> Position, each one
      // parented under whichever of these came right before it (Site itself
      // has no parent — it's the root of the required chain).
      let previousLevelId: string | null = null;
      for (const tableName of REQUIRED_TABLE_ORDER) {
        const already = levels.find((l) => l.list_type.table_name === tableName);
        if (already) {
          previousLevelId = already.id;
          continue;
        }
        const lt = allListTypes.find((o) => o.table_name === tableName);
        if (!lt) continue;
        try {
          const res = await api.post("/organizational-structure/mapping-levels", {
            list_type_id: lt.id,
            parent_level_id: previousLevelId,
          });
          previousLevelId = res.data.data.id as string;
        } catch {
          // best-effort — an admin can still add it manually below if this fails
        }
      }
      queryClient.invalidateQueries({ queryKey: LEVELS_QUERY_KEY });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [seedAttempted, levelsLoading, listTypesLoading, canEdit, levels, allListTypes]);

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

  const activeLevelId = selectedLevelId || levels[0]?.id || "";
  const activeIndex = levels.findIndex((l) => l.id === activeLevelId);
  const activeLevel = activeIndex >= 0 ? levels[activeIndex] : null;

  /** Walk parent_level_id up from `level` to the root, returning root-first order. */
  function ancestorChainFor(level: MappingLevel | null): MappingLevel[] {
    if (!level) return [];
    const chain: MappingLevel[] = [];
    let current: MappingLevel | null = level;
    const guard = new Set<string>();
    while (current?.parent_level_id) {
      if (guard.has(current.parent_level_id)) break; // defend against any accidental cycle
      guard.add(current.parent_level_id);
      const parent = levelsRaw.find((l) => l.id === current!.parent_level_id) ?? null;
      if (!parent) break;
      chain.unshift(parent);
      current = parent;
    }
    return chain;
  }
  const ancestorLevels = ancestorChainFor(activeLevel);

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
    if (existing && isOptimisticId(existing.id)) return; // still saving — wait for the real id
    if (checked) {
      if (!existing) addNodeMutation.mutate({ level_id: levelId, item_id: itemId, parent_node_id: parentNodeId });
    } else if (existing) {
      removeNodeMutation.mutate(existing.id);
    }
  }

  // --- "+ Add level" form ---
  const [showAddLevel, setShowAddLevel] = useState(false);
  const [newLevelListTypeId, setNewLevelListTypeId] = useState("");
  const [newLevelParentId, setNewLevelParentId] = useState<string>(""); // "" = top level (no parent)
  const [childLevelIds, setChildLevelIds] = useState<Set<string>>(new Set());

  const usedListTypeIds = new Set(levels.map((l) => l.list_type_id));
  const availableListTypesToAdd = allListTypes.filter(
    (lt) => lt.is_active !== false && !usedListTypeIds.has(lt.id),
  );

  const resetAddLevelForm = () => {
    setShowAddLevel(false);
    setNewLevelListTypeId("");
    setNewLevelParentId("");
    setChildLevelIds(new Set());
  };

  const addLevelMutation = useMutation({
    mutationFn: async () => {
      if (!newLevelListTypeId) throw new Error("Choose a list to add.");
      if (!newLevelParentId && childLevelIds.size === 0) {
        throw new Error("Select at least one parent or child level.");
      }

      const res = await api.post("/organizational-structure/mapping-levels", {
        list_type_id: newLevelListTypeId,
        parent_level_id: newLevelParentId || null,
      });
      const newLevel = res.data.data as MappingLevel;

      // Any level picked as a "child" now sits under the new level instead of
      // wherever it was before — reparent each one onto it.
      for (const childId of childLevelIds) {
        await api.patch(`/organizational-structure/mapping-levels/${childId}`, {
          parent_level_id: newLevel.id,
        });
      }

      return newLevel;
    },
    onSuccess: (data) => {
      const reparented = childLevelIds.size > 0;
      toast.success(
        `${data.list_type.label} added to the mapping chain.` +
          (reparented ? " Existing mappings under the levels below it were cleared." : ""),
      );
      queryClient.invalidateQueries({ queryKey: LEVELS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: NODES_QUERY_KEY });
      resetAddLevelForm();
      handleLevelChange(data.id);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : errorMessage(err, "Could not add level.")),
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

  const activeParentNodeId = resolveAncestorChainNodeId(ancestorLevels.length - 1);
  const activeItems = activeLevel ? itemsByLevelId.get(activeLevel.id) ?? [] : [];
  const activeLevelNodes = activeLevel ? nodesForLevel(activeLevel.id) : [];
  const activeIsRequired = activeLevel ? REQUIRED_TABLE_ORDER.includes(activeLevel.list_type.table_name) : false;

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <Link
        href="/dashboard/system-definitions/organizational-structure"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Organizational structure
      </Link>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Network className="w-5 h-5 text-red-600" />
            Org structure mapping set up
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Site, Business unit, Department, Section, and Position are always mapped here.
            Pick the level above&apos;s specific combination, then check off which items are
            valid there. New items belong on each list&apos;s own Manage page — this screen
            only adds or removes mappings between items that already exist.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowAddLevel((prev) => !prev)}
            className="shrink-0 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            + Add level
          </button>
        )}
      </div>

      {showAddLevel && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 max-w-xl">
          <p className="text-sm font-semibold text-gray-800 mb-3">Add a level</p>

          <label className="block mb-4">
            <span className="text-xs font-medium text-gray-600">List</span>
            <select
              value={newLevelListTypeId}
              onChange={(e) => setNewLevelListTypeId(e.target.value)}
              className={selectClass}
            >
              <option value="">Choose a list…</option>
              {availableListTypesToAdd.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.label}
                </option>
              ))}
            </select>
          </label>

          <p className="text-xs text-gray-500 mb-3">
            Select at least one — where it comes after (its one parent) or which existing levels
            should move under it (its children). You don&apos;t need both. A level can only have
            one parent, but any number of children.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                Comes after (parent)
              </span>
              <select
                value={newLevelParentId}
                onChange={(e) => setNewLevelParentId(e.target.value)}
                className={selectClass}
              >
                <option value="">Top level (no parent)</option>
                {levels
                  .filter((lvl) => !childLevelIds.has(lvl.id))
                  .map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.list_type.label}
                    </option>
                  ))}
              </select>
            </label>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Comes before (children)
              </p>
              <div className="space-y-1 border border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto">
                {levels
                  .filter((lvl) => lvl.id !== newLevelParentId)
                  .map((lvl) => (
                    <label key={lvl.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={childLevelIds.has(lvl.id)}
                        onChange={(e) => {
                          setChildLevelIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(lvl.id);
                            else next.delete(lvl.id);
                            return next;
                          });
                        }}
                      />
                      {lvl.list_type.label}
                    </label>
                  ))}
                {levels.length === 0 && <p className="text-xs text-gray-400">No levels yet.</p>}
              </div>
              {childLevelIds.size > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Existing mappings under the selected levels (and everything beneath them) will
                  be cleared, since they were only valid under the old parent.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addLevelMutation.mutate()}
              disabled={addLevelMutation.isPending || !newLevelListTypeId}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              Add level
            </button>
            <button
              type="button"
              onClick={resetAddLevelForm}
              className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {levels.length === 0 ? (
          <p className="text-sm text-gray-400">Setting up the required levels…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-100 pb-4 mb-4">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Level</span>
                <select
                  value={activeLevelId}
                  onChange={(e) => handleLevelChange(e.target.value)}
                  className={`${selectClass} min-w-[220px]`}
                >
                  {levels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.list_type.label}
                    </option>
                  ))}
                </select>
              </label>
              {canEdit && activeLevel && !activeIsRequired && (
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
                  className="text-xs text-gray-400 hover:text-red-600"
                >
                  Remove this level
                </button>
              )}
            </div>

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
                      <p className="text-sm text-gray-400">
                        No items in this list yet — add some on its own Manage page first.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {activeItems.map((item) => {
                          const existing = activeLevelNodes.find(
                            (n) => n.item_id === item.id && n.parent_node_id === activeParentNodeId,
                          );
                          const pending = !!existing && isOptimisticId(existing.id);
                          return (
                            <label
                              key={item.id}
                              className="flex items-center gap-2 text-sm text-gray-800 border border-gray-100 rounded-lg px-3 py-2"
                            >
                              <input
                                type="checkbox"
                                checked={!!existing}
                                disabled={!canEdit || pending}
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
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
