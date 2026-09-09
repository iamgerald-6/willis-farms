"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Info, Network } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import type { OrgCustomListType } from "@/lib/organizationalStructureCustomLists";
import {
  parseAgeCatalogYear,
  sortAgeCatalogItems,
  type AgeMappingRowOut,
} from "@/lib/organizationalStructure/ageMapping";

const selectClass =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-red-500 min-w-[140px]";

const TAB_TABLE_ORDER = [
  "sites",
  "business_units",
  "departments",
  "sections",
  "custom_position",
  "grade_levels",
] as const;

type TabTableName = (typeof TAB_TABLE_ORDER)[number];

const TAB_LABELS: Record<TabTableName, string> = {
  sites: "Site",
  business_units: "Business unit",
  departments: "Department",
  sections: "Section",
  custom_position: "Position",
  grade_levels: "Grade level",
};

// Required chain for auto-seed (grade_levels included so placement dropdowns work).
const SEED_TABLE_ORDER: TabTableName[] = [...TAB_TABLE_ORDER];

/** Built-in lists that branch off Position for job-posting constraints (not in auto-seed). */
const BRANCH_OFF_POSITION_TABLES = ["custom_age", "custom_salary"] as const;

function tabLabelForLevel(tableName: string, fallback: string): string {
  return TAB_LABELS[tableName as TabTableName] ?? fallback;
}

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
const AGE_RANGES_QUERY_KEY = ["org_mapping_age_ranges"];

type ApiError = { response?: { data?: { error?: string } } };
const errorMessage = (err: unknown, fallback: string) =>
  (err as ApiError)?.response?.data?.error ?? fallback;

const isOptimisticId = (id: string) => id.startsWith("optimistic-");

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
  for (const lvl of all) {
    if (!seen.has(lvl.id)) {
      seen.add(lvl.id);
      ordered.push(lvl);
    }
  }
  return ordered;
}

