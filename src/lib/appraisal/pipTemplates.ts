import type { PipFormSchema } from "./pipFormSchema";

/**
 * PIP form template — one per exact Site/Business unit/Department/Section/
 * Position/Grade level combination, same six-column org placement as
 * AppraisalGradeTemplate (see src/lib/appraisal/gradeTemplates.ts and
 * docs/appraisal/pip-form-templates.sql).
 */
export interface PipFormTemplate {
  id: string;
  site_id: string;
  business_unit_id: string;
  department_id: string;
  section_id: string;
  position_id: string;
  grade_level_id: string;
  name: string;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipFormTemplateVersion {
  id: string;
  template_id: string;
  version_number: number;
  source_file_url: string | null;
  source_file_name: string | null;
  source_cloudinary_public_id: string | null;
  form_schema: PipFormSchema;
  extracted_at: string | null;
  published_at: string | null;
  published_by: string | null;
  published_by_name: string | null;
  created_at: string;
}

/** Same org-placement chain as appraisal grade templates. */
export const PIP_SCOPE_CHAIN = [
  "sites",
  "business_units",
  "departments",
  "sections",
  "custom_position",
  "grade_levels",
] as const;

export const PIP_PLACEMENT_COLUMNS = [
  "site_id",
  "business_unit_id",
  "department_id",
  "section_id",
  "position_id",
  "grade_level_id",
] as const;
