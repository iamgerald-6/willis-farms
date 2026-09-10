import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getApiRequestUser,
  jsonForbidden,
  jsonUnauthorized,
} from "@/lib/apiRequestAuth";
import {
  canApproveLeaveSignoffStage,
  canApproveLeaveSupervisorStage,
  getLeaveAuthContext,
} from "@/lib/leaveAccess";
import { resolveUserRoleLabelById } from "@/lib/userRoleAccessControl";
import {
  resolveSignoffRecipients,
  sendLeaveSignoffNotification,
} from "@/lib/leave/leaveNotifications";

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
      .select(
        "user_id, stage, leave_type, start_date, end_date, total_days, reason, users:user_id(supervisor_id, user_role_id, first_name, last_name)",
      )
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

    const applicant = existing.users as unknown as {
      supervisor_id?: string | null;
      user_role_id?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    } | null;

    const stage = (existing.stage as string | null) ?? "pending_supervisor";

    if (stage === "approved" || stage === "rejected") {
      return NextResponse.json(
        { error: "This leave request has already been finalized." },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();

    if (stage === "pending_supervisor") {
      if (
        !canApproveLeaveSupervisorStage(
          caller.id,
          existing.user_id,
          applicant?.supervisor_id,
          caller.role,
        )
      ) {
        return jsonForbidden(
          "Forbidden — only this employee's assigned supervisor can approve this stage.",
        );
      }

      if (status === "rejected") {
        const { data, error } = await supabaseAdmin
          .from("leave_requests")
          .update({
            status: "rejected",
            stage: "rejected",
            supervisor_reviewed_by: reviewed_by,
            supervisor_reviewed_at: nowIso,
            supervisor_note: admin_note ?? null,
            admin_note: admin_note ?? null,
            reviewed_by,
            reviewed_at: nowIso,
          })
          .eq("id", leave_id)
          .select()
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ data });
      }

      // Approved at stage 1 — move to stage 2 and notify HR/Executive.
      const { data, error } = await supabaseAdmin
        .from("leave_requests")
        .update({
          stage: "pending_signoff",
          supervisor_reviewed_by: reviewed_by,
          supervisor_reviewed_at: nowIso,
          supervisor_note: admin_note ?? null,
        })
        .eq("id", leave_id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      try {
        const applicantRoleLabel = await resolveUserRoleLabelById(
          supabaseAdmin,
          applicant?.user_role_id,
        );
        const recipients = await resolveSignoffRecipients(
          supabaseAdmin,
          applicantRoleLabel,
        );
        const employeeName =
          `${applicant?.first_name ?? ""} ${applicant?.last_name ?? ""}`.trim() ||
          "An employee";
        await sendLeaveSignoffNotification(recipients, {
          employeeName,
          leaveType: existing.leave_type,
          startDate: existing.start_date,
          endDate: existing.end_date,
          totalDays: existing.total_days,
          reason: existing.reason,
        });
      } catch (notifyError) {
        console.error("[leave/review] sign-off notification failed", notifyError);
      }

      return NextResponse.json({ data });
    }

    // stage === "pending_signoff"
    const applicantRoleLabel = await resolveUserRoleLabelById(
      supabaseAdmin,
      applicant?.user_role_id,
    );

    if (
      !canApproveLeaveSignoffStage(
        caller.id,
        existing.user_id,
        applicantRoleLabel,
        caller.role,
      )
    ) {
      return jsonForbidden(
        "Forbidden — only Human Resource or Executive Role can sign off this request.",
      );
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .update({
        status,
        stage: status,
        admin_note: admin_note ?? null,
        reviewed_by,
        reviewed_at: nowIso,
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
