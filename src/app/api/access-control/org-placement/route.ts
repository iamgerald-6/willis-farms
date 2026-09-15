import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireUserManagementAccess,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import {
  isMissingColumnError,
  updateUserWithColumnFallback,
} from "@/lib/supabaseUserUpdate";
import { writeOrgPlacementAuditLog, ORG_PLACEMENT_AUDIT_FIELDS } from "@/lib/orgPlacementAuditLog";

const ORG_PLACEMENT_MIGRATION_HINT =
  " Run docs/access-control/users-org-placement.sql (and, for User role, docs/access-control/users-org-placement-user-role.sql) in Supabase, then: NOTIFY pgrst, 'reload schema';";

const ORG_PLACEMENT_FIELDS = [
  "site_id",
  "business_unit_id",
  "department_id",
  "section_id",
  "position_id",
  "grade_level_id",
  "user_role_id",
] as const;

export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireUserManagementAccess(req, "edit");
  if (!caller) {
    return jsonForbidden("Forbidden — User Management edit access required.");
  }

  try {
    const body = await req.json();
    const target_user_id = String(body.target_user_id ?? "").trim();
    if (!target_user_id) {
      return NextResponse.json(
        { error: "target_user_id is required" },
        { status: 400 },
      );
    }

    const updates: Record<string, string | null> = {};
    for (const field of ORG_PLACEMENT_FIELDS) {
      if (field in body) {
        const raw = body[field];
        updates[field] = raw == null || raw === "" ? null : String(raw).trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No org placement fields provided." },
        { status: 400 },
      );
    }

    // Keep the free-text job_position snapshot aligned with Position (FK).
    if ("position_id" in updates) {
      const positionId = updates.position_id;
      if (positionId) {
        const { data: positionRow } = await supabaseAdmin
          .from("custom_position")
          .select("label")
          .eq("id", positionId)
          .maybeSingle();
        updates.job_position = positionRow?.label?.trim() || null;
      } else {
        updates.job_position = null;
      }
    }

    // Snapshot the BEFORE values for whichever org-placement fields are
    // actually being changed, so writeOrgPlacementAuditLog below can log
    // exactly what moved (e.g. site_id: "3" -> "5") — see
    // docs/access-control/org-placement-audit-log.sql. Best-effort: a
    // failure here shouldn't block the actual org-placement update, so the
    // "before" snapshot degrades to empty (no audit row written for this
    // save) rather than failing the request.
    const auditFields = ORG_PLACEMENT_AUDIT_FIELDS.filter((f) => f in updates);
    let before: Partial<Record<(typeof ORG_PLACEMENT_AUDIT_FIELDS)[number], string | null>> = {};
    if (auditFields.length > 0) {
      const { data: beforeRow } = await supabaseAdmin
        .from("users")
        .select(auditFields.join(","))
        .eq("user_id", target_user_id)
        .maybeSingle();
      if (beforeRow) {
        const beforeRecord = beforeRow as unknown as Record<string, unknown>;
        before = Object.fromEntries(
          auditFields.map((f) => [f, beforeRecord[f] == null ? null : String(beforeRecord[f])]),
        );
      }
    }

    const { data, error } = await updateUserWithColumnFallback(
      supabaseAdmin,
      target_user_id,
      updates,
    );

    if (error) {
      if (isMissingColumnError(error.message)) {
        return NextResponse.json(
          { error: `Org placement columns are missing.${ORG_PLACEMENT_MIGRATION_HINT}` },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (auditFields.length > 0) {
      const after = Object.fromEntries(auditFields.map((f) => [f, updates[f] ?? null]));
      // Fire-and-forget — never block the response on audit logging.
      void writeOrgPlacementAuditLog({
        target_user_id,
        before,
        after,
        performed_by: caller.id,
        performed_by_name: caller.name,
      });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/access-control/org-placement]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
