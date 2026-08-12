import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireAuth,
  jsonUnauthorized,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import { isSeniorManagement } from "@/lib/taskAccessControl";

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

    // Resolve reviewer names so employees can see who approved/rejected.
    const reviewerIds = [
      ...new Set(
        (data ?? []).map((r) => r.reviewed_by).filter((id): id is string => !!id),
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
    }));

    const usedDays =
      data
        ?.filter(
          (r) =>
            r.leave_type === "Annual" &&
            r.status === "approved" &&
            new Date(r.start_date).getFullYear() === currentYear,
        )
        .reduce((sum, r) => sum + r.total_days, 0) ?? 0;

    return NextResponse.json({
      data: enrichedData,
      balance: {
        total: 30,
        used: usedDays,
        remaining: 30 - usedDays,
      },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
