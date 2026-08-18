import type { LucideIcon } from "lucide-react";
import type { PagePermissionKey } from "@/lib/pagePermissions";
import { getModuleByIdSync } from "../getRegistry";
import { resolveNavIcon } from "../icons";
import type { OverviewAudience, OverviewConfig } from "../types";
import { modOverview } from "../modules/modOverview";

export type OverviewQuickActionItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  moduleId?: string;
  linkId?: string;
};

function audienceMatches(
  itemAudience: OverviewAudience,
  viewer: "admin" | "employee",
): boolean {
  if (itemAudience === "all") return true;
  return itemAudience === viewer;
}

/**
 * Build overview quick-action tiles from mod:overview config.
 * Filters by permission (legacyKey) and admin vs employee audience.
 */
export function buildOverviewQuickActions(options: {
  isAdmin: boolean;
  canSee: (key: PagePermissionKey) => boolean;
  overviewConfig?: OverviewConfig;
}): OverviewQuickActionItem[] {
  const config = options.overviewConfig ?? modOverview.overview;
  if (!config) return [];

  const viewer: "admin" | "employee" = options.isAdmin ? "admin" : "employee";
  const items: OverviewQuickActionItem[] = [];

  for (const ref of config.quickActions) {
    if (!audienceMatches(ref.audience, viewer)) continue;

    const mod = getModuleByIdSync(ref.moduleId);
    if (!mod?.legacyKey || !mod.enabled) continue;
    if (!options.canSee(mod.legacyKey as PagePermissionKey)) continue;

    items.push({
      moduleId: mod.id,
      label: ref.label ?? mod.label,
      href: mod.route,
      icon: resolveNavIcon(
        ref.moduleId === "mod:sop" ? "shield-check" : mod.sidebar.icon,
      ),
    });
  }

  for (const link of config.extraLinks ?? []) {
    if (!audienceMatches(link.audience, viewer)) continue;
    items.push({
      linkId: link.id,
      label: link.label,
      href: link.route,
      icon: resolveNavIcon(link.icon),
    });
  }

  const sortKey = (item: OverviewQuickActionItem) => {
    const ref = config.quickActions.find((r) => r.moduleId === item.moduleId);
    if (ref) return ref.sortOrder;
    const extra = config.extraLinks?.find((e) => e.id === item.linkId);
    return extra?.sortOrder ?? 999;
  };

  return items.sort((a, b) => sortKey(a) - sortKey(b));
}

/** Resolve a module route for attention chips / deep links */
export function getModuleRoute(moduleId: string): string | null {
  return getModuleByIdSync(moduleId)?.route ?? null;
}

export function formatOverviewGreeting(
  firstName: string,
  greeting: string,
  template?: string,
): string {
  const tpl = template ?? modOverview.overview?.greetingTemplate ?? "{greeting}, {firstName}";
  return tpl
    .replace("{greeting}", greeting)
    .replace("{firstName}", firstName);
}
