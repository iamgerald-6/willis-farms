import { createClient } from "@supabase/supabase-js";

export type SopAuditAction =
  | "added"
  | "edited"
  | "archived"
  | "restored"
  | "deleted";

/**
 * Writes one row to sop_audit_log (see docs/sop/sop-audit-log.sql). Mirrors
 * writeAuditLog in taskManagerData.ts — fire-and-forget: an audit-log
 * failure is logged but never blocks the actual SOP operation that
 * triggered it.
 */
export async function writeSopAuditLog(params: {
  content_id: string;
  content_title: string;
  action: SopAuditAction;
  performed_by?: string | null;
  performed_by_name?: string | null;
}) {
  if (!params.performed_by || !params.performed_by_name) {
    // No caller identity supplied — nothing meaningful to log. This used to
    // fail silently, which made it impossible to tell "skipped, no identity"
    // apart from "DB insert failed" from the server logs alone.
    console.warn(
      "[writeSopAuditLog] Skipped — missing performer info",
      {
        content_id: params.content_id,
        action: params.action,
        performed_by: params.performed_by,
        performed_by_name: params.performed_by_name,
      },
    );
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("[writeSopAuditLog] Missing Supabase environment variables");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { error } = await supabase.from("sop_audit_log").insert([
    {
      content_id: params.content_id,
      content_title: params.content_title,
      action: params.action,
      performed_by: params.performed_by,
      performed_by_name: params.performed_by_name,
      performed_at: new Date().toISOString(),
    },
  ]);
  if (error) {
    console.error("[writeSopAuditLog] Insert failed:", error);
  } else {
    console.log(
      `[writeSopAuditLog] Logged "${params.action}" for content ${params.content_id} by ${params.performed_by_name}`,
    );
  }
}
