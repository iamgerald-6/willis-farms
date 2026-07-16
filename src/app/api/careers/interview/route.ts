import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  computeWeightedScore,
  getInterviewGuide,
} from "@/lib/careers/interviewFormConfigs";
import { getOpeningBySlug } from "@/lib/careers/openings";
import type { InterviewFormData } from "@/lib/careers/types";

const INTERVIEW_STATUSES = new Set(["shortlisted", "interview", "offer"]);

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const applicationId = req.nextUrl.searchParams.get("application_id");
  if (!applicationId) {
    return NextResponse.json(
      { error: "application_id is required." },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("job_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const opening = getOpeningBySlug(data.role_slug);
    const guide = opening
      ? getInterviewGuide(opening.interviewGuideKey)
      : null;

    return NextResponse.json({
      success: true,
      data: {
        application: data,
        guide,
      },
    });
  } catch (err) {
    console.error("[GET /api/careers/interview]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const {
      application_id,
      interview_form_data,
      submitted_by,
      finalize,
    }: {
      application_id: string;
      interview_form_data: InterviewFormData;
      submitted_by?: string;
      finalize?: boolean;
    } = await req.json();

    if (!application_id || !interview_form_data) {
      return NextResponse.json(
        { error: "application_id and interview_form_data are required." },
        { status: 400 },
      );
    }

    const { data: application, error: fetchError } = await supabaseAdmin
      .from("job_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return NextResponse.json(
        { error: fetchError?.message ?? "Application not found." },
        { status: 404 },
      );
    }

    if (!INTERVIEW_STATUSES.has(application.status)) {
      return NextResponse.json(
        {
          error:
            "Interview guide is only available for shortlisted, interview, or offer applications.",
        },
        { status: 403 },
      );
    }

    const opening = getOpeningBySlug(application.role_slug);
    if (!opening) {
      return NextResponse.json({ error: "Unknown role on application." }, { status: 400 });
    }

    const guide = getInterviewGuide(opening.interviewGuideKey);
    const { areaScores, total } = computeWeightedScore(
      guide,
      interview_form_data.question_ratings ?? {},
      interview_form_data.scenario_ratings ?? {},
    );

    const merged: InterviewFormData = {
      ...interview_form_data,
      summary: {
        ...interview_form_data.summary,
        area_scores: areaScores,
        total_weighted: total,
      },
    };

    const updates: Record<string, unknown> = {
      interview_form_data: merged,
    };

    if (finalize) {
      updates.interview_submitted_at = new Date().toISOString();
      updates.interview_submitted_by = submitted_by ?? null;
      if (application.status === "shortlisted") {
        updates.status = "interview";
      }
    }

    const { data, error } = await supabaseAdmin
      .from("job_applications")
      .update(updates)
      .eq("id", application_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[POST /api/careers/interview]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
