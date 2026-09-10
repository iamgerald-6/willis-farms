import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getApiRequestUser,
  jsonForbidden,
  jsonUnauthorized,
} from "@/lib/apiRequestAuth";
import { canApproveLeaveRequest, getLeaveAuthContext } from "@/lib/leaveAccess";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export async function PATCH(req: NextRequest) {
  try {
    const caller = await getApiRequestUser(req);
    if (!caller) return jsonUnauthorized();

    const { leave_id, status, admin_note, reviewed_by } = await req.json();

    if (!leave_id || !status || !reviewed_by) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (reviewed_by !== caller.id) {
      return jsonForbidden("reviewed_by must match the authenticated user.");
    }

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Self-approval block: fetch who the request actually belongs to before
    // touching it — a Senior Management caller can review anyone else's
    // leave, but never their own, regardless of what the client sent.
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("leave_requests")
      .select("user_id, users:user_id(supervisor_id)")
      .eq("id", leave_id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 },
      );
    }

    if (existing.user_id === caller.id) {
      return jsonForbidden("You cannot approve or reject your own leave request.");
    }

    const ctx = await getLeaveAuthContext(req);
    if (!ctx) {
      return jsonForbidden(
        "Forbidden — leave review access, or being this employee's assigned supervisor, is required.",
      );
    }

    const requesterSupervisorId = (
      existing.users as unknown as { supervisor_id?: string | null } | null
    )?.supervisor_id;

    if (
      !canApproveLeaveRequest(
        caller.id,
        existing.user_id,
        requesterSupervisorId,
        ctx.profile,
        caller.role,
        ctx.presets,
      )
    ) {
      return jsonForbidden(
        "Forbidden — you may only approve leave for employees assigned to you.",
      );
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .update({
        status,
        admin_note: admin_note ?? null,
        reviewed_by,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", leave_id)
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
