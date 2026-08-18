import type { LucideIcon } from "lucide-react";
import type { PagePermissionKey } from "@/lib/pagePermissions";
import { getModuleGroupById, MODULE_GROUPS } from "../groups";
import { resolveNavIcon } from "../icons";
import { getModuleRegistrySync } from "../getRegistry";
import type { ModuleGroupId, ModuleRecord } from "../types";

export type SidebarNavChild = {
  moduleId: string;
  label: string;
  href: string;
  icon: LucideIcon;
  legacyKey: PagePermissionKey;
};

export type SidebarNavItem = {
  moduleId?: string;
  label: string;
  href: string;
  icon: LucideIcon;
  legacyKey?: PagePermissionKey;
  children?: SidebarNavChild[];
};

/**
 * Explicit sidebar order (matches legacy NAV_ITEMS layout).
 * When dynamic modules exist, append entries here or merge by navOrder.
 */
const SIDEBAR_LAYOUT: Array<
  | { kind: "module"; moduleId: string }
  | { kind: "collapsible-group"; groupId: ModuleGroupId }
  | { kind: "flat-modules"; groupId: ModuleGroupId }
> = [
  { kind: "module", moduleId: "mod:overview" },
  { kind: "collapsible-group", groupId: "grp:human-capital" },
  { kind: "collapsible-group", groupId: "grp:task-manager" },
  { kind: "flat-modules", groupId: "grp:operations" },
  { kind: "module", moduleId: "mod:notifications" },
];

function sidebarModules(modules: ModuleRecord[]): ModuleRecord[] {
  return modules.filter(
    (m) => m.enabled && m.sidebar.showInSidebar !== false,
  );
}

function moduleToChild(m: ModuleRecord): SidebarNavChild | null {
  if (!m.legacyKey) return null;
  return {
    moduleId: m.id,
    label: m.label,
    href: m.route,
    icon: resolveNavIcon(m.sidebar.icon),
    legacyKey: m.legacyKey as PagePermissionKey,
  };
}

function moduleToItem(m: ModuleRecord): SidebarNavItem | null {
  if (!m.legacyKey) return null;
  return {
    moduleId: m.id,
    label: m.label,
    href: m.route,
    icon: resolveNavIcon(m.sidebar.icon),
    legacyKey: m.legacyKey as PagePermissionKey,
  };
}

/**
 * Build sidebar navigation from the module registry (labels, routes, icons).
 * Permission filtering stays in Sidebar via legacyKey + canAccessPage.
 */
export function buildSidebarNav(): SidebarNavItem[] {
  const all = sidebarModules(getModuleRegistrySync());
  const byId = new Map(all.map((m) => [m.id, m]));
  const byGroup = (groupId: ModuleGroupId) =>
    all
      .filter((m) => m.groupId === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const items: SidebarNavItem[] = [];

  for (const entry of SIDEBAR_LAYOUT) {
    if (entry.kind === "module") {
      const mod = byId.get(entry.moduleId);
      if (!mod) continue;
      const item = moduleToItem(mod);
      if (item) items.push(item);
      continue;
    }

    if (entry.kind === "flat-modules") {
      for (const mod of byGroup(entry.groupId)) {
        const item = moduleToItem(mod);
        if (item) items.push(item);
      }
      continue;
    }

    if (entry.kind === "collapsible-group") {
      const group = getModuleGroupById(entry.groupId);
      const groupModules = byGroup(entry.groupId);
      if (!group || groupModules.length === 0) continue;

      const sidebar = group.sidebar;
      const children = groupModules
        .map(moduleToChild)
        .filter((c): c is SidebarNavChild => c != null);

      if (children.length === 0) continue;

      items.push({
        label: group.label,
        href: sidebar?.href ?? groupModules[0]!.route,
        icon: resolveNavIcon(
          sidebar?.icon ?? groupModules[0]!.sidebar.icon,
        ),
        children,
      });
    }
  }

  return items;
}

/** All groups (for settings / future dynamic nav) */
export function getSidebarGroups() {
  return MODULE_GROUPS.filter((g) => g.sidebar);
}
