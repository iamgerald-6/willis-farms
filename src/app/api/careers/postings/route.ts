import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  isPostingPublic,
  slugifyJobTitle,
  statusFromClosingDate,
  syncExpiredPostings,
  type JobPostingInput,
  type PostingHistoryEntry,
} from "@/lib/careers/jobPostings";
import { resolvePostingActor } from "@/lib/careers/resolvePostingActor";
import {
  insertJobPostingWithColumnFallback,
  isMissingColumnError,
  JOB_POSTINGS_MIGRATION_HINT,
} from "@/lib/careers/jobPostingDb";
import {
  extractOrgFieldUpdates,
  fetchOrgFieldOptions,
  findMissingOrgFields,
  generateUniquePostingSlug,
  resolveTitleFromPosition,
} from "@/lib/careers/jobPostingOrgFields";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const scope = req.nextUrl.searchParams.get("scope");

  try {
    await syncExpiredPostings(supabaseAdmin).catch(() => undefined);

    const { data, error } = await supabaseAdmin
      .from("job_postings")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json({ success: true, data: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const filtered =
      scope === "public"
        ? rows.filter((row) => isPostingPublic(row))
        : rows;

    return NextResponse.json({ success: true, data: filtered });
  } catch (err) {
    console.error("[GET /api/careers/postings]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const body = (await req.json()) as JobPostingInput & {
      interview_guide_key?: string;
    };
    const summary = body.summary?.trim();
    const description = body.description?.trim();
    const closes_at = body.closes_at;

    if (!summary || !description || !closes_at) {
      return NextResponse.json(
        { error: "Summary, description, and closing date are required." },
        { status: 400 },
      );
    }

    const orgFieldOptions = await fetchOrgFieldOptions(supabaseAdmin);
    const orgFieldUpdates = extractOrgFieldUpdates(
      body as unknown as Record<string, unknown>,
      orgFieldOptions,
    );

    // Every active org-structure list is required on a genuinely new
    // posting created from Create job posting. Recruitment's Republish
    // action (supersedes_id set) only asks HR for a new closing date and
    // carries the old posting's org fields forward as-is, whatever they
    // are — it isn't the "open it and edit it" path this rule targets, so
    // a legacy posting missing a field can still be republished without
    // being blocked here.
    if (!body.supersedes_id) {
      const missingOrgFields = findMissingOrgFields(orgFieldOptions, orgFieldUpdates);
      if (missingOrgFields.length > 0) {
        return NextResponse.json(
          {
            error: `All organizational structure fields are required. Missing: ${missingOrgFields.join(", ")}.`,
          },
          { status: 400 },
        );
      }
    }

    // Title now comes straight from the selected Position — there's no
    // more separate job-title-options list to resolve against. The
    // `body.title` fallback only matters for Recruitment's Republish of a
    // legacy posting that predates org-structure fields (no position_id),
    // where CareersTab carries the old posting's title forward directly.
    const positionTitle = await resolveTitleFromPosition(
      supabaseAdmin,
      orgFieldOptions,
      orgFieldUpdates,
    );
    const title = positionTitle?.title ?? body.title?.trim() ?? "";
    if (!title) {
      return NextResponse.json(
        { error: "A Position (or title) is required to create a job posting." },
        { status: 400 },
      );
    }

    const jobTitleKey = slugifyJobTitle(title);
    const slug = await generateUniquePostingSlug(supabaseAdmin, title);
    const interviewGuideKey = body.interview_guide_key?.trim() || "L1";

    const status =
      body.status === "published" || body.status === "closed"
        ? body.status
        : statusFromClosingDate(closes_at);

    // The very first history entry: "republished" if this posting is
    // replacing an older closed one (supersedes_id set), otherwise
    // "opened" for a genuinely new posting.
    const actor = await resolvePostingActor(supabaseAdmin, body.created_by);
    const openingEntry: PostingHistoryEntry = {
      event: body.supersedes_id ? "republished" : "opened",
      at: new Date().toISOString(),
      by: actor,
    };

    const { data, error } = await insertJobPostingWithColumnFallback(supabaseAdmin, {
      slug,
      job_title_key: jobTitleKey,
      title,
      location: body.location?.trim() || "Eastern Region, Ghana",
      employment_type: body.employment_type?.trim() || "Full-time",
      summary,
      description,
      role_scope: body.role_scope ?? "",
      key_responsibilities: body.key_responsibilities ?? "",
      minimum_qualifications: body.minimum_qualifications ?? "",
      preferred_qualifications: body.preferred_qualifications ?? "",
      experience: body.experience ?? "",
      required_skills_attributes: body.required_skills_attributes ?? "",
      non_negotiable_standards: body.non_negotiable_standards ?? "",
      interview_guide_key: interviewGuideKey,
      jd_file_url: body.jd_file_url ?? null,
      jd_file_public_id: body.jd_file_public_id ?? null,
      closes_at,
      status,
      is_active: status === "published",
      history: [openingEntry],
      ...orgFieldUpdates,
    });

    if (error) {
      console.error("[POST /api/careers/postings]", error);
      const hint = isMissingColumnError(error.message)
        ? JOB_POSTINGS_MIGRATION_HINT
        : "";
      return NextResponse.json({ error: error.message + hint }, { status: 500 });
    }

    // Reopening a closed posting — link the old one to this new one so it
    // drops off the HR postings list. Best-effort: the new posting is
    // already created and saved regardless of whether this succeeds, so a
    // stale/missing superseded_by column (pre-migration) never blocks
    // reopening a role, it just means the old posting keeps showing.
    if (body.supersedes_id && data) {
      await supabaseAdmin
        .from("job_postings")
        .update({ superseded_by: (data as { id: string }).id })
        .eq("id", body.supersedes_id)
        .then(({ error: linkError }) => {
          if (linkError) {
            console.error("[POST /api/careers/postings] supersede link failed", linkError);
          }
        });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[POST /api/careers/postings]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
