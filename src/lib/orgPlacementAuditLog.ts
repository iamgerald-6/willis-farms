import { createClient } from "@supabase/supabase-js";

export const ORG_PLACEMENT_AUDIT_FIELDS = [
  "site_id",
  "business_unit_id",
  "department_id",
  "section_id",
  "position_id",
  "grade_level_id",
  "user_role_id",
] as const;

export type OrgPlacementAuditField = (typeof ORG_PLACEMENT_AUDIT_FIELDS)[number];

/**
 * Writes one row per changed org-placement field to org_placement_audit_log
 * (see docs/access-control/org-placement-audit-log.sql) — added as part of
 * the multi-site access architecture (docs/SITE_ACCESS_ARCHITECTURE.md) so
 * future site transfers are recorded, unlike every org-placement edit
 * before this. Mirrors writeSopAuditLog's fire-and-forget shape: an
 * audit-log failure is logged but never blocks the actual org-placement
 * update that triggered it. Only fields that actually changed value
 * (comparing old vs new, both normalized to string|null) get a row —
 * saving a form with 6 fields but only 1 actually different writes 1 row,
 * not 6.
 */
export async function writeOrgPlacementAuditLog(params: {
  target_user_id: string;
  before: Partial<Record<OrgPlacementAuditField, string | null>>;
  after: Partial<Record<OrgPlacementAuditField, string | null>>;
  performed_by?: string | null;
  performed_by_name?: string | null;
}) {
  const changedFields = ORG_PLACEMENT_AUDIT_FIELDS.filter((field) => {
    if (!(field in params.after)) return false;
    const oldValue = params.before[field] ?? null;
    const newValue = params.after[field] ?? null;
    return oldValue !== newValue;
  });

  if (changedFields.length === 0) return;

  if (!params.performed_by || !params.performed_by_name) {
    console.warn("[writeOrgPlacementAuditLog] Skipped — missing performer info", {
      target_user_id: params.target_user_id,
      changedFields,
    });
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[writeOrgPlacementAuditLog] Missing Supabase environment variables");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const rows = changedFields.map((field) => ({
    target_user_id: params.target_user_id,
    field_name: field,
    old_value: params.before[field] ?? null,
    new_value: params.after[field] ?? null,
    performed_by: params.performed_by,
    performed_by_name: params.performed_by_name,
    performed_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("org_placement_audit_log").insert(rows);
  if (error) {
    console.error("[writeOrgPlacementAuditLog] Insert failed:", error);
  } else {
    console.log(
      `[writeOrgPlacementAuditLog] Logged ${rows.length} field change(s) for user ${params.target_user_id}: ${changedFields.join(", ")}`,
    );
  }
}
