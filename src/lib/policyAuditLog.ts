import { createClient } from "@supabase/supabase-js";

export type PolicyAuditAction = "added" | "version_added" | "edited" | "deleted";

/**
 * Writes one row to policy_audit_log (see docs/policies/policy-audit-log.sql).
 * Mirrors writeSopAuditLog in sopAuditLog.ts — fire-and-forget: an audit-log
 * failure is logged but never blocks the actual manual operation that
 * triggered it.
 */
export async function writePolicyAuditLog(params: {
  manual_id: string;
  manual_title: string;
  action: PolicyAuditAction;
  detail?: string | null;
  performed_by?: string | null;
  performed_by_name?: string | null;
}) {
  if (!params.performed_by || !params.performed_by_name) {
    // No caller identity supplied — nothing meaningful to log. Logged
    // explicitly rather than failing silently, so "skipped, no identity" is
    // distinguishable from "DB insert failed" in the server logs.
    console.warn("[writePolicyAuditLog] Skipped — missing performer info", {
      manual_id: params.manual_id,
      action: params.action,
      performed_by: params.performed_by,
      performed_by_name: params.performed_by_name,
    });
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[writePolicyAuditLog] Missing Supabase environment variables");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { error } = await supabase.from("policy_audit_log").insert([
    {
      manual_id: params.manual_id,
      manual_title: params.manual_title,
      action: params.action,
      detail: params.detail ?? null,
      performed_by: params.performed_by,
      performed_by_name: params.performed_by_name,
      performed_at: new Date().toISOString(),
    },
  ]);
  if (error) {
    console.error("[writePolicyAuditLog] Insert failed:", error);
  } else {
    console.log(
      `[writePolicyAuditLog] Logged "${params.action}" for manual ${params.manual_id} by ${params.performed_by_name}`,
    );
  }
}
