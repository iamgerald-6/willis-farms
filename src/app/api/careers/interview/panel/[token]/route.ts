import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { getInterviewGuide } from "@/lib/careers/interviewFormConfigs";
import { resolveInterviewGuideKey } from "@/lib/careers/jobPostingOptions";
import {
  findPanelByToken,
  scoreSubmission,
} from "@/lib/careers/panelInterview";
import {
  normalizeInterviewFormData,
  type PanelSubmission,
  type StageSubmissionData,
} from "@/lib/careers/types";

type RouteContext = { params: Promise<{ token: string }> };

const INTERVIEW_STATUSES = new Set([
  "shortlisted",
  "interview",
  "hold",
  "onboarding",
  "offer",
]);

async function loadApplications() {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("job_applications")
    .select(
      "id, full_name, role_title, reference_number, role_slug, status, interview_form_data",
    )
    .in("status", Array.from(INTERVIEW_STATUSES));

  if (error) throw error;
  return {
    supabaseAdmin,
    applications: (data ?? []).map((row) => ({
      ...row,
      interview_form_data: normalizeInterviewFormData(row.interview_form_data),
    })),
  };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const loaded = await loadApplications();
    if (!loaded) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const match = findPanelByToken(loaded.applications, token);
    if (!match) {
      return NextResponse.json({ error: "Invalid or expired interview link." }, { status: 404 });
    }

    // Stage 1 and Stage 2 panel forms stay locked until HR deliberately
    // opens them once the interview/practical actually starts (the
    // scheduled time can slip, so this isn't derived from
    // interview_start_at / stage2_scheduled_at).
    const formsOpenedAt =
      match.member.stage === 1
        ? match.application.interview_form_data.setup?.stage1_forms_opened_at
        : match.application.interview_form_data.setup?.stage2_forms_opened_at;
    if (!formsOpenedAt) {
      return NextResponse.json({
        success: true,
        data: {
          locked: true,
          candidateName: match.application.full_name,
          roleTitle: match.application.role_title,
          referenceNumber: match.application.reference_number,
          stage: match.member.stage,
        },
      });
    }

    const guideKey = await resolveInterviewGuideKey(
      loaded.supabaseAdmin,
      match.application.role_slug,
    );
    const guide = guideKey ? getInterviewGuide(guideKey) : null;
    if (!guide) {
      return NextResponse.json({ error: "Interview guide not found." }, { status: 404 });
    }

    const existing = match.application.interview_form_data.panel_submissions?.find(
      (s) => s.member_id === match.member.id && s.stage === match.member.stage,
    );

    return NextResponse.json({
      success: true,
      data: {
        candidateName: match.application.full_name,
        roleTitle: match.application.role_title,
        referenceNumber: match.application.reference_number,
        memberName: match.member.name,
        stage: match.member.stage,
        guide,
        submission: existing ?? null,
        submitted: !!existing?.submitted_at,
      },
    });
  } catch (err) {
    console.error("[GET /api/careers/interview/panel/[token]]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const body = await req.json();
    const submission = body.submission as StageSubmissionData;

    if (!submission) {
      return NextResponse.json({ error: "submission is required." }, { status: 400 });
    }

    const loaded = await loadApplications();
    if (!loaded) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const match = findPanelByToken(loaded.applications, token);
    if (!match) {
      return NextResponse.json({ error: "Invalid or expired interview link." }, { status: 404 });
    }

    const guideKey = await resolveInterviewGuideKey(
      loaded.supabaseAdmin,
      match.application.role_slug,
    );
    if (!guideKey) {
      return NextResponse.json({ error: "Interview guide not found." }, { status: 400 });
    }
    const guide = getInterviewGuide(guideKey);

    const scored = scoreSubmission(guide, submission, match.member.stage);
    const panelSubmission: PanelSubmission = {
      member_id: match.member.id,
      member_name: match.member.name,
      stage: match.member.stage,
      screening: submission.screening,
      question_ratings: submission.question_ratings,
      scenario_ratings: submission.scenario_ratings,
      area_scores: scored.areaScores,
      total_weighted: scored.total,
      submitted_at: new Date().toISOString(),
    };

    const formData = normalizeInterviewFormData(match.application.interview_form_data);
    const others =
      formData.panel_submissions?.filter(
        (s) =>
          !(s.member_id === match.member.id && s.stage === match.member.stage),
      ) ?? [];

    const merged = normalizeInterviewFormData({
      ...formData,
      panel_submissions: [...others, panelSubmission],
    });

    const { data, error } = await loaded.supabaseAdmin
      .from("job_applications")
      .update({ interview_form_data: merged })
      .eq("id", match.application.id)
      .select("interview_form_data")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        submitted_at: panelSubmission.submitted_at,
        total_weighted: panelSubmission.total_weighted,
        interview_form_data: normalizeInterviewFormData(data.interview_form_data),
      },
    });
  } catch (err) {
    console.error("[POST /api/careers/interview/panel/[token]]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
