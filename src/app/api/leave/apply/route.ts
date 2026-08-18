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

    const insertRow: Record<string, unknown> = {
      user_id,
      leave_type,
      reason: reason ?? null,
      start_date,
      end_date,
      total_days,
    };
    if (document_url) {
      insertRow.document_url = document_url;
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .insert([insertRow])
      .select()
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
