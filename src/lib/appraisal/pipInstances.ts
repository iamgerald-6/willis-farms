import type { SupabaseClient } from "@supabase/supabase-js";
import { overlayPlacementFromApplications } from "@/lib/careers/resolveEmployeeOrgPlacement";
import {
  fetchUserRoleLabelMap,
  isHumanResourceRoleLabel,
} from "@/lib/userRoleAccessControl";
import type { PipFormSchema } from "./pipFormSchema";
import {
  type GradeTemplateOrgPlacement,
  hasCompleteOrgPlacement,
} from "./gradeTemplates";
import { type PipFormTemplate, PIP_PLACEMENT_COLUMNS } from "./pipTemplates";
import { PROMOTION_ELIGIBLE_THRESHOLD } from "./scoring";

export type PipTemplateOrgPlacement = GradeTemplateOrgPlacement;

export type AppraisalPipStatus = "draft" | "active" | "completed";

/** Only draft PIPs may be edited — once submitted (active/completed) the form is read-only. */
export function isPipEditableStatus(
  status: AppraisalPipStatus | string | null | undefined,
): boolean {
  return status === "draft" || status == null;
}

/** Row shape for the appraisal PIP list tab (submitted plans only). */
export interface PipListItem {
  id: string;
  appraisal_id: string;
  employee_user_id: string;
  status: AppraisalPipStatus;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
  employee_name: string;
  job_title: string;
  review_quarter: string;
  review_year: number;
  final_quarter_score: number | null;
  company_id: string | null;
}

export interface AppraisalPip {
  id: string;
  appraisal_id: string;
  employee_user_id: string;
  pip_template_id: string;
  template_version_id: string;
  form_schema: PipFormSchema;
  form_responses: PipFormResponses;
  status: AppraisalPipStatus;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Saved answers for a live PIP instance. */
export interface PipFormResponses {
  /** Single-value fields keyed by PipField.key */
  fields?: Record<string, string | number | null>;
  /** Repeating table rows keyed by PipSection.key */
  tables?: Record<string, Array<Record<string, string | number | null>>>;
}

/** Postgres `numeric` columns often arrive as strings from Supabase. */
export function parseQuarterScore(
  score: number | string | null | undefined,
): number | null {
  if (score == null || score === "") return null;
  if (typeof score === "number") {
    return Number.isFinite(score) ? score : null;
  }
  const parsed = Number(score);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isPipEligible(appraisal: {
  status?: string | null;
  final_quarter_score?: number | string | null;
}): boolean {
  const score = parseQuarterScore(appraisal.final_quarter_score);
  return (
    String(appraisal.status ?? "").trim() === "final_reviewed" &&
    score != null &&
    score < PROMOTION_ELIGIBLE_THRESHOLD
  );
}

/** Same filter shape as POST /api/appraisal/pip-templates find-or-create. */
function placementMatchFilter(
  placement: Required<GradeTemplateOrgPlacement>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of PIP_PLACEMENT_COLUMNS) {
    out[col] = String(placement[col]);
  }
  return out;
}

function parseFormSchema(raw: unknown): PipFormSchema | null {
  if (raw == null) return null;
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof value !== "object") return null;
  const schema = value as PipFormSchema;
  if (!Array.isArray(schema.sections) || schema.sections.length === 0) {
    return null;
  }
  return schema;
}

export async function findPipTemplateForPlacement(
  supabase: SupabaseClient,
  placement: GradeTemplateOrgPlacement,
): Promise<(PipFormTemplate & { form_schema: PipFormSchema }) | null> {
  if (!hasCompleteOrgPlacement(placement)) return null;

  const filter = placementMatchFilter(placement);

  let template: PipFormTemplate | null = null;
  let templateError: { message: string } | null = null;

  const matchResult = await supabase
    .from("pip_form_templates")
    .select("*")
    .match(filter)
    .maybeSingle();
  template = (matchResult.data as PipFormTemplate | null) ?? null;
  templateError = matchResult.error;

  // Fallback: some PostgREST setups coerce site_id (integer column) differently
  // than .match with string ids — retry with an explicit numeric site_id filter.
  if (!template && !templateError) {
    const numericSiteResult = await supabase
      .from("pip_form_templates")
      .select("*")
      .eq("site_id", Number(placement.site_id))
      .eq("business_unit_id", placement.business_unit_id)
      .eq("department_id", placement.department_id)
      .eq("section_id", placement.section_id)
      .eq("position_id", placement.position_id)
      .eq("grade_level_id", placement.grade_level_id)
      .maybeSingle();
    template = (numericSiteResult.data as PipFormTemplate | null) ?? null;
    templateError = numericSiteResult.error;
  }

  if (templateError || !template?.active_version_id) return null;

  const { data: version, error: versionError } = await supabase
    .from("pip_form_template_versions")
    .select("id, form_schema")
    .eq("id", template.active_version_id)
    .maybeSingle();

  const formSchema = parseFormSchema(version?.form_schema);
  if (versionError || !formSchema) return null;

  return {
    ...(template as PipFormTemplate),
    form_schema: formSchema,
    active_version_id: version!.id,
  };
}

/** Load org placement the same way get_user does (overlay from application if needed). */
export async function fetchEmployeeOrgPlacement(
  supabase: SupabaseClient,
  employeeUserId: string | null | undefined,
): Promise<GradeTemplateOrgPlacement | null> {
  if (!employeeUserId) return null;

  // users.user_id is varchar; appraisals.employee_user_id is uuid — compare as text.
  const { data: employee, error } = await supabase
    .from("users")
    .select(
      "user_id, application_id, site_id, business_unit_id, department_id, section_id, position_id, grade_level_id",
    )
    .eq("user_id", String(employeeUserId))
    .maybeSingle();

  if (error || !employee) return null;

  const [withOverlay] = await overlayPlacementFromApplications(supabase, [employee]);
  return employeePlacementFromUser(withOverlay ?? employee);
}

export interface HrFacilitatorOption {
  user_id: string;
  name: string;
}

/** Staff with the Human Resource user role — for the HR facilitator picker. */
export async function fetchHumanResourceFacilitators(
  supabase: SupabaseClient,
): Promise<HrFacilitatorOption[]> {
  const roleMap = await fetchUserRoleLabelMap(supabase);
  const hrRoleIds = [...roleMap.entries()]
    .filter(([, label]) => isHumanResourceRoleLabel(label))
    .map(([id]) => id);

  if (!hrRoleIds.length) return [];

  const { data, error } = await supabase
    .from("users")
    .select("user_id, first_name, last_name")
    .in("user_role_id", hrRoleIds)
    .order("first_name");

  if (error || !data) return [];

  return data.map((row) => ({
    user_id: String(row.user_id),
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || String(row.user_id),
  }));
}

export async function resolvePlacementPositionLabel(
  supabase: SupabaseClient,
  positionId: string | null | undefined,
): Promise<string | null> {
  if (!positionId) return null;
  const { data } = await supabase
    .from("custom_position")
    .select("label")
    .eq("id", positionId)
    .maybeSingle();
  return data?.label?.trim() ? String(data.label) : null;
}

export function employeePlacementFromUser(row: Record<string, unknown>): GradeTemplateOrgPlacement {
  const out: Record<string, string | null | undefined> = {};
  for (const col of PIP_PLACEMENT_COLUMNS) {
    out[col] = row[col] != null ? String(row[col]) : null;
  }
  return {
    site_id: out.site_id,
    business_unit_id: out.business_unit_id,
    department_id: out.department_id,
    section_id: out.section_id,
    position_id: out.position_id,
    grade_level_id: out.grade_level_id,
  };
}
