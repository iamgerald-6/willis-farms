import type { PipField, PipFieldType, PipTableColumn } from "./pipFormSchema";
import { isSystemField } from "./pipFormSchema";
import type { PipSection, PipTableSection } from "./pipFormSchema";
import {
  detectPipSectionRole,
  isEvidenceColumn,
  isSupportActionColumn,
} from "./pipGapChain";

/** How a field/column should render on a live PIP — explicit type plus
 * sensible inference from the label so HR doesn't have to re-type dates
 * and yes/no answers. */
export type PipControlInputType =
  | "text"
  | "textarea"
  | "date"
  | "number"
  | "select"
  | "yesno"
  | "signature";

export interface PipControlSpec {
  inputType: PipControlInputType;
  options?: string[];
  placeholder?: string;
}

const YES_NO = ["Yes", "No", "N/A"] as const;
const OUTCOME = ["Met", "Partially met", "Not met", "N/A"] as const;
const PROGRESS = ["On track", "At risk", "Behind", "Complete"] as const;
const DURATION = ["30 days", "60 days", "90 days"] as const;
const SATISFACTION = ["Satisfactory", "Needs improvement", "Unsatisfactory", "N/A"] as const;

function norm(label: string): string {
  return label.toLowerCase().trim();
}

function looksLikeDateLabel(label: string): boolean {
  const l = norm(label);
  return /\b(date|due|deadline|week ending|commenced|scheduled|review date|end date|start date|by when)\b/.test(
    l,
  );
}

function looksLikeYesNoLabel(label: string): boolean {
  const l = norm(label);
  return (
    /\?\s*$/.test(label.trim()) ||
    /\b(yes\s*\/\s*no|y\/n|met\s*\/?\s*not|achieved\s*\/?\s*not|completed\s*\?)\b/.test(l) ||
    l === "met" ||
    l === "achieved" ||
    l === "completed"
  );
}

function looksLikeOutcomeLabel(label: string): boolean {
  const l = norm(label);
  return /\b(outcome|result|compliance status|final outcome)\b/.test(l);
}

function looksLikeProgressLabel(label: string): boolean {
  const l = norm(label);
  return /\b(progress|status|on track)\b/.test(l) && !l.includes("employment");
}

function looksLikeDurationLabel(label: string): boolean {
  const l = norm(label);
  return /\b(duration|pip period|plan length|pip length)\b/.test(l);
}

function looksLikeLongTextLabel(label: string): boolean {
  const l = norm(label);
  return /\b(comment|note|summary|description|detail|evidence|action plan|support|intervention|observation|feedback|reason|gap|objective|goal|measure)\b/.test(
    l,
  );
}

function looksLikeSignatureLabel(label: string): boolean {
  const l = norm(label);
  return /\b(sign|signature|acknowledge|acknowledgement|initials)\b/.test(l);
}

/** Competency / re-assessment — pick a practical task instead of typing. */
export function isTaskAssignedColumn(column: { label: string }): boolean {
  const l = norm(column.label);
  return (
    /task assigned|assigned task|practical task|task to assess|re.?assessment task/.test(l) ||
    (/\btask\b/.test(l) && /\bassigned|assess|practical\b/.test(l))
  );
}

/** Pick dropdown options from a column/field label when none were stored. */
export function inferSelectOptions(label: string): string[] | null {
  const l = norm(label);
  if (looksLikeDurationLabel(label)) return [...DURATION];
  if (looksLikeYesNoLabel(label)) return [...YES_NO];
  if (looksLikeOutcomeLabel(label)) return [...OUTCOME];
  if (looksLikeProgressLabel(label)) return [...PROGRESS];
  if (/\b(rating|performance level|level achieved)\b/.test(l)) return [...SATISFACTION];
  if (/\b(outcome|status|result)\b/.test(l)) return [...OUTCOME];
  return null;
}

