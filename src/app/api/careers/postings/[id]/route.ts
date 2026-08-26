import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  statusFromClosingDate,
  type JobPostingStatus,
  type PostingHistoryEntry,
} from "@/lib/careers/jobPostings";
import { resolveJobTitleKey } from "@/lib/careers/resolveJobTitleKey";
import { resolvePostingActor } from "@/lib/careers/resolvePostingActor";
import {
  isMissingColumnError,
  JOB_POSTINGS_MIGRATION_HINT,
  updateJobPostingWithColumnFallback,
} from "@/lib/careers/jobPostingDb";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { id } = await context.params;

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.job_title_key !== undefined) {
      const resolved = await resolveJobTitleKey(
        supabaseAdmin,
        String(body.job_title_key),
      );
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      updates.job_title_key = resolved.option.key;
      updates.title = resolved.option.label;
      updates.interview_guide_key = resolved.option.interviewGuideKey;
    }

    if (body.location !== undefined) updates.location = String(body.location).trim();
    if (body.employment_type !== undefined) {
      updates.employment_type = String(body.employment_type).trim();
    }
    if (body.summary !== undefined) updates.summary = String(body.summary).trim();
    if (body.description !== undefined) {
      updates.description = String(body.description).trim();
    }
    if (body.role_scope !== undefined) updates.role_scope = body.role_scope;
    if (body.key_responsibilities !== undefined) {
      updates.key_responsibilities = body.key_responsibilities;
    }
    if (body.minimum_qualifications !== undefined) {
      updates.minimum_qualifications = body.minimum_qualifications;
    }
    if (body.preferred_qualifications !== undefined) {
      updates.preferred_qualifications = body.preferred_qualifications;
    }
    if (body.experience !== undefined) updates.experience = body.experience;
    if (body.required_skills_attributes !== undefined) {
      updates.required_skills_attributes = body.required_skills_attributes;
    }
    if (body.non_negotiable_standards !== undefined) {
      updates.non_negotiable_standards = body.non_negotiable_standards;
    }
    if (body.closes_at !== undefined) updates.closes_at = body.closes_at;
    if (body.jd_file_url !== undefined) updates.jd_file_url = body.jd_file_url;
    if (body.jd_file_public_id !== undefined) {
      updates.jd_file_public_id = body.jd_file_public_id;
    }

    if (body.status === "published" || body.status === "closed") {
      updates.status = body.status as JobPostingStatus;
      updates.is_active = body.status === "published";
    } else if (body.closes_at !== undefined) {
      updates.status = statusFromClosingDate(String(body.closes_at));
      updates.is_active = updates.status === "published";
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    // Log a "closed" history entry whenever this update newly closes the
    // posting (skips it if already closed, so re-saving an already-closed
    // posting doesn't pile up duplicate entries).
    if (updates.status === "closed") {
      const { data: existing } = await supabaseAdmin
        .from("job_postings")
        .select("history")
        .eq("id", id)
        .maybeSingle();
      const currentHistory: PostingHistoryEntry[] = Array.isArray(existing?.history)
        ? existing.history
        : [];
      const last = currentHistory[currentHistory.length - 1];
      if (!last || last.event !== "closed") {
        const actor = await resolvePostingActor(supabaseAdmin, body.changed_by);
        updates.history = [
          ...currentHistory,
          { event: "closed", at: new Date().toISOString(), by: actor } satisfies PostingHistoryEntry,
        ];
      }
    }

    const { data, error } = await updateJobPostingWithColumnFallback(
      supabaseAdmin,
      id,
      updates,
    );

    if (error) {
      const hint = isMissingColumnError(error.message)
        ? JOB_POSTINGS_MIGRATION_HINT
        : "";
      return NextResponse.json({ error: error.message + hint }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[PATCH /api/careers/postings/[id]]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { id } = await context.params;

  try {
    const { error } = await updateJobPostingWithColumnFallback(supabaseAdmin, id, {
      status: "closed",
      is_active: false,
    });

    if (error) {
      const hint = isMissingColumnError(error.message)
        ? JOB_POSTINGS_MIGRATION_HINT
        : "";
      return NextResponse.json({ error: error.message + hint }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/careers/postings/[id]]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
