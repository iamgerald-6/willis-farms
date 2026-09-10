import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsonForbidden } from "@/lib/apiRequestAuth";
import {
  getLeaveAuthContext,
  loadDirectReportUserIds,
} from "@/lib/leaveAccess";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const LEAVE_SELECT = `
  *,
  users!leave_requests_user_id_fkey (
    email,
    first_name,
    last_name,
    role,
    supervisor_id
  )
`;

async function enrichLeaveRows(
  data: Array<{
    reviewed_by?: string | null;
    [key: string]: unknown;
  }> | null,
) {
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

  return (data ?? []).map((r) => ({
    ...r,
    reviewed_by_name: r.reviewed_by
      ? reviewerNameById[r.reviewed_by] ?? "Unknown"
      : null,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getLeaveAuthContext(req);
    if (!ctx) {
      return jsonForbidden(
        "Forbidden — leave review access, or being an assigned supervisor, is required.",
      );
    }

    let query = supabaseAdmin
      .from("leave_requests")
      .select(LEAVE_SELECT)
      .order("created_at", { ascending: false });

    if (ctx.scope === "reports") {
      const reportIds = await loadDirectReportUserIds(
        supabaseAdmin,
        ctx.user.id,
      );
      if (reportIds.length === 0) {
        return NextResponse.json({ data: [] });
      }
      query = query.in("user_id", reportIds);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const enriched = await enrichLeaveRows(data);
    return NextResponse.json({ data: enriched });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
