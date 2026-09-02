import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { APPLICATION_STATUSES } from "@/lib/careers/types";
import { validateHrStatusChange } from "@/lib/careers/applicationStatusRules";
import { appendStatusHistory } from "@/lib/careers/statusHistory";

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
    const { id, status, hr_notes, changed_by } = await req.json();

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

    // Whether this save archives hr_notes onto the status_history entry
    // instead of persisting it as-is — set below once we know whether
    // status is actually changing (not just being resubmitted) and
    // whether a note was actually written.
    let noteArchived = false;

    if (status !== undefined) {
      const { data: existing, error: existingErr } = await supabaseAdmin
        .from("job_applications")
        .select("status, ai_screening, status_history")
        .eq("id", id)
        .single();

      if (existingErr || !existing) {
        return NextResponse.json(
          { error: existingErr?.message ?? "Application not found." },
          { status: 404 },
        );
      }

      const validationError = validateHrStatusChange(existing, status);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      const isRealTransition = status !== existing.status;
      if (isRealTransition) {
        const noteText = typeof hr_notes === "string" ? hr_notes.trim() : "";
        if (!noteText) {
          return NextResponse.json(
            { error: "HR notes are required when changing application status." },
            { status: 400 },
          );
        }
      }
      const noteToArchive =
        isRealTransition && typeof hr_notes === "string" && hr_notes.trim() ? hr_notes.trim() : null;

      updates.status_history = appendStatusHistory(
        existing.status_history,
        status,
        changed_by,
        noteToArchive,
      );

      // The note just archived above is this transition's permanent
      // record — clear the applicant's working hr_notes back to empty so
      // it's ready to capture the justification for whatever the *next*
      // status change turns out to be, rather than lingering as stale
      // text from a decision that's already been made and logged.
      if (noteToArchive) {
        updates.hr_notes = null;
        noteArchived = true;
      }
    }

    if (hr_notes !== undefined && !noteArchived) {
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
