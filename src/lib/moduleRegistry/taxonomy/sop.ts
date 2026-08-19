import type { TaxonomyOption } from "../types";

export type SopCategoryDef = TaxonomyOption & {
  badgeClass: string;
  subcategories: TaxonomyOption[];
};

/** SOP categories + subcategories — replaces hardcoded lists in addContentModal & sop/page */
export const SOP_CATEGORIES: SopCategoryDef[] = [
  {
    id: "cat:sop:animal-health-welfare",
    label: "Animal Health & Welfare",
    legacyValue: "Animal Health & Welfare",
    sortOrder: 1,
    badgeClass:
      "bg-emerald-50 text-emerald-700 border border-emerald-200",
    subcategories: [
      { id: "sub:sop:animal-health-welfare:disease-identification-treatment", label: "Disease Identification & Treatment", legacyValue: "Disease Identification & Treatment" },
      { id: "sub:sop:animal-health-welfare:vaccination-protocols", label: "Vaccination Protocols", legacyValue: "Vaccination Protocols" },
      { id: "sub:sop:animal-health-welfare:parasite-control", label: "Parasite Control", legacyValue: "Parasite Control" },
      { id: "sub:sop:animal-health-welfare:injury-wound-management", label: "Injury & Wound Management", legacyValue: "Injury & Wound Management" },
      { id: "sub:sop:animal-health-welfare:mortality-management", label: "Mortality Management", legacyValue: "Mortality Management" },
      { id: "sub:sop:animal-health-welfare:veterinary-visit-procedures", label: "Veterinary Visit Procedures", legacyValue: "Veterinary Visit Procedures" },
    ],
  },
  {
    id: "cat:sop:breeding-reproduction",
    label: "Breeding & Reproduction",
    legacyValue: "Breeding & Reproduction",
    sortOrder: 2,
    badgeClass: "bg-pink-50 text-pink-700 border border-pink-200",
    subcategories: [
      { id: "sub:sop:breeding-reproduction:gilt-selection-preparation", label: "Gilt Selection & Preparation", legacyValue: "Gilt Selection & Preparation" },
      { id: "sub:sop:breeding-reproduction:insemination-procedures", label: "Insemination Procedures", legacyValue: "Insemination Procedures" },
      { id: "sub:sop:breeding-reproduction:pregnancy-confirmation", label: "Pregnancy Confirmation", legacyValue: "Pregnancy Confirmation" },
      { id: "sub:sop:breeding-reproduction:farrowing-procedures", label: "Farrowing Procedures", legacyValue: "Farrowing Procedures" },
      { id: "sub:sop:breeding-reproduction:weaning-procedures", label: "Weaning Procedures", legacyValue: "Weaning Procedures" },
      { id: "sub:sop:breeding-reproduction:boar-management", label: "Boar Management", legacyValue: "Boar Management" },
    ],
  },
  {
    id: "cat:sop:nutrition-feeding",
    label: "Nutrition & Feeding",
    legacyValue: "Nutrition & Feeding",
    sortOrder: 3,
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
    subcategories: [
      { id: "sub:sop:nutrition-feeding:feed-schedules-rations", label: "Feed Schedules & Rations", legacyValue: "Feed Schedules & Rations" },
      { id: "sub:sop:nutrition-feeding:diet-formulations-by-stage", label: "Diet Formulations by Stage", legacyValue: "Diet Formulations by Stage" },
      { id: "sub:sop:nutrition-feeding:water-quality-supply", label: "Water Quality & Supply", legacyValue: "Water Quality & Supply" },
      { id: "sub:sop:nutrition-feeding:feed-storage-handling", label: "Feed Storage & Handling", legacyValue: "Feed Storage & Handling" },
      { id: "sub:sop:nutrition-feeding:lactating-sow-nutrition", label: "Lactating Sow Nutrition", legacyValue: "Lactating Sow Nutrition" },
    ],
  },
  {
    id: "cat:sop:biosecurity",
    label: "Biosecurity",
    legacyValue: "Biosecurity",
    sortOrder: 4,
    badgeClass: "bg-blue-50 text-blue-700 border border-blue-200",
    subcategories: [
      { id: "sub:sop:biosecurity:farm-entry-exit-protocols", label: "Farm Entry & Exit Protocols", legacyValue: "Farm Entry & Exit Protocols" },
      { id: "sub:sop:biosecurity:visitor-vehicle-management", label: "Visitor & Vehicle Management", legacyValue: "Visitor & Vehicle Management" },
      { id: "sub:sop:biosecurity:disinfection-sanitation", label: "Disinfection & Sanitation", legacyValue: "Disinfection & Sanitation" },
      { id: "sub:sop:biosecurity:pest-rodent-control", label: "Pest & Rodent Control", legacyValue: "Pest & Rodent Control" },
      { id: "sub:sop:biosecurity:quarantine-procedures", label: "Quarantine Procedures", legacyValue: "Quarantine Procedures" },
      { id: "sub:sop:biosecurity:disease-outbreak-response", label: "Disease Outbreak Response", legacyValue: "Disease Outbreak Response" },
    ],
  },
  {
    id: "cat:sop:facility-equipment",
    label: "Facility & Equipment",
    legacyValue: "Facility & Equipment",
    sortOrder: 5,
    badgeClass:
      "bg-orange-50 text-orange-700 border border-orange-200",
    subcategories: [
      { id: "sub:sop:facility-equipment:pen-cleaning-maintenance", label: "Pen Cleaning & Maintenance", legacyValue: "Pen Cleaning & Maintenance" },
      { id: "sub:sop:facility-equipment:equipment-inspection-servicing", label: "Equipment Inspection & Servicing", legacyValue: "Equipment Inspection & Servicing" },
      { id: "sub:sop:facility-equipment:ventilation-temperature-control", label: "Ventilation & Temperature Control", legacyValue: "Ventilation & Temperature Control" },
      { id: "sub:sop:facility-equipment:waste-effluent-management", label: "Waste & Effluent Management", legacyValue: "Waste & Effluent Management" },
      { id: "sub:sop:facility-equipment:water-system-maintenance", label: "Water System Maintenance", legacyValue: "Water System Maintenance" },
    ],
  },
  {
    id: "cat:sop:health-safety",
    label: "Health & Safety",
    legacyValue: "Health & Safety",
    sortOrder: 6,
    badgeClass: "bg-red-50 text-red-700 border border-red-200",
    subcategories: [
      { id: "sub:sop:health-safety:ppe-requirements", label: "PPE Requirements", legacyValue: "PPE Requirements" },
      { id: "sub:sop:health-safety:chemical-handling-storage", label: "Chemical Handling & Storage", legacyValue: "Chemical Handling & Storage" },
      { id: "sub:sop:health-safety:emergency-response-procedures", label: "Emergency Response Procedures", legacyValue: "Emergency Response Procedures" },
      { id: "sub:sop:health-safety:incident-reporting", label: "Incident Reporting", legacyValue: "Incident Reporting" },
      { id: "sub:sop:health-safety:staff-safety-training", label: "Staff Safety Training", legacyValue: "Staff Safety Training" },
    ],
  },
  {
    id: "cat:sop:hr-administration",
    label: "HR & Administration",
    legacyValue: "HR & Administration",
    sortOrder: 7,
    badgeClass:
      "bg-purple-50 text-purple-700 border border-purple-200",
    subcategories: [
      { id: "sub:sop:hr-administration:staff-onboarding", label: "Staff Onboarding", legacyValue: "Staff Onboarding" },
      { id: "sub:sop:hr-administration:record-keeping-documentation", label: "Record Keeping & Documentation", legacyValue: "Record Keeping & Documentation" },
      { id: "sub:sop:hr-administration:reporting-procedures", label: "Reporting Procedures", legacyValue: "Reporting Procedures" },
      { id: "sub:sop:hr-administration:performance-compliance", label: "Performance & Compliance", legacyValue: "Performance & Compliance" },
    ],
  },
];

