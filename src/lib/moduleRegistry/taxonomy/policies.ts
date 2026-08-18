import type { NavIconKey, TaxonomyOption } from "../types";

export type PolicyCategoryDef = TaxonomyOption & {
  badgeClass: string;
  iconKey: NavIconKey;
};

/** Known manual categories — upload modal also allows free-text new categories */
export const POLICY_CATEGORIES: PolicyCategoryDef[] = [
  {
    id: "cat:policies:hr",
    label: "HR",
    legacyValue: "HR",
    sortOrder: 1,
    badgeClass: "bg-blue-50 text-blue-700 border border-blue-200",
    iconKey: "book-open",
  },
  {
    id: "cat:policies:biosecurity",
    label: "Biosecurity",
    legacyValue: "Biosecurity",
    sortOrder: 2,
    badgeClass: "bg-green-50 text-green-700 border border-green-200",
    iconKey: "shield-check",
  },
  {
    id: "cat:policies:finance",
    label: "Finance Policies",
    legacyValue: "Finance Policies",
    sortOrder: 3,
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
    iconKey: "clipboard-list",
  },
  {
    id: "cat:policies:breeding",
    label: "Breeding Operations",
    legacyValue: "Breeding Operations",
    sortOrder: 4,
    badgeClass: "bg-purple-50 text-purple-700 border border-purple-200",
    iconKey: "tag",
  },
];

export const POLICIES_PAGE_COPY = {
  title: "Procedures & Policies",
  searchPlaceholder: "Search manuals...",
  uploadButton: "Upload Manual",
  emptyTitle: "No manuals found",
  emptyAdminDescription: "Upload a manual to get started.",
  emptyUserDescription: "No manuals have been published yet.",
  uploadModalTitle: "Upload Manual",
  uploadModalSubtitle: "Add a new manual or a new version of an existing one.",
};

export function getPolicyCategories(): PolicyCategoryDef[] {
  return [...POLICY_CATEGORIES].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
}

export function getPolicyCategoryLegacyValues(): readonly string[] {
  return POLICY_CATEGORIES.map((c) => c.legacyValue ?? c.label);
}

export function getDefaultPolicyCategoryLegacyValue(): string {
  return getPolicyCategories()[0]?.legacyValue ?? "HR";
}

/** Filter tabs for browse page — includes "All" */
export function getPolicyCategoryFilterPills(): string[] {
  return ["All", ...getPolicyCategoryLegacyValues()];
}

export function getPolicyCategoryByLegacyValue(
  legacyValue: string,
): PolicyCategoryDef | undefined {
  return POLICY_CATEGORIES.find(
    (c) => (c.legacyValue ?? c.label) === legacyValue,
  );
}

export function getPolicyCategoryBadgeClass(categoryLabel: string): string {
  return (
    getPolicyCategoryByLegacyValue(categoryLabel)?.badgeClass ??
    "bg-gray-100 text-gray-600 border border-gray-200"
  );
}

export function getPolicyCategoryIconKey(
  categoryLabel: string,
): NavIconKey | null {
  return getPolicyCategoryByLegacyValue(categoryLabel)?.iconKey ?? null;
}

export function getPolicyCategoryOptions(): TaxonomyOption[] {
  return getPolicyCategories().map(({ id, label, legacyValue, sortOrder }) => ({
    id,
    label,
    legacyValue,
    sortOrder,
  }));
}
