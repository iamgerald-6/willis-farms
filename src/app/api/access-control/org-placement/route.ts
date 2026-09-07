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

const ORG_PLACEMENT_MIGRATION_HINT =
  " Run docs/access-control/users-org-placement.sql in Supabase, then: NOTIFY pgrst, 'reload schema';";

const ORG_PLACEMENT_FIELDS = [
  "site_id",
  "business_unit_id",
  "department_id",
  "section_id",
  "position_id",
  "grade_level_id",
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

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[PATCH /api/access-control/org-placement]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
