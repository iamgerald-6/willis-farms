import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { APPLICATION_STATUSES } from "@/lib/careers/types";
import { validateHrStatusChange } from "@/lib/careers/applicationStatusRules";
import { appendStatusHistory } from "@/lib/careers/statusHistory";
import { requireRecruitmentAccess } from "@/lib/apiRequestAuth";
import { assertSiteAccess, siteFilterValue, siteIdFromJoin } from "@/lib/siteAccess";

export async function GET(req: NextRequest) {
  const authedUser = await requireRecruitmentAccess(req);
  if (!authedUser) {
    return NextResponse.json(
      { error: "Forbidden — Recruitment view access is required." },
      { status: 403 },
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    // job_posting_id → job_postings.site_id is one hop away — pull it
    // alongside each application so site filtering can be applied in JS
    // below without a second round-trip per row.
    const { data, error } = await supabaseAdmin
      .from("job_applications")
      .select("*, job_postings(site_id)")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Exclude in-progress drafts once submission_status column exists (post-migration).
    // Before migration the field is absent — all existing rows are treated as submitted.
    const siteId = siteFilterValue(authedUser);
    const visible = (data ?? [])
      .filter((row) => row.submission_status !== "draft")
      .filter((row) => {
        if (siteId == null) return true; // ALL_SITES caller
        const postingSiteId = siteIdFromJoin(row.job_postings);
        // A null job_posting_id (legacy row, or the rare unlinked draft)
        // has no resolvable site — not visible to a SITE-scoped viewer,
        // per SITE_ACCESS_ARCHITECTURE.md §3.2's null-handling decision.
        return postingSiteId != null && postingSiteId === siteId;
      })
      .map(({ job_postings, ...row }) => row);

    return NextResponse.json({ success: true, data: visible });
  } catch (err) {
    console.error("[GET /api/careers/applications]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authedUser = await requireRecruitmentAccess(req, "edit");
  if (!authedUser) {
    return NextResponse.json(
      { error: "Forbidden — Recruitment edit access is required." },
      { status: 403 },
    );
  }

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

    const { data: existingApplication } = await supabaseAdmin
      .from("job_applications")
      .select("job_postings(site_id)")
      .eq("id", id)
      .maybeSingle();
    const existingSiteId = siteIdFromJoin(existingApplication?.job_postings);
    if (!assertSiteAccess(authedUser, existingSiteId)) {
      return NextResponse.json(
        { error: "Forbidden — this application isn't at a site you have access to." },
        { status: 403 },
      );
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