function ancestorChainFor(level: MappingLevel | null, levelsRaw: MappingLevel[]): MappingLevel[] {
  if (!level) return [];
  const chain: MappingLevel[] = [];
  let current: MappingLevel | null = level;
  const guard = new Set<string>();
  while (current?.parent_level_id) {
    if (guard.has(current.parent_level_id)) break;
    guard.add(current.parent_level_id);
    const parent = levelsRaw.find((l) => l.id === current!.parent_level_id) ?? null;
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

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
  const canAdd =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "add", sessionRole, groupPresets);
  const canToggleMapping = canEdit && canAdd;

  const { data: levelsRaw = [], isLoading: levelsLoading } = useQuery<MappingLevel[]>({
    queryKey: LEVELS_QUERY_KEY,
    queryFn: async () => (await api.get("/organizational-structure/mapping-levels")).data.data,
    enabled: !!canView,
  });
  const levels = orderLevelsAsTree(levelsRaw);

  const { data: nodes = [] } = useQuery<MappingNode[]>({
    queryKey: NODES_QUERY_KEY,
    queryFn: async () => (await api.get("/organizational-structure/mapping-nodes")).data.data,
    enabled: !!canView,
  });

  const { data: ageRanges = [] } = useQuery<AgeMappingRowOut[]>({
    queryKey: AGE_RANGES_QUERY_KEY,
    queryFn: async () =>
      (await api.get("/organizational-structure/mapping-age-ranges")).data.data as AgeMappingRowOut[],
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

  const [seedAttempted, setSeedAttempted] = useState(false);
  useEffect(() => {
    if (seedAttempted || levelsLoading || listTypesLoading || !canEdit) return;
    setSeedAttempted(true);
    const existingTableNames = new Set(levels.map((l) => l.list_type.table_name));
    const missing = SEED_TABLE_ORDER.filter((t) => !existingTableNames.has(t));
    if (missing.length === 0) return;
    (async () => {
      let previousLevelId: string | null = null;
      for (const tableName of SEED_TABLE_ORDER) {
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
          // best-effort
        }
      }
      queryClient.invalidateQueries({ queryKey: LEVELS_QUERY_KEY });
    })();
  }, [seedAttempted, levelsLoading, listTypesLoading, canEdit, levels, allListTypes, queryClient]);

  const itemQueries = useQueries({
    queries: levels.map((lvl) => ({
      queryKey: ["org_mapping_list_items", lvl.list_type_id],
      queryFn: async () => {
        const res = await api.get(
          `/organizational-structure/custom-list-types/${lvl.list_type_id}/items`,
        );
        return (res.data.data as Item[])
          .filter((i) => i.is_active !== false)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      },
      enabled: !!canView,
    })),
  });
  const itemsByLevelId = new Map(levels.map((lvl, i) => [lvl.id, itemQueries[i]?.data ?? []]));

  const levelByTableName = useMemo(() => {
    const map = new Map<string, MappingLevel>();
    for (const lvl of levels) map.set(lvl.list_type.table_name, lvl);
    return map;
  }, [levels]);

  const mappingTabs = useMemo(
    () =>
      levels.map((lvl) => ({
        tableName: lvl.list_type.table_name,
        label: tabLabelForLevel(lvl.list_type.table_name, lvl.list_type.label),
      })),
    [levels],
  );

  const [activeTab, setActiveTab] = useState<string>("sites");
  const [selectedItemPerLevel, setSelectedItemPerLevel] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mappingTabs.length === 0) return;
    if (!mappingTabs.some((t) => t.tableName === activeTab)) {
      setActiveTab(mappingTabs[0].tableName);
    }
  }, [mappingTabs, activeTab]);

  const activeLevel = levelByTableName.get(activeTab) ?? null;
  const ancestorLevels = ancestorChainFor(activeLevel, levelsRaw);

  function nodesForLevel(levelId: string): MappingNode[] {
    return nodes.filter((n) => n.level_id === levelId);
  }

  function childOptions(level: MappingLevel, parentNodeId: string | null): Item[] {
    const allItems = itemsByLevelId.get(level.id) ?? [];
    const ids = new Set(
      nodesForLevel(level.id)
        .filter((n) => n.parent_node_id === parentNodeId)
        .map((n) => n.item_id),
    );
    return allItems.filter((i) => ids.has(i.id));
  }

  function resolveAncestorChainNodeId(
    chain: MappingLevel[],
    selections: Record<string, string>,
    uptoIndex: number,
  ): string | null | undefined {
    if (uptoIndex < 0) return null;
    let parentNodeId: string | null = null;
    for (let i = 0; i <= uptoIndex; i++) {
      const level = chain[i];
      const itemId = selections[level.id];
      if (!itemId) return undefined;
      const node = nodesForLevel(level.id).find(
        (n) => n.item_id === itemId && n.parent_node_id === parentNodeId,
      );
      if (!node) return undefined;
      parentNodeId = node.id;
    }
    return parentNodeId;
  }

  function handlePathChange(stepIndex: number, itemId: string) {
    setSelectedItemPerLevel((prev) => {
      const next = { ...prev, [ancestorLevels[stepIndex].id]: itemId };
      for (let j = stepIndex + 1; j < ancestorLevels.length; j++) {
        delete next[ancestorLevels[j].id];
      }
      return next;
    });
  }

  const activeParentNodeId = resolveAncestorChainNodeId(
    ancestorLevels,
    selectedItemPerLevel,
    ancestorLevels.length - 1,
  );

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
    if (existing && isOptimisticId(existing.id)) return;
    if (checked) {
      if (!existing) {
        addNodeMutation.mutate({ level_id: levelId, item_id: itemId, parent_node_id: parentNodeId });
      }
    } else if (existing) {
      if (
        !window.confirm(
          `Remove this mapping? Anything mapped under it at lower levels will be removed too.`,
        )
      ) {
        return;
      }
      removeNodeMutation.mutate(existing.id);
    }
  }

  const [showAddLevel, setShowAddLevel] = useState(false);
  const [newLevelListTypeId, setNewLevelListTypeId] = useState("");
  const [insertAfterLevelId, setInsertAfterLevelId] = useState<string>("");
  const [childLevelIds, setChildLevelIds] = useState<Set<string>>(new Set());

  const usedListTypeIds = useMemo(
    () => new Set(levels.map((l) => l.list_type_id)),
    [levels],
  );
  const availableListTypesToAdd = useMemo(
    () =>
      allListTypes.filter(
        (lt) => lt.is_active !== false && !usedListTypeIds.has(lt.id),
      ),
    [allListTypes, usedListTypeIds],
  );

  const positionLevel = levels.find((l) => l.list_type.table_name === "custom_position") ?? null;

  const branchListTypesOffPosition = useMemo(() => {
    return BRANCH_OFF_POSITION_TABLES.map((tableName) =>
      allListTypes.find((lt) => lt.table_name === tableName && lt.is_active !== false),
    ).filter((lt): lt is OrgCustomListType => !!lt);
  }, [allListTypes]);

  const branchListTypesNotInChain = useMemo(
    () => branchListTypesOffPosition.filter((lt) => !usedListTypeIds.has(lt.id)),
    [branchListTypesOffPosition, usedListTypeIds],
  );

  const connectBranchLevelsMutation = useMutation({
    mutationFn: async () => {
      if (!positionLevel) {
        throw new Error("Position must be in the mapping chain before connecting Age or Salary.");
      }
      if (branchListTypesNotInChain.length === 0) {
        throw new Error("Age and Salary are already connected.");
      }
      for (const lt of branchListTypesNotInChain) {
        await api.post("/organizational-structure/mapping-levels", {
          list_type_id: lt.id,
          parent_level_id: positionLevel.id,
        });
      }
    },
    onSuccess: () => {
      const names = branchListTypesNotInChain.map((lt) => lt.label).join(" and ");
      toast.success(`${names} connected under Position. Use the new tabs to map them.`);
      queryClient.invalidateQueries({ queryKey: LEVELS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: NODES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: AGE_RANGES_QUERY_KEY });
      const firstConnected = branchListTypesNotInChain[0]?.table_name;
      if (firstConnected) setActiveTab(firstConnected);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : errorMessage(err, "Could not connect lists.")),
  });

  /** Direct children in the mapping tree — only these may be reparented under a new level. */
  const directChildLevelsForInsert = useMemo(() => {
    if (!insertAfterLevelId) {
      return levels.filter((l) => !l.parent_level_id);
    }
    return levels.filter((l) => l.parent_level_id === insertAfterLevelId);
  }, [levels, insertAfterLevelId]);

  useEffect(() => {
    const valid = new Set(directChildLevelsForInsert.map((l) => l.id));
    setChildLevelIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [directChildLevelsForInsert]);

  const insertAfterLabel = insertAfterLevelId
    ? (levels.find((l) => l.id === insertAfterLevelId)?.list_type.label ?? "Selected level")
    : "Top level";

  const addLevelPreview = useMemo(() => {
    const newLabel = allListTypes.find((lt) => lt.id === newLevelListTypeId)?.label;
    if (!newLabel) return null;

    const movedLabels = [...childLevelIds]
      .map((id) => levels.find((l) => l.id === id)?.list_type.label)
      .filter((label): label is string => !!label);

    if (insertAfterLevelId) {
      const parts = [insertAfterLabel, newLabel, ...movedLabels];
      return parts.join(" → ");
    }
    if (movedLabels.length > 0) {
      return `${newLabel} → ${movedLabels.join(" → ")}`;
    }
    return `${newLabel} (top level)`;
  }, [
    allListTypes,
    newLevelListTypeId,
    insertAfterLevelId,
    insertAfterLabel,
    childLevelIds,
    levels,
  ]);

  const resetAddLevelForm = () => {
    setShowAddLevel(false);
    setNewLevelListTypeId("");
    setInsertAfterLevelId("");
    setChildLevelIds(new Set());
  };

  const addLevelMutation = useMutation({
    mutationFn: async () => {
      if (!newLevelListTypeId) throw new Error("Choose a list to add.");
      const res = await api.post("/organizational-structure/mapping-levels", {
        list_type_id: newLevelListTypeId,
        parent_level_id: insertAfterLevelId || null,
      });
      const newLevel = res.data.data as MappingLevel;
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
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : errorMessage(err, "Could not add level.")),
  });

  const pathSegments = useMemo(() => {
    return ancestorLevels.map((lvl, i) => {
      const parentId = resolveAncestorChainNodeId(ancestorLevels, selectedItemPerLevel, i - 1);
      const options =
        parentId === undefined ? [] : childOptions(lvl, parentId === undefined ? null : parentId);
      const selectedId = selectedItemPerLevel[lvl.id] ?? "";
      const selectedLabel = options.find((o) => o.id === selectedId)?.label ?? "";
      return { level: lvl, options, selectedId, selectedLabel, stepIndex: i, parentId };
    });
  }, [ancestorLevels, selectedItemPerLevel, nodes, itemsByLevelId]);

  const siblingMappedStats = useMemo(() => {
    if (!activeLevel || ancestorLevels.length === 0) return [];
    const directParentLevel = ancestorLevels[ancestorLevels.length - 1];
    const parentOfParentNodeId = resolveAncestorChainNodeId(
      ancestorLevels,
      selectedItemPerLevel,
      ancestorLevels.length - 2,
    );
    if (parentOfParentNodeId === undefined) return [];

    const parentItems = childOptions(directParentLevel, parentOfParentNodeId);
    return parentItems.map((item) => {
      const parentNode = nodesForLevel(directParentLevel.id).find(
        (n) => n.item_id === item.id && n.parent_node_id === parentOfParentNodeId,
      );
      const count = parentNode
        ? nodesForLevel(activeLevel.id).filter((n) => n.parent_node_id === parentNode.id).length
        : 0;
      return { label: item.label, count };
    });
  }, [activeLevel, ancestorLevels, selectedItemPerLevel, nodes]);

  const showMultiParentCallout =
    ancestorLevels.length > 0 &&
    siblingMappedStats.length > 1 &&
    activeTab !== "sites" &&
    activeTab !== "business_units";

  const pathLabelForQuestion = pathSegments
    .filter((s) => s.selectedLabel)
    .map((s) => s.selectedLabel)
    .join(" › ");

  const activeItems = activeLevel ? itemsByLevelId.get(activeLevel.id) ?? [] : [];
  const activeLevelNodes = activeLevel ? nodesForLevel(activeLevel.id) : [];
  const isAgeMappingTab = activeLevel?.list_type.table_name === "custom_age";
  const ageCatalogItems = useMemo(
    () => (isAgeMappingTab ? sortAgeCatalogItems(activeItems) : activeItems),
    [isAgeMappingTab, activeItems],
  );

  const currentAgeRange = useMemo(() => {
    if (!activeLevel || !isAgeMappingTab || activeParentNodeId === undefined) return null;
    return (
      ageRanges.find(
        (r) =>
          r.level_id === activeLevel.id &&
          r.parent_node_id === (activeParentNodeId ?? null),
      ) ?? null
    );
  }, [ageRanges, activeLevel, isAgeMappingTab, activeParentNodeId]);

  const [draftAgeMinId, setDraftAgeMinId] = useState("");
  const [draftAgeMaxId, setDraftAgeMaxId] = useState("");

  useEffect(() => {
    setDraftAgeMinId(currentAgeRange?.age_min_id ?? "");
    setDraftAgeMaxId(currentAgeRange?.age_max_id ?? "");
  }, [currentAgeRange, activeParentNodeId, activeTab]);

  const saveAgeRangeMutation = useMutation({
    mutationFn: async (body: { age_min_id: string; age_max_id: string }) => {
      if (!activeLevel) throw new Error("Age level is not ready.");
      const res = await api.put("/organizational-structure/mapping-age-ranges", {
        level_id: activeLevel.id,
        parent_node_id: activeParentNodeId ?? null,
        age_min_id: body.age_min_id,
        age_max_id: body.age_max_id,
      });
      return res.data.data as AgeMappingRowOut | null;
    },
    onSuccess: () => {
      toast.success("Age range saved.");
      queryClient.invalidateQueries({ queryKey: AGE_RANGES_QUERY_KEY });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : errorMessage(err, "Could not save age range.")),
  });

  function trySaveAgeRange(minId: string, maxId: string) {
    if (!minId || !maxId) return;
    const minItem = ageCatalogItems.find((i) => i.id === minId);
    const maxItem = ageCatalogItems.find((i) => i.id === maxId);
    const minYear = minItem ? parseAgeCatalogYear(minItem.label) : null;
    const maxYear = maxItem ? parseAgeCatalogYear(maxItem.label) : null;
    if (minYear != null && maxYear != null && minYear > maxYear) {
      toast.error("Minimum age can't be greater than maximum age.");
      return;
    }
    saveAgeRangeMutation.mutate({ age_min_id: minId, age_max_id: maxId });
  }

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
        href="/dashboard/system-definitions/organizational-structure"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Organizational structure
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Network className="w-5 h-5 text-red-600" />
            Org structure mapping
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Map valid org combinations. Site through Grade level are always in the chain; Age
            and Salary appear as extra tabs once connected under Position.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowAddLevel((prev) => !prev)}
            className="shrink-0 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors w-fit"
          >
            + Add level
          </button>
        )}
      </div>

      {branchListTypesNotInChain.length > 0 && positionLevel && canToggleMapping && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 mb-5 max-w-2xl text-sm text-blue-950">
          <p className="font-semibold mb-1">
            Connect {branchListTypesNotInChain.map((lt) => lt.label).join(" and ")}
          </p>
          <p className="text-xs text-blue-900/90 mb-3">
            These lists are used on job postings but are not in the mapping chain yet — that is
            why you do not see tabs for them. Connect them under Position to choose which
            eligible age ranges (min–max from the Age catalog) and salary bands are valid
            for each role path.
          </p>
          <button
            type="button"
            onClick={() => connectBranchLevelsMutation.mutate()}
            disabled={connectBranchLevelsMutation.isPending}
            className="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
          >
            {connectBranchLevelsMutation.isPending
              ? "Connecting…"
              : `Connect ${branchListTypesNotInChain.map((lt) => lt.label).join(" & ")}`}
          </button>
        </div>
      )}

      {showAddLevel && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 max-w-xl space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">Add a level to the chain</p>
            <p className="text-xs text-gray-500 mt-1">
              For Age or Salary, use <strong>Connect</strong> above (they branch off Position).
              For any other list, create it on{" "}
              <Link
                href="/dashboard/system-definitions/organizational-structure"
                className="text-red-600 hover:underline"
              >
                Organizational structure
              </Link>{" "}
              first, then pick it here.
            </p>
          </div>

          {availableListTypesToAdd.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 space-y-2">
              <p>
                Every active list is already in the mapping chain, or you only have the standard
                Site → Grade lists.
              </p>
              {branchListTypesNotInChain.length > 0 ? (
                <p>
                  To add Age or Salary, close this form and use{" "}
                  <strong>Connect {branchListTypesNotInChain.map((lt) => lt.label).join(" & ")}</strong>{" "}
                  above — not Add level.
                </p>
              ) : (
                <p>
                  To add a brand-new list type, use{" "}
                  <strong>+ Add new list</strong> on Organizational structure, then return here.
                </p>
              )}
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  List to add
                </span>
                <select
                  value={newLevelListTypeId}
                  onChange={(e) => setNewLevelListTypeId(e.target.value)}
                  className={`${selectClass} w-full`}
                >
                  <option value="">Choose a list…</option>
                  {availableListTypesToAdd.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Insert after
                </span>
                <select
                  value={insertAfterLevelId}
                  onChange={(e) => setInsertAfterLevelId(e.target.value)}
                  className={`${selectClass} w-full`}
                >
                  <option value="">Top level (nothing above it)</option>
                  {levels
                    .filter((lvl) => !childLevelIds.has(lvl.id))
                    .map((lvl) => (
                      <option key={lvl.id} value={lvl.id}>
                        {lvl.list_type.label}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  The new level sits directly under this step in the chain.
                </p>
              </label>

              {directChildLevelsForInsert.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Move under the new level
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    Only levels that sit directly under {insertAfterLabel} are shown — not
                    grandchildren or unrelated levels.
                  </p>
                  <div className="space-y-1 border border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto">
                    {directChildLevelsForInsert.map((lvl) => (
                      <label
                        key={lvl.id}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
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
                          className="accent-red-600"
                        />
                        {lvl.list_type.label}
                      </label>
                    ))}
                  </div>
                  {childLevelIds.size > 0 && (
                    <p className="text-xs text-amber-700 mt-2">
                      Existing mappings under the selected level(s) will be cleared when they
                      move.
                    </p>
                  )}
                </div>
              )}

              {addLevelPreview && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Chain preview
                  </p>
                  <p className="text-sm text-gray-800">{addLevelPreview}</p>
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => addLevelMutation.mutate()}
              disabled={
                addLevelMutation.isPending ||
                !newLevelListTypeId ||
                availableListTypesToAdd.length === 0
              }
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
            >
              Add level
            </button>
            <button
              type="button"
              onClick={resetAddLevelForm}
              className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
        {mappingTabs.length === 0 ? (
          <p className="px-4 py-2 text-sm text-gray-400">Loading mapping levels…</p>
        ) : (
          mappingTabs.map((tab) => (
            <button
              key={tab.tableName}
              type="button"
              onClick={() => setActiveTab(tab.tableName)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${
                activeTab === tab.tableName
                  ? "border-red-600 text-red-700"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 md:p-6">
        {levelsLoading ? (
          <p className="text-sm text-gray-400">Setting up mapping levels…</p>
        ) : !activeLevel ? (
          <p className="text-sm text-gray-400">
            This level is not in the mapping chain yet — wait a moment or refresh.
          </p>
        ) : (
          <>
            {ancestorLevels.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Editing path
                </p>
                <div className="flex flex-wrap items-end gap-x-2 gap-y-4">
                  {pathSegments.map((seg, idx) => (
                    <div key={seg.level.id} className="flex items-end gap-2">
                      {idx > 0 && (
                        <ChevronRight
                          className="w-4 h-4 text-red-500 shrink-0 mb-2.5"
                          aria-hidden
                        />
                      )}
                      <div className="flex flex-col gap-1.5 min-w-[140px]">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide leading-none">
                          {tabLabelForLevel(
                            seg.level.list_type.table_name,
                            seg.level.list_type.label,
                          )}
                        </span>
                        <select
                          value={seg.selectedId}
                          onChange={(e) => handlePathChange(seg.stepIndex, e.target.value)}
                          className={selectClass}
                          aria-label={tabLabelForLevel(
                            seg.level.list_type.table_name,
                            seg.level.list_type.label,
                          )}
                        >
                          <option value="">
                            Select {seg.level.list_type.singular.toLowerCase()}…
                          </option>
                          {seg.options.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showMultiParentCallout && (
              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-5 text-sm text-amber-900">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <p>
                  Multiple{" "}
                  {ancestorLevels[ancestorLevels.length - 1]?.list_type.label.toLowerCase() ??
                    "items"}{" "}
                  are mapped at the level above. Use the dropdowns in{" "}
                  <strong>Editing path</strong> to choose which branch you are configuring now.
                </p>
              </div>
            )}

            {activeParentNodeId === undefined && ancestorLevels.length > 0 ? (
              <p className="text-sm text-gray-500">
                Select every step in the editing path above to map{" "}
                {activeLevel.list_type.label.toLowerCase()}.
              </p>
            ) : (
              <>
                {isAgeMappingTab ? (
                  <>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                      {pathLabelForQuestion
                        ? `What age range is valid under ${pathLabelForQuestion}?`
                        : "What age range is valid on this path?"}
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Choose minimum and maximum ages from the catalog (e.g. 15 and 20). This
                      sets eligibility for every job posting on this position path — Age is not
                      a field on the posting itself.
                    </p>
                    {ageCatalogItems.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        No ages in the catalog yet — fill them with min/max on Manage → Age first.
                      </p>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-3 max-w-md">
                        <label className="block">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                            Age minimum
                          </span>
                          <select
                            value={draftAgeMinId}
                            disabled={!canToggleMapping || saveAgeRangeMutation.isPending}
                            onChange={(e) => {
                              const nextMin = e.target.value;
                              setDraftAgeMinId(nextMin);
                              trySaveAgeRange(nextMin, draftAgeMaxId);
                            }}
                            className={`${selectClass} w-full`}
                          >
                            <option value="">Select minimum…</option>
                            {ageCatalogItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                            Age maximum
                          </span>
                          <select
                            value={draftAgeMaxId}
                            disabled={!canToggleMapping || saveAgeRangeMutation.isPending}
                            onChange={(e) => {
                              const nextMax = e.target.value;
                              setDraftAgeMaxId(nextMax);
                              trySaveAgeRange(draftAgeMinId, nextMax);
                            }}
                            className={`${selectClass} w-full`}
                          >
                            <option value="">Select maximum…</option>
                            {ageCatalogItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    {currentAgeRange && (
                      <p className="text-sm text-gray-600 mt-4">
                        Mapped:{" "}
                        {ageCatalogItems.find((i) => i.id === currentAgeRange.age_min_id)?.label ??
                          "?"}
                        –
                        {ageCatalogItems.find((i) => i.id === currentAgeRange.age_max_id)?.label ??
                          "?"}{" "}
                        years
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                      {pathLabelForQuestion
                        ? `Which ${activeLevel.list_type.label.toLowerCase()} are valid under ${pathLabelForQuestion}?`
                        : `Which ${activeLevel.list_type.label.toLowerCase()} should be included in the map?`}
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">Changes save automatically.</p>

                    {activeItems.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        No items in this list yet — add some on the list&apos;s Manage page first.
                      </p>
                    ) : (
                      <div className="space-y-2 max-w-lg">
                        {activeItems.map((item) => {
                          const existing = activeLevelNodes.find(
                            (n) =>
                              n.item_id === item.id &&
                              n.parent_node_id === (activeParentNodeId ?? null),
                          );
                          const pending = !!existing && isOptimisticId(existing.id);
                          return (
                            <label
                              key={item.id}
                              className="flex items-center gap-3 text-sm text-gray-800 border border-gray-100 rounded-lg px-3 py-2.5 hover:bg-gray-50/80"
                            >
                              <input
                                type="checkbox"
                                checked={!!existing}
                                disabled={!canToggleMapping || pending}
                                onChange={(e) =>
                                  toggleNode(
                                    existing,
                                    e.target.checked,
                                    activeLevel.id,
                                    item.id,
                                    activeParentNodeId ?? null,
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
                  </>
                )}

                {!isAgeMappingTab && siblingMappedStats.length > 1 && (
                  <p className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-100">
                    {siblingMappedStats
                      .map((s) => `${s.label}: ${s.count} mapped`)
                      .join(" · ")}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
