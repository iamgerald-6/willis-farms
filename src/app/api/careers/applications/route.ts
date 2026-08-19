import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { APPLICATION_STATUSES } from "@/lib/careers/types";

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("job_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Exclude in-progress drafts once submission_status column exists (post-migration).
    // Before migration the field is absent — all existing rows are treated as submitted.
    const visible = (data ?? []).filter(
      (row) => row.submission_status !== "draft",
    );

    return NextResponse.json({ success: true, data: visible });
  } catch (err) {
    console.error("[GET /api/careers/applications]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const { id, status, hr_notes } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Application id is required." }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (status !== undefined) {
      if (!APPLICATION_STATUSES.includes(status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      updates.status = status;
    }

    if (hr_notes !== undefined) {
      updates.hr_notes = hr_notes?.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("job_applications")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH /api/careers/applications]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
