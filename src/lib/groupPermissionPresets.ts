import type { SupabaseClient } from "@supabase/supabase-js";
import type { PagePermissionActions } from "@/lib/moduleRegistry/types";
import {
  defaultAdminActions,
  defaultFullAccessActions,
  defaultStandardEmployeeActions,
  emptyPermissionActions,
  gradeBandGroup,
  roleGroup,
  sanitizePermissionActions,
  type UserListGroup,
} from "@/lib/permissionActions";
import {
  resolveGroupPresetLabels,
  type GradeLevelsConfig,
} from "@/lib/systemDefinitions/gradeLevelsConfig";
import type { AccessProfile } from "@/lib/pagePermissions";

/** Groups that have a shared permission preset (excludes "all" list filter). */
export type GroupPresetKey = Exclude<UserListGroup, "all">;

export const GROUP_PRESET_KEYS: GroupPresetKey[] = [
  "employees",
  "managers",
  "admins",
  "grade_l1_l3",
  "grade_l4_l7",
];

export const GROUP_PRESET_LABELS: Record<GroupPresetKey, string> = {
  employees: "All Employees",
  managers: "All Managers",
  admins: "All Admins",
  grade_l1_l3: "All L1–L3",
  grade_l4_l7: "All L4–L7",
};

/** Dynamic labels reflecting configured grade range (e.g. All L4–L8). */
export function getGroupPresetLabels(
  config?: GradeLevelsConfig,
): Record<GroupPresetKey, string> {
  const dynamic = resolveGroupPresetLabels(config);
  return {
    employees: GROUP_PRESET_LABELS.employees,
    managers: GROUP_PRESET_LABELS.managers,
    admins: GROUP_PRESET_LABELS.admins,
    grade_l1_l3: dynamic.grade_l1_l3,
    grade_l4_l7: dynamic.grade_l4_l7,
  };
}

export type GroupPresetsMap = Partial<Record<GroupPresetKey, PagePermissionActions>>;

export type GroupPresetRow = {
  group_key: GroupPresetKey;
  page_permission_actions: PagePermissionActions;
  updated_at: string | null;
  updated_by: string | null;
};

export function isGroupPresetKey(key: string): key is GroupPresetKey {
  return (GROUP_PRESET_KEYS as readonly string[]).includes(key);
}

/** Built-in defaults when no DB row exists yet. */
export function getDefaultGroupPreset(key: GroupPresetKey): PagePermissionActions {
  switch (key) {
    case "employees":
      return defaultStandardEmployeeActions();
    case "managers":
      return defaultFullAccessActions();
    case "admins":
      return defaultAdminActions();
    case "grade_l1_l3":
    case "grade_l4_l7":
      return emptyPermissionActions();
    default:
      return emptyPermissionActions();
  }
}

export function mergePermissionActions(
  base: PagePermissionActions,
  overlay: PagePermissionActions,
): PagePermissionActions {
  const out: PagePermissionActions = { ...base };
  for (const [key, mod] of Object.entries(overlay)) {
    if (!mod || typeof mod !== "object") continue;
    out[key] = { ...(out[key] ?? {}), ...mod };
  }
  return out;
}

/** Merge role-group preset + grade-band preset for a user profile. */
export function resolveGroupPresetActions(
  profile: AccessProfile,
  presets: GroupPresetsMap,
): PagePermissionActions {
  let merged = emptyPermissionActions();
  let hasAny = false;

  const rg = roleGroup(profile.role);
  if (rg && presets[rg]) {
    merged = mergePermissionActions(merged, presets[rg]!);
    hasAny = true;
  }

  const gg = gradeBandGroup(profile.grade_level);
  if (gg && presets[gg]) {
    merged = mergePermissionActions(merged, presets[gg]!);
    hasAny = true;
  }

  return hasAny ? merged : emptyPermissionActions();
}

export function hasIndividualPermissionOverride(
  profile: AccessProfile | null | undefined,
): boolean {
  if (!profile) return false;
  const tier = profile.access_tier ?? "standard";
  if (tier !== "delegated") return false;
  const stored = sanitizePermissionActions(profile.page_permission_actions);
  return Object.keys(stored).length > 0;
}

export function normalizeGroupPresetsMap(
  rows: GroupPresetRow[] | null | undefined,
): GroupPresetsMap {
  const out: GroupPresetsMap = {};
  for (const key of GROUP_PRESET_KEYS) {
    const row = rows?.find((r) => r.group_key === key);
    const actions = row
      ? sanitizePermissionActions(row.page_permission_actions)
      : getDefaultGroupPreset(key);
    if (Object.keys(actions).length > 0) {
      out[key] = actions;
    }
  }
  return out;
}

/** Fetch all group presets from Supabase; fills missing keys with code defaults. */
export async function fetchGroupPresetsFromDb(
  supabase: SupabaseClient,
): Promise<{ presets: GroupPresetsMap; rows: GroupPresetRow[] }> {
  const { data, error } = await supabase
    .from("access_group_presets")
    .select("group_key, page_permission_actions, updated_at, updated_by");

  if (error) {
    console.warn("[fetchGroupPresetsFromDb]", error.message);
    const presets: GroupPresetsMap = {};
    for (const key of GROUP_PRESET_KEYS) {
      const actions = getDefaultGroupPreset(key);
      if (Object.keys(actions).length > 0) presets[key] = actions;
    }
    return { presets, rows: [] };
  }

  const rows: GroupPresetRow[] = (data ?? []).map((row) => ({
    group_key: row.group_key as GroupPresetKey,
    page_permission_actions: sanitizePermissionActions(row.page_permission_actions),
    updated_at: row.updated_at ?? null,
    updated_by: row.updated_by ?? null,
  }));

  return { presets: normalizeGroupPresetsMap(rows), rows };
}

export function groupPresetKeyFromListGroup(
  listGroup: UserListGroup,
): GroupPresetKey | null {
  if (listGroup === "all") return null;
  return listGroup;
}