export function resolvePipControlFromLabelAndType(
  label: string,
  explicitType?: PipFieldType | null,
  explicitOptions?: string[] | null,
): PipControlSpec {
  if (explicitType === "signature" || looksLikeSignatureLabel(label)) {
    return {
      inputType: "signature",
      placeholder: "Type full name to acknowledge",
    };
  }

  if (explicitType === "textarea" || looksLikeLongTextLabel(label)) {
    return { inputType: "textarea" };
  }

  if (explicitType === "date" || looksLikeDateLabel(label)) {
    return { inputType: "date" };
  }

  if (explicitType === "number") {
    return { inputType: "number", placeholder: "Enter a number" };
  }

  if (explicitType === "select" && explicitOptions?.length) {
    return { inputType: "select", options: explicitOptions };
  }

  const inferred = inferSelectOptions(label);
  if (inferred) {
    return {
      inputType: looksLikeYesNoLabel(label) ? "yesno" : "select",
      options: inferred,
    };
  }

  if (explicitType === "select") {
    return { inputType: "select", options: explicitOptions ?? ["—"] };
  }

  return {
    inputType: "text",
    placeholder: looksLikeDateLabel(label) ? undefined : "Enter text…",
  };
}

export function resolvePipFieldControl(field: PipField): PipControlSpec {
  if (isSystemField(field)) {
    return { inputType: "text" };
  }
  return resolvePipControlFromLabelAndType(
    field.label,
    field.type,
    field.type === "select" ? field.options : undefined,
  );
}

export function resolvePipColumnControl(column: PipTableColumn): PipControlSpec {
  if (isAutoIncrementColumn(column)) {
    return { inputType: "text" };
  }
  if (isSupportActionColumn(column)) {
    return { inputType: "text" };
  }
  if (isEvidenceColumn(column)) {
    return { inputType: "text" };
  }
  if (isTaskAssignedColumn(column)) {
    return { inputType: "select", options: column.options ?? [] };
  }
  return resolvePipControlFromLabelAndType(
    column.label,
    column.type,
    column.options,
  );
}

/** Row index columns — No., #, S/N, Review, Week, etc. */
export function isAutoIncrementColumn(column: PipTableColumn): boolean {
  const compact = column.label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9#]/g, "");

  const AUTO = new Set([
    "no",
    "#",
    "sn",
    "serial",
    "itemno",
    "rowno",
    "rownumber",
    "review",
    "reviewno",
    "reviewnumber",
    "week",
    "weekno",
    "weeknumber",
  ]);

  return AUTO.has(compact);
}

/** Keep auto-number columns in sync with row order (1-based). */
export function applyTableRowAutoIncrement(
  section: PipTableSection,
  rows: Array<Record<string, string | number | null>>,
): Array<Record<string, string | number | null>> {
  const autoKeys = section.columns.filter(isAutoIncrementColumn).map((c) => c.key);
  if (!autoKeys.length) return rows;

  return rows.map((row, index) => {
    const next = { ...row };
    for (const key of autoKeys) {
      next[key] = String(index + 1);
    }
    return next;
  });
}

/** Plain-language guidance shown above each section so HR knows what to do. */
export function pipSectionFillHint(section: PipSection): string | null {
  const role = detectPipSectionRole(section);

  switch (role) {
    case "gaps":
      return "Review each performance gap below. One issue per row.";
    case "root_cause":
      return "Diagnose why for each gap with the employee (Skill, Will, or System).";
    case "support":
      return "Support types are filled from your PIP form setup. Confirm who will provide each and by when.";
    case "objectives":
      return "Set one SMART objective per row. Anchor each target in measured data (herd records, KPIs) and use the date picker for target dates.";
    case "coaching":
      return "Add a row after each coaching session. Use the calendar for dates and keep brief contemporaneous notes.";
    case "reviews":
      return "Record each formal checkpoint. Use the status dropdown (On track / Partial / Off track) — compare progress against the baselines.";
    case "competency":
      return "Where an objective involves a practical skill, confirm improvement through observed assessment — not opinion alone.";
    case "employee_comments":
      return "The employee records their view of the plan, support received, and any factors affecting performance.";
    case "outcome":
      return "Complete at the end of the PIP. Select the final outcome and summarise the recommendation.";
    case "signatures":
      return "Each person signs to confirm the plan was discussed and understood. Signatures confirm participation, not necessarily agreement.";
    case "hr_only":
      return "HR completes this section. Supervisors do not see it on the live PIP.";
    default:
      break;
  }

  const t = section.title.toLowerCase();
  if (/employee|plan detail|pip detail/.test(t)) {
    return "Review the auto-filled employee details. Use the calendar for dates and pick PIP duration from the list — don't type dates manually.";
  }
  if (section.kind === "table") {
    return "Fill one row per item. Use calendar and dropdown fields where shown instead of typing free text.";
  }
  if (section.kind === "fields") {
    return "Use the pickers and dropdowns provided — dates and choices should not be typed as plain text.";
  }
  return null;
}
