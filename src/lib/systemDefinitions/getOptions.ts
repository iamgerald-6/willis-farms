import type { SupabaseClient } from "@supabase/supabase-js";
import { getGitFallbackOptions } from "./gitFallback";
import type { SystemOption, SystemOptionRules } from "./types";

function normalizeRules(raw: unknown): SystemOptionRules {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    ...r,
    requires_document: r.requires_document === true,
    requires_reason: r.requires_reason === true,
  } as SystemOptionRules;
}

function mapRow(row: Record<string, unknown>): SystemOption {
  return {
    id: String(row.id),
    module_id: String(row.module_id),
    option_list: String(row.option_list),
    label: String(row.label),
    legacy_value: row.legacy_value != null ? String(row.legacy_value) : null,
    sort_order: Number(row.sort_order ?? 0),
    is_active: row.is_active !== false,
    rules: normalizeRules(row.rules),
    created_at: row.created_at != null ? String(row.created_at) : undefined,
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
  };
}

function optionLegacyKey(option: SystemOption): string {
  return option.legacy_value ?? option.label;
}

/** Keep built-in defaults when admins add custom DB rows — do not replace the whole list. */
export function mergeSystemOptions(
  gitOptions: SystemOption[],
  dbOptions: SystemOption[],
  includeInactive = false,
): SystemOption[] {
  const dbByLegacy = new Map<string, SystemOption>();
  for (const row of dbOptions) {
    dbByLegacy.set(optionLegacyKey(row), row);
  }

  const gitLegacyKeys = new Set<string>();
  const merged: SystemOption[] = [];

  for (const git of gitOptions) {
    const key = optionLegacyKey(git);
    gitLegacyKeys.add(key);
    const db = dbByLegacy.get(key);
    merged.push(
      db
        ? {
            ...git,
            ...db,
            rules: { ...git.rules, ...db.rules },
          }
        : git,
    );
  }

  for (const db of dbOptions) {
    const key = optionLegacyKey(db);
    if (!gitLegacyKeys.has(key)) {
      merged.push(db);
    }
  }

  const filtered = includeInactive ? merged : merged.filter((o) => o.is_active);
  return filtered.sort((a, b) => a.sort_order - b.sort_order);
}

export async function fetchSystemOptions(
  supabase: SupabaseClient,
  moduleId: string,
  optionList: string,
  options?: { includeInactive?: boolean },
): Promise<SystemOption[]> {
  let query = supabase
    .from("system_options")
    .select("*")
    .eq("module_id", moduleId)
    .eq("option_list", optionList)
    .order("sort_order", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    // Table missing or other DB error — fall back to Git so the app keeps working
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return getGitFallbackOptions(moduleId, optionList);
    }
    throw error;
  }

  if (!data?.length) {
    return getGitFallbackOptions(moduleId, optionList);
  }

  const gitOptions = getGitFallbackOptions(moduleId, optionList);
  if (gitOptions.length === 0) {
    return data.map((row) => mapRow(row as Record<string, unknown>));
  }

  return mergeSystemOptions(
    gitOptions,
    data.map((row) => mapRow(row as Record<string, unknown>)),
    options?.includeInactive,
  );
}

export async function fetchSystemOptionByLegacyValue(
  supabase: SupabaseClient,
  moduleId: string,
  optionList: string,
  legacyValue: string,
): Promise<SystemOption | null> {
  const { data, error } = await supabase
    .from("system_options")
    .select("*")
    .eq("module_id", moduleId)
    .eq("option_list", optionList)
    .eq("legacy_value", legacyValue)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return (
        getGitFallbackOptions(moduleId, optionList).find(
          (o) => o.legacy_value === legacyValue,
        ) ?? null
      );
    }
    throw error;
  }

  if (data) {
    return mapRow(data as Record<string, unknown>);
  }

  return (
    getGitFallbackOptions(moduleId, optionList).find(
      (o) => o.legacy_value === legacyValue,
    ) ?? null
  );
}
