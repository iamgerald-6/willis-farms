import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  requireAuth,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { isSeniorManagement } from "@/lib/taskAccessControl";
import { fetchSystemOptionByLegacyValue } from "@/lib/systemDefinitions";
import {
  fetchLeaveAnnualCapDays,
} from "@/lib/leave/leavePolicy";
import { resolveInitialLeaveStage } from "@/lib/leaveAccess";
import { resolveUserRoleLabelById } from "@/lib/userRoleAccessControl";
import {
  resolveSignoffRecipients,
  sendLeaveSignoffNotification,
  sendLeaveSupervisorNotification,
} from "@/lib/leave/leaveNotifications";

const LEAVE_MODULE_ID = "mod:leave";
const LEAVE_TYPES_LIST = "leave.types";

export async function POST(req: NextRequest) {
  try {
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    const {
      user_id,
      leave_type,
      reason,
      start_date,
      end_date,
      total_days,
      document_url,
    } = await req.json();

    if (!user_id || !leave_type || !start_date || !end_date || !total_days) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (user_id !== caller.id && !isSeniorManagement(caller.role)) {
      return jsonForbidden("You can only submit leave for yourself.");
    }

    if (new Date(start_date) > new Date(end_date)) {
      return NextResponse.json(
        { error: "Start date cannot be after end date" },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdminFromAuth();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const leaveOption = await fetchSystemOptionByLegacyValue(
      supabaseAdmin,
      LEAVE_MODULE_ID,
      LEAVE_TYPES_LIST,
      String(leave_type),
    );

    if (!leaveOption) {
      return NextResponse.json(
        { error: "Invalid leave type" },
        { status: 400 },
      );
    }

    if (leaveOption.rules.requires_reason && !String(reason ?? "").trim()) {
      return NextResponse.json(
        { error: "A reason is required for this leave type" },
        { status: 400 },
      );
    }

    if (leaveOption.rules.requires_document && !document_url) {
      return NextResponse.json(
        { error: "A supporting document is required for this leave type" },
        { status: 400 },
      );
    }

    if (leave_type === "Annual") {
      const annualCap = await fetchLeaveAnnualCapDays(supabaseAdmin);
      const currentYear = new Date().getFullYear();
      const { data: existing } = await supabaseAdmin
        .from("leave_requests")
        .select("total_days")
        .eq("user_id", user_id)
        .eq("leave_type", "Annual")
        .eq("status", "approved")
        .gte("start_date", `${currentYear}-01-01`)
        .lte("end_date", `${currentYear}-12-31`);

      const usedDays = existing?.reduce((sum, r) => sum + r.total_days, 0) ?? 0;
      if (usedDays + total_days > annualCap) {
        return NextResponse.json(
          {
            error: `You only have ${
              Math.max(0, annualCap - usedDays)
            } annual leave days remaining this year.`,
          },
          { status: 400 },
        );
      }
    }

    // Two-stage approval (see docs/leave/two-stage-approval.sql): stage 1 is
    // the applicant's assigned supervisor; an applicant with no supervisor
    // set skips straight to stage 2 (HR/Executive sign-off). Re-resolved
    // fresh on every application — not hardcoded per role — so assigning a
    // supervisor later automatically routes that employee's next request
    // through the normal two-stage flow.
    const { data: applicant } = await supabaseAdmin
      .from("users")
      .select("supervisor_id, user_role_id, first_name, last_name")
      .eq("user_id", user_id)
      .maybeSingle();

    const stage = resolveInitialLeaveStage(applicant?.supervisor_id ?? null);

    const insertRow: Record<string, unknown> = {
      user_id,
      leave_type,
      reason: reason ?? null,
      start_date,
      end_date,
      total_days,
      stage,
    };
    if (document_url) {
      insertRow.document_url = document_url;
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .insert([insertRow])
      .select()
      .single();

    if (error) {
      const msg = error.message ?? "";
      const missingDocumentColumn =
        insertRow.document_url != null &&
        (msg.toLowerCase().includes("document_url") ||
          msg.toLowerCase().includes("schema cache") ||
          msg.toLowerCase().includes("could not find"));
      const missingStageColumn =
        msg.toLowerCase().includes("stage") &&
        (msg.toLowerCase().includes("schema cache") ||
          msg.toLowerCase().includes("could not find"));
      return NextResponse.json(
        {
          error: missingDocumentColumn
            ? "leave_requests is missing document_url. Run docs/leave/leave-requests-document-url.sql in the Supabase SQL editor, then retry."
            : missingStageColumn
              ? "leave_requests is missing stage. Run docs/leave/two-stage-approval.sql in the Supabase SQL editor, then retry."
              : msg,
        },
        { status: 500 },
      );
    }

    // Notify whoever needs to act next — best-effort, never blocks the
    // response if email sending fails.
    const employeeName =
      `${applicant?.first_name ?? ""} ${applicant?.last_name ?? ""}`.trim() ||
      "An employee";
    const requestSummary = {
      employeeName,
      leaveType: leave_type,
      startDate: start_date,
      endDate: end_date,
      totalDays: total_days,
      reason: reason ?? null,
    };

    try {
      if (stage === "pending_supervisor" && applicant?.supervisor_id) {
        const { data: supervisor } = await supabaseAdmin
          .from("users")
          .select("email, first_name, last_name")
          .eq("user_id", applicant.supervisor_id)
          .maybeSingle();
        if (supervisor?.email) {
          await sendLeaveSupervisorNotification(
            {
              email: supervisor.email,
              name:
                `${supervisor.first_name ?? ""} ${supervisor.last_name ?? ""}`.trim() ||
                supervisor.email,
            },
            requestSummary,
          );
        }
      } else {
        const applicantRoleLabel = await resolveUserRoleLabelById(
          supabaseAdmin,
          applicant?.user_role_id,
        );
        const recipients = await resolveSignoffRecipients(
          supabaseAdmin,
          applicantRoleLabel,
        );
        await sendLeaveSignoffNotification(recipients, requestSummary);
      }
    } catch (notifyError) {
      console.error("[leave/apply] notification failed", notifyError);
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
