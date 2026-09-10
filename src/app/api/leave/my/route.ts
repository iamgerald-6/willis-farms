import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireAuth,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { isSeniorManagement } from "@/lib/taskAccessControl";
import { fetchLeaveAnnualCapDays } from "@/lib/leave/leavePolicy";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  try {
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");

    if (!user_id) {
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    if (user_id !== caller.id && !isSeniorManagement(caller.role)) {
      return jsonForbidden("You can only view your own leave requests.");
    }

    const currentYear = new Date().getFullYear();

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Resolve reviewer names (both the stage-1 supervisor and the final
    // stage-2 sign-off) so employees can see who acted at each step.
    const reviewerIds = [
      ...new Set(
        (data ?? [])
          .flatMap((r) => [r.reviewed_by, r.supervisor_reviewed_by])
          .filter((id): id is string => !!id),
      ),
    ];

    let reviewerNameById: Record<string, string> = {};
    if (reviewerIds.length > 0) {
      const { data: reviewers } = await supabaseAdmin
        .from("users")
        .select("user_id, first_name, last_name")
        .in("user_id", reviewerIds);
      reviewerNameById = Object.fromEntries(
        (reviewers ?? []).map((u) => [
          u.user_id,
          `${u.first_name} ${u.last_name}`.trim(),
        ]),
      );
    }

    const enrichedData = (data ?? []).map((r) => ({
      ...r,
      reviewed_by_name: r.reviewed_by
        ? reviewerNameById[r.reviewed_by] ?? "Unknown"
        : null,
      supervisor_reviewed_by_name: r.supervisor_reviewed_by
        ? reviewerNameById[r.supervisor_reviewed_by] ?? "Unknown"
        : null,
    }));

    // Counts approved leave requests of any type (Annual, Sick, Casual,
    // etc.) taken this year toward the annual cap — not just Annual leave —
    // since all leave taken reduces the days an employee has left for the
    // year, regardless of type.
    const usedDays =
      data
        ?.filter(
          (r) =>
            r.status === "approved" &&
            new Date(r.start_date).getFullYear() === currentYear,
        )
        .reduce((sum, r) => sum + r.total_days, 0) ?? 0;

    const total = await fetchLeaveAnnualCapDays(supabaseAdmin);

    return NextResponse.json({
      data: enrichedData,
      balance: {
        total,
        used: usedDays,
        remaining: Math.max(0, total - usedDays),
      },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
