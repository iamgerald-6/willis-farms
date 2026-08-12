import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSeniorManagement, jsonForbidden } from "@/lib/apiRequestAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export async function GET(req: NextRequest) {
  try {
    const caller = await requireSeniorManagement(req);
    if (!caller) {
      return jsonForbidden(
        "Forbidden — admin, manager, or super_admin access required.",
      );
    }

    const { data, error } = await supabaseAdmin
      .from("leave_requests")
      .select(
        `
        *,
        users!leave_requests_user_id_fkey (
          email,
          first_name,
          last_name,
          role
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Resolve reviewer names (reviewed_by is a plain uuid column, no FK join).
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

    const enriched = (data ?? []).map((r) => ({
      ...r,
      reviewed_by_name: r.reviewed_by
        ? reviewerNameById[r.reviewed_by] ?? "Unknown"
        : null,
    }));

    return NextResponse.json({ data: enriched });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
