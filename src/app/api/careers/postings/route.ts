import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  isPostingPublic,
  statusFromClosingDate,
  syncExpiredPostings,
  type JobPostingInput,
} from "@/lib/careers/jobPostings";
import { resolveJobTitleKey } from "@/lib/careers/resolveJobTitleKey";
import {
  insertJobPostingWithColumnFallback,
  isMissingColumnError,
  JOB_POSTINGS_MIGRATION_HINT,
} from "@/lib/careers/jobPostingDb";

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
    const body = (await req.json()) as JobPostingInput;
    const summary = body.summary?.trim();
    const description = body.description?.trim();
    const closes_at = body.closes_at;

    if (!body.job_title_key?.trim() || !summary || !description || !closes_at) {
      return NextResponse.json(
        { error: "Job title, summary, description, and closing date are required." },
        { status: 400 },
      );
    }

    const resolved = await resolveJobTitleKey(supabaseAdmin, body.job_title_key);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    const { option } = resolved;
    let slug = option.key;
    const { data: existing } = await supabaseAdmin
      .from("job_postings")
      .select("slug")
      .like("slug", `${slug}%`);

    if (existing?.some((r) => r.slug === slug)) {
      slug = `${slug}_${Date.now().toString(36)}`;
    }

    const status =
      body.status === "published" || body.status === "closed"
        ? body.status
        : statusFromClosingDate(closes_at);

    const { data, error } = await insertJobPostingWithColumnFallback(supabaseAdmin, {
      slug,
      job_title_key: option.key,
      title: option.label,
      location: body.location?.trim() || "Eastern Region, Ghana",
      employment_type: body.employment_type?.trim() || "Full-time",
      summary,
      description,
      interview_guide_key: option.interviewGuideKey,
      jd_file_url: body.jd_file_url ?? null,
      jd_file_public_id: body.jd_file_public_id ?? null,
      closes_at,
      status,
      is_active: status === "published",
    });

    if (error) {
      console.error("[POST /api/careers/postings]", error);
      const hint = isMissingColumnError(error.message)
        ? JOB_POSTINGS_MIGRATION_HINT
        : "";
      return NextResponse.json({ error: error.message + hint }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[POST /api/careers/postings]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