export function getSopCategories(): SopCategoryDef[] {
  return [...SOP_CATEGORIES].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
}

export function getSopCategoryLegacyValues(): readonly string[] {
  return SOP_CATEGORIES.map((c) => c.legacyValue ?? c.label);
}

export function getSopSubcategoriesForCategory(
  categoryLegacy: string,
): TaxonomyOption[] {
  const cat = SOP_CATEGORIES.find(
    (c) => (c.legacyValue ?? c.label) === categoryLegacy,
  );
  return cat?.subcategories ?? [];
}

export function getSopSubcategoryLegacyValues(
  categoryLegacy: string,
): readonly string[] {
  return getSopSubcategoriesForCategory(categoryLegacy).map(
    (s) => s.legacyValue ?? s.label,
  );
}

/** Filter pills for browse page — includes "All" */
export function getSopCategoryFilterPills(): string[] {
  return ["All", ...getSopCategoryLegacyValues()];
}

export function getSopCategoryBadgeClass(categoryLabel: string): string {
  const cat = SOP_CATEGORIES.find(
    (c) => (c.legacyValue ?? c.label) === categoryLabel,
  );
  return cat?.badgeClass ?? "bg-gray-100 text-gray-600 border border-gray-200";
}

export function getSopCategoryOptions(): TaxonomyOption[] {
  return getSopCategories().map(({ id, label, legacyValue, sortOrder }) => ({
    id,
    label,
    legacyValue,
    sortOrder,
  }));
}

/**
 * Character cap on an SOP's description, enforced by the add/edit form —
 * same mechanism as POLICY_DESCRIPTION_MAX_CHARS (a single shared constant
 * so the form's cap and its live counter can never drift out of sync).
 * Replaces the previous 10-word limit with a character limit instead.
 */
export const SOP_DESCRIPTION_MAX_CHARS = 100;

export const SOP_BROWSE_COPY = {
  title: "SOPs",
  subtitle: "Browse standard operating procedures across all farm areas",
  searchPlaceholder: "Search by title, category or topic...",
  emptyTitle: "No SOPs found",
  emptyDescription: "Try a different search or filter",
};

export const SOP_MANAGE_COPY = {
  title: "SOP Management",
  subtitle: "Upload, review, and manage standard operating procedures",
};
