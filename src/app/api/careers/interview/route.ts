import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  computeWeightedScore,
  getInterviewGuide,
} from "@/lib/careers/interviewFormConfigs";
import {
  sendAllPanelInvites,
  sendStage2ScheduleEmail,
} from "@/lib/careers/interviewEmails";
import { getOpeningBySlug } from "@/lib/careers/openings";
import {
  normalizeInterviewFormData,
  type InterviewFormData,
} from "@/lib/careers/types";

const INTERVIEW_STATUSES = new Set(["shortlisted", "interview", "offer"]);

type InterviewAction =
  | "save_draft"
  | "send_panel_invites"
  | "complete_stage1"
  | "schedule_stage2"
  | "complete_stage2"
  | "finalize";

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

    const interview_form_data = normalizeInterviewFormData(
      data.interview_form_data,
    );

    return NextResponse.json({
      success: true,
      data: {
        application: { ...data, interview_form_data },
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
    const body = await req.json();
    const {
      application_id,
      interview_form_data,
      submitted_by,
      action = "save_draft",
      stage2_scheduled_at,
    }: {
      application_id: string;
      interview_form_data: InterviewFormData;
      submitted_by?: string;
      action?: InterviewAction;
      stage2_scheduled_at?: string;
    } = body;

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
      return NextResponse.json(
        { error: "Unknown role on application." },
        { status: 400 },
      );
    }

    const guide = getInterviewGuide(opening.interviewGuideKey);
    let merged = normalizeInterviewFormData({
      ...normalizeInterviewFormData(application.interview_form_data),
      ...interview_form_data,
    });

    const emailWarnings: string[] = [];

    if (action === "send_panel_invites") {
      const setup = merged.setup;
      if (!setup?.interview_start_at) {
        return NextResponse.json(
          { error: "Interview start date and time are required." },
          { status: 400 },
        );
      }
      const validMembers = (setup.members ?? []).filter(
        (m) => m.name.trim() && m.email.trim(),
      );
      if (validMembers.length === 0) {
        return NextResponse.json(
          { error: "Add at least one panel member with name and email." },
          { status: 400 },
        );
      }

      const inviteResult = await sendAllPanelInvites({
        members: validMembers,
        candidateName: application.full_name,
        roleTitle: application.role_title,
        referenceNumber: application.reference_number,
        applicationId: application_id,
        interviewStartAt: setup.interview_start_at,
        location: setup.location,
      });

      if (inviteResult.sent === 0) {
        return NextResponse.json(
          {
            error:
              inviteResult.failed[0] ??
              "Failed to send panel invites. Check RESEND_API_KEY.",
          },
          { status: 502 },
        );
      }

      if (inviteResult.failed.length) {
        emailWarnings.push(...inviteResult.failed);
      }

      merged = {
        ...merged,
        setup: {
          ...setup,
          members: validMembers,
          invites_sent_at: new Date().toISOString(),
        },
        current_stage: 1,
      };
    }

    if (action === "complete_stage1") {
      merged = {
        ...merged,
        stage1_completed_at: new Date().toISOString(),
        current_stage: 2,
      };
    }

    if (action === "schedule_stage2") {
      if (!stage2_scheduled_at) {
        return NextResponse.json(
          { error: "stage2_scheduled_at is required." },
          { status: 400 },
        );
      }

      const scheduleResult = await sendStage2ScheduleEmail({
        candidateName: application.full_name,
        candidateEmail: application.email,
        roleTitle: application.role_title,
        referenceNumber: application.reference_number,
        scheduledAt: stage2_scheduled_at,
        location: merged.setup?.location,
        stage2Duration: guide.stageDurations.stage2,
      });

      if (!scheduleResult.sent) {
        emailWarnings.push(
          scheduleResult.error ?? "Stage 2 schedule email not sent",
        );
      }

      merged = {
        ...merged,
        stage2_scheduled_at,
        stage2_schedule_sent_at: scheduleResult.sent
          ? new Date().toISOString()
          : merged.stage2_schedule_sent_at,
        stage1_completed_at:
          merged.stage1_completed_at ?? new Date().toISOString(),
        current_stage: 2,
      };
    }

    if (action === "complete_stage2") {
      merged = {
        ...merged,
        stage2_completed_at: new Date().toISOString(),
        current_stage: 3,
      };
    }

    const { areaScores, total } = computeWeightedScore(
      guide,
      merged.question_ratings ?? {},
      merged.scenario_ratings ?? {},
    );

    merged = {
      ...merged,
      summary: {
        ...merged.summary,
        area_scores: areaScores,
        total_weighted: total,
      },
    };

    const updates: Record<string, unknown> = {
      interview_form_data: merged,
    };

    if (action === "finalize") {
      updates.interview_submitted_at = new Date().toISOString();
      updates.interview_submitted_by = submitted_by ?? null;
      if (application.status === "shortlisted") {
        updates.status = "interview";
      }
    } else if (
      action === "send_panel_invites" &&
      application.status === "shortlisted"
    ) {
      updates.status = "interview";
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

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        interview_form_data: normalizeInterviewFormData(data.interview_form_data),
      },
      email_warnings: emailWarnings.length ? emailWarnings : undefined,
    });
  } catch (err) {
    console.error("[POST /api/careers/interview]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
