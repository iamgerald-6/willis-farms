import { BUILTIN_MODULES } from "./builtinModules";
import { getModuleGroupById, MODULE_GROUPS } from "./groups";
import type { ModuleGroup, ModuleRecord } from "./types";

/**
 * Load all enabled modules. Today: built-ins only.
 * Later: merge with system_modules from Supabase where source === "dynamic".
 */
export async function getModuleRegistry(): Promise<ModuleRecord[]> {
  return BUILTIN_MODULES.filter((m) => m.enabled).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/** Sync variant for client components and static config reads */
export function getModuleRegistrySync(): ModuleRecord[] {
  return BUILTIN_MODULES.filter((m) => m.enabled).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

export async function getModuleById(
  moduleId: string,
): Promise<ModuleRecord | null> {
  const registry = await getModuleRegistry();
  return registry.find((m) => m.id === moduleId) ?? null;
}

export function getModuleByIdSync(moduleId: string): ModuleRecord | null {
  return getModuleRegistrySync().find((m) => m.id === moduleId) ?? null;
}

export function getModuleByLegacyKey(
  legacyKey: string,
): ModuleRecord | undefined {
  return BUILTIN_MODULES.find((m) => m.legacyKey === legacyKey);
}

export function getModuleGroups(): ModuleGroup[] {
  return [...MODULE_GROUPS].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getModulesByGroup(groupId: string): ModuleRecord[] {
  return getModuleRegistrySync().filter((m) => m.groupId === groupId);
}

export function getModuleGroupForModule(
  module: ModuleRecord,
): ModuleGroup | undefined {
  return getModuleGroupById(module.groupId);
}
