import type { ModuleGroup } from "./types";

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "grp:general",
    label: "General",
    sortOrder: 1,
    sidebar: { mode: "flat" },
  },
  {
    id: "grp:human-capital",
    label: "Human Capital",
    sortOrder: 2,
    sidebar: {
      mode: "collapsible",
      icon: "user-check",
      href: "/dashboard/humanCapital",
    },
  },
  {
    id: "grp:task-manager",
    label: "Task Manager",
    sortOrder: 3,
    sidebar: {
      mode: "collapsible",
      icon: "list-checks",
      href: "/dashboard/taskManager",
    },
  },
  {
    id: "grp:organizational-structure",
    label: "Organizational Structure",
    sortOrder: 3.5,
    sidebar: {
      mode: "collapsible",
      icon: "building-2",
      href: "/dashboard/organizational-structure",
    },
  },
  {
    id: "grp:operations",
    label: "Operations",
    sortOrder: 4,
    sidebar: { mode: "flat" },
  },
  {
    id: "grp:system",
    label: "System",
    sortOrder: 5,
    sidebar: { mode: "flat" },
  },
];

export function getModuleGroupById(id: string): ModuleGroup | undefined {
  return MODULE_GROUPS.find((g) => g.id === id);
}
