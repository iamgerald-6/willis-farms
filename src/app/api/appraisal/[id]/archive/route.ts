import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireAuth,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { canArchiveAppraisal } from "@/lib/accessControl";

/**
 * Archive / restore an appraisal.
 *
 * Archiving files a record away without deleting it: archived appraisals are
 * hidden from the default list, frozen against edits, and skipped by the
 * reminder/lock cron.
 *
 * Who may archive:
 *   - Manager / Super Admin → yes
 *   - Admin → only when Manage User has granted Edit on Appraisal
 *   - Everyone else → no
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    if (!canArchiveAppraisal(caller.role, caller.page_permission_levels)) {
      return jsonForbidden(
        caller.role === "admin"
          ? "Admins cannot archive appraisals unless Edit on Appraisal is granted in Manage User."
          : "Only managers can archive appraisals.",
      );
    }

    if (!id) {
      return NextResponse.json(
        { error: "Appraisal ID is required" },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const archived = body?.archived !== false;

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("appraisals")
      .select("id, archived")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Appraisal not found" },
        { status: 404 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("appraisals")
      .update(
        archived
          ? {
              archived: true,
              archived_at: new Date().toISOString(),
              archived_by: caller.id,
              archived_by_name: caller.name,
            }
          : {
              archived: false,
              archived_at: null,
              archived_by: null,
              archived_by_name: null,
            },
      )
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[POST /api/appraisal/[id]/archive]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
