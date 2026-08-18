import type { TaxonomyOption } from "../types";

/** Leave type options — replaces hardcoded LEAVE_TYPES in LeavePag.tsx */
export const LEAVE_TYPE_OPTIONS: TaxonomyOption[] = [
  {
    id: "opt:leave:type:annual",
    label: "Annual",
    legacyValue: "Annual",
    sortOrder: 1,
  },
  {
    id: "opt:leave:type:sick",
    label: "Sick",
    legacyValue: "Sick",
    sortOrder: 2,
  },
  {
    id: "opt:leave:type:emergency",
    label: "Emergency",
    legacyValue: "Emergency",
    sortOrder: 3,
  },
  {
    id: "opt:leave:type:maternity-paternity",
    label: "Maternity/Paternity",
    legacyValue: "Maternity/Paternity",
    sortOrder: 4,
  },
  {
    id: "opt:leave:type:unpaid",
    label: "Unpaid",
    legacyValue: "Unpaid",
    sortOrder: 5,
  },
  {
    id: "opt:leave:type:other",
    label: "Other",
    legacyValue: "Other",
    sortOrder: 6,
  },
];

export function getLeaveTypeOptions(): TaxonomyOption[] {
  return [...LEAVE_TYPE_OPTIONS].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
}

/** Labels for zod enum / API compatibility (legacy string column) */
export function getLeaveTypeLegacyValues(): readonly string[] {
  return LEAVE_TYPE_OPTIONS.map(
    (o) => o.legacyValue ?? o.label,
  ) as readonly string[];
}

export function getLeaveTypeOptionByLegacyValue(
  value: string,
): TaxonomyOption | undefined {
  return LEAVE_TYPE_OPTIONS.find(
    (o) => (o.legacyValue ?? o.label) === value,
  );
}

export function getLeaveTypeOptionById(id: string): TaxonomyOption | undefined {
  return LEAVE_TYPE_OPTIONS.find((o) => o.id === id);
}

/** Annual leave cap — system rule until moved to module policy config */
export const LEAVE_ANNUAL_CAP_DAYS = 30;
