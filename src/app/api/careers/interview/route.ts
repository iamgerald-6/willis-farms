import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchResolvedInterviewContext } from "@/lib/careers/fetchResolvedInterviewGuide";
import {
  sendAllPanelInvites,
  sendInterviewInvitationEmail,
  sendStage2ScheduleEmail,
  sendRejectionEmail,
} from "@/lib/careers/interviewEmails";
import {
  validatePanelDecision,
  statusForDecision,
} from "@/lib/careers/panelDecision";
import { resolveInterviewGuideKey } from "@/lib/careers/jobPostingOptions";
import {
  normalizeInterviewFormData,
  type InterviewFormData,
} from "@/lib/careers/types";
import {
  combinedInterviewAverage,
  ensureMemberTokens,
  scoreSubmission,
  stageAverage,
} from "@/lib/careers/panelInterview";
import { appendStatusHistory } from "@/lib/careers/statusHistory";

const INTERVIEW_STATUSES = new Set([
  "shortlisted",
  "interview",
  "hold",
  "onboarding",
  "offer",
]);

type InterviewAction =
  | "save_draft"
  | "send_panel_invites"
  | "send_stage2_invites"
  | "submit_hr_stage1"
  | "submit_hr_stage2"
  | "stage1_review_pass"
  | "stage1_review_reject"
  | "complete_stage1"
  | "schedule_stage2"
  | "complete_stage2"
  | "finalize"
  | "confirm_decision"
  | "reconsider_decision";

// confirm_decision runs while status is "evaluation" and reconsider_decision
// runs while status is "hold" or "rejected" — neither is in INTERVIEW_STATUSES
// (which gates opening/editing the interview guide itself), so both are
// exempted from that guard below.
const DECISION_ACTIONS = new Set<InterviewAction>([
  "confirm_decision",
  "reconsider_decision",
]);

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

    const guideKey = await resolveInterviewGuideKey(
      supabaseAdmin,
      data.role_slug,
    );
    const { guide, evaluationLabels } = await fetchResolvedInterviewContext(
      supabaseAdmin,
      guideKey,
    );

    const interview_form_data = normalizeInterviewFormData(
      data.interview_form_data,
    );

    return NextResponse.json({
      success: true,
      data: {
        application: { ...data, interview_form_data },
        guide,
        evaluationLabels,
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
      reconsider_to,
    }: {
      application_id: string;
      interview_form_data: InterviewFormData;
      submitted_by?: string;
      action?: InterviewAction;
      stage2_scheduled_at?: string;
      /** Only used with action "reconsider_decision". */
      reconsider_to?: "evaluation" | "rejected";
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

    if (
      !DECISION_ACTIONS.has(action) &&
      !INTERVIEW_STATUSES.has(application.status)
    ) {
      return NextResponse.json(
        {
          error:
            "Interview guide is only available for shortlisted, interview, or offer applications.",
        },
        { status: 403 },
      );
    }

    const guideKey = await resolveInterviewGuideKey(
      supabaseAdmin,
      application.role_slug,
    );
    if (!guideKey) {
      return NextResponse.json(
        { error: "Unknown role on application." },
        { status: 400 },
      );
    }

    const { guide } = await fetchResolvedInterviewContext(
      supabaseAdmin,
      guideKey,
    );
    if (!guide) {
      return NextResponse.json(
        { error: "Interview guide not configured for this role." },
        { status: 400 },
      );
    }
    let merged = normalizeInterviewFormData({
      ...normalizeInterviewFormData(application.interview_form_data),
      ...interview_form_data,
    });

    const emailWarnings: string[] = [];
    let postUpdateHireInvite: { recommendedStartDate?: string } | null = null;
    let postUpdateRejectEmail = false;

    if (action === "send_panel_invites") {
      const setup = merged.setup ?? {};
      if (!setup.interview_start_at) {
        return NextResponse.json(
          { error: "Stage 1 interview start date and time are required." },
          { status: 400 },
        );
      }
      const stage1Members = ensureMemberTokens(
        setup.stage1_members ?? setup.members ?? [],
      );
      const validMembers = stage1Members.filter(
        (m) => m.name.trim() && m.email.trim(),
      );
      if (validMembers.length === 0) {
        return NextResponse.json(
          {
            error: "Add at least one Stage 1 panel member with name and email.",
          },
          { status: 400 },
        );
      }

      const inviteResult = await sendAllPanelInvites({
        members: validMembers.map((m) => ({
          name: m.name,
          email: m.email,
          access_token: m.access_token,
          stage: 1 as const,
        })),
        candidateName: application.full_name,
        roleTitle: application.role_title,
        referenceNumber: application.reference_number,
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

      const candidateInviteResult = await sendInterviewInvitationEmail({
        candidateName: application.full_name,
        candidateEmail: application.email,
        roleTitle: application.role_title,
        referenceNumber: application.reference_number,
        interviewStartAt: setup.interview_start_at,
        location: setup.location,
      });

      if (!candidateInviteResult.sent) {
        emailWarnings.push(
          candidateInviteResult.error ??
            "Candidate interview invitation email not sent",
        );
      }

      merged = {
        ...merged,
        setup: {
          ...setup,
          stage1_members: validMembers,
          stage1_invites_sent_at: new Date().toISOString(),
          invites_sent_at: new Date().toISOString(),
          candidate_invite_sent_at: candidateInviteResult.sent
            ? new Date().toISOString()
            : setup.candidate_invite_sent_at,
        },
        current_stage: 1,
      };
    }

    if (action === "send_stage2_invites") {
      const setup = merged.setup ?? {};
      const scheduled = stage2_scheduled_at ?? setup.stage2_scheduled_at;
      if (!scheduled) {
        return NextResponse.json(
          { error: "Stage 2 date and time are required." },
          { status: 400 },
        );
      }

      const stage2Members = ensureMemberTokens(setup.stage2_members ?? []);
      const validMembers = stage2Members.filter(
        (m) => m.name.trim() && m.email.trim(),
      );
      if (validMembers.length === 0) {
        return NextResponse.json(
          { error: "Add at least one Stage 2 panel member." },
          { status: 400 },
        );
      }

      const inviteResult = await sendAllPanelInvites({
        members: validMembers.map((m) => ({
          name: m.name,
          email: m.email,
          access_token: m.access_token,
          stage: 2 as const,
        })),
        candidateName: application.full_name,
        roleTitle: application.role_title,
        referenceNumber: application.reference_number,
        interviewStartAt: scheduled,
        location: setup.stage2_location ?? setup.location,
      });

      if (inviteResult.failed.length) {
        emailWarnings.push(...inviteResult.failed);
      }

      const scheduleResult = await sendStage2ScheduleEmail({
        candidateName: application.full_name,
        candidateEmail: application.email,
        roleTitle: application.role_title,
        referenceNumber: application.reference_number,
        scheduledAt: scheduled,
        location: setup.stage2_location ?? setup.location,
        stage2Duration: guide.stageDurations.stage2,
      });

      if (!scheduleResult.sent) {
        emailWarnings.push(
          scheduleResult.error ?? "Stage 2 schedule email not sent",
        );
      }

      merged = {
        ...merged,
        setup: {
          ...setup,
          stage2_members: validMembers,
          stage2_invites_sent_at: new Date().toISOString(),
          stage2_scheduled_at: scheduled,
        },
        stage2_scheduled_at: scheduled,
        stage2_schedule_sent_at: scheduleResult.sent
          ? new Date().toISOString()
          : merged.stage2_schedule_sent_at,
        current_stage: 2,
      };
    }

    if (action === "submit_hr_stage1") {
      const hrStage1 = merged.hr_submission?.stage1;
      if (!hrStage1) {
        return NextResponse.json(
          { error: "HR Stage 1 data is missing." },
          { status: 400 },
        );
      }
      const scored = scoreSubmission(guide, hrStage1, 1);
      merged = {
        ...merged,
        hr_submission: {
          ...merged.hr_submission,
          stage1: {
            ...hrStage1,
            submitted_at: new Date().toISOString(),
            area_scores: scored.areaScores,
            total_weighted: scored.total,
          },
        },
        screening: hrStage1.screening,
        question_ratings: hrStage1.question_ratings,
      };
    }

    if (action === "submit_hr_stage2") {
      const hrStage2 = merged.hr_submission?.stage2;
      if (!hrStage2) {
        return NextResponse.json(
          { error: "HR Stage 2 data is missing." },
          { status: 400 },
        );
      }
      const scored = scoreSubmission(guide, hrStage2, 2);
      merged = {
        ...merged,
        hr_submission: {
          ...merged.hr_submission,
          stage2: {
            ...hrStage2,
            submitted_at: new Date().toISOString(),
            area_scores: scored.areaScores,
            total_weighted: scored.total,
          },
        },
        scenario_ratings: hrStage2.scenario_ratings,
        stage2_completed_at: new Date().toISOString(),
        current_stage: 3,
      };
    }

    if (action === "stage1_review_pass") {
      const avg = stageAverage(merged, guide, 1);
      merged = {
        ...merged,
        stage1_review: {
          average_score: avg,
          passed: true,
          reviewed_at: new Date().toISOString(),
          reviewed_by: submitted_by,
        },
        stage1_completed_at: new Date().toISOString(),
        current_stage: 2,
      };
    }

    if (action === "stage1_review_reject") {
      const avg = stageAverage(merged, guide, 1);
      merged = {
        ...merged,
        stage1_review: {
          average_score: avg,
          passed: false,
          reviewed_at: new Date().toISOString(),
          reviewed_by: submitted_by,
        },
        stage1_completed_at: new Date().toISOString(),
      };

      const rejectResult = await sendRejectionEmail({
        candidateName: application.full_name,
        candidateEmail: application.email,
        roleTitle: application.role_title,
        referenceNumber: application.reference_number,
      });
      if (!rejectResult.sent) {
        emailWarnings.push(rejectResult.error ?? "Rejection email not sent");
      }
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

    const combined = combinedInterviewAverage(merged, guide);
    const s1Avg = stageAverage(merged, guide, 1);
    const s2Avg = stageAverage(merged, guide, 2);

    merged = {
      ...merged,
      summary: {
        ...merged.summary,
        stage1_average: s1Avg,
        stage2_average: s2Avg,
        total_weighted: combined,
      },
    };

    const updates: Record<string, unknown> = {
      interview_form_data: merged,
    };

    if (action === "stage1_review_reject") {
      updates.status = "rejected";
      updates.status_history = appendStatusHistory(
        application.status_history,
        "rejected",
        submitted_by,
      );
    }

    if (action === "finalize") {
      updates.interview_submitted_at = new Date().toISOString();
      updates.interview_submitted_by = submitted_by ?? null;
      updates.status = "evaluation";
      updates.status_history = appendStatusHistory(
        application.status_history,
        "evaluation",
        submitted_by,
      );
    } else if (action === "confirm_decision") {
      if (!application.interview_submitted_at) {
        return NextResponse.json(
          {
            error:
              "Submit the interview evaluation before confirming the outcome.",
          },
          { status: 400 },
        );
      }
      if (merged.summary?.decision_confirmed_at) {
        return NextResponse.json(
          { error: "Outcome has already been confirmed for this application." },
          { status: 400 },
        );
      }

      const decision = merged.summary?.decision;
      const validationError = validatePanelDecision(
        decision,
        merged.summary?.total_weighted ?? combined,
      );
      if (validationError || !decision) {
        return NextResponse.json(
          { error: validationError ?? "Invalid decision." },
          { status: 400 },
        );
      }

      const confirmedAt = new Date().toISOString();
      merged = {
        ...merged,
        summary: {
          ...merged.summary,
          decision_confirmed_at: confirmedAt,
          decision_confirmed_by: submitted_by ?? undefined,
        },
      };
      updates.interview_form_data = merged;
      updates.status = statusForDecision(decision);
      updates.status_history = appendStatusHistory(
        application.status_history,
        statusForDecision(decision),
        submitted_by,
      );

      if (decision === "do_not_hire") {
        const rejectResult = await sendRejectionEmail({
          candidateName: application.full_name,
          candidateEmail: application.email,
          roleTitle: application.role_title,
          referenceNumber: application.reference_number,
        });
        if (!rejectResult.sent) {
          emailWarnings.push(rejectResult.error ?? "Rejection email not sent");
        }
      }
    } else if (action === "reconsider_decision") {
      // Second look at an applicant who already went through the full
      // interview evaluation and was confirmed Hold/Reserve or Do not hire.
      // Only reachable from those two states — a fresh "rejected" applicant
      // who never went through evaluation (e.g. an early AI reject) is not
      // eligible, since they never have a confirmed evaluation decision.
      const priorSummary = normalizeInterviewFormData(
        application.interview_form_data,
      ).summary;
      const eligible =
        !!priorSummary?.decision_confirmed_at &&
        ((application.status === "hold" && priorSummary.decision === "hold") ||
          (application.status === "rejected" &&
            priorSummary.decision === "do_not_hire"));

      if (!eligible) {
        return NextResponse.json(
          { error: "This applicant is not eligible for reconsideration." },
          { status: 400 },
        );
      }

      if (reconsider_to !== "evaluation" && reconsider_to !== "rejected") {
        return NextResponse.json(
          { error: "Invalid reconsideration choice." },
          { status: 400 },
        );
      }
      if (reconsider_to === "rejected" && application.status !== "hold") {
        return NextResponse.json(
          {
            error:
              "Only a Hold/Reserve applicant can be reconsidered as Reject.",
          },
          { status: 400 },
        );
      }

      if (reconsider_to === "evaluation") {
        // Reopen: send them back to the evaluation stage exactly as if they
        // hadn't been decided yet — clears the prior decision so "Confirm
        // interview outcome" reappears, while the interview submission,
        // scores, and generated report all stay untouched. No email.
        merged = {
          ...merged,
          summary: {
            ...merged.summary,
            decision: "",
            decision_confirmed_at: undefined,
            decision_confirmed_by: undefined,
          },
        };
        updates.interview_form_data = merged;
        updates.status = "evaluation";
        updates.status_history = appendStatusHistory(
          application.status_history,
          "evaluation",
          submitted_by,
        );
      } else {
        merged = {
          ...merged,
          summary: {
            ...merged.summary,
            decision: "do_not_hire",
            decision_confirmed_at: new Date().toISOString(),
            decision_confirmed_by: submitted_by ?? undefined,
          },
        };
        updates.interview_form_data = merged;
        updates.status = "rejected";
        updates.status_history = appendStatusHistory(
          application.status_history,
          "rejected",
          submitted_by,
        );

        const rejectResult = await sendRejectionEmail({
          candidateName: application.full_name,
          candidateEmail: application.email,
          roleTitle: application.role_title,
          referenceNumber: application.reference_number,
        });
        if (!rejectResult.sent) {
          emailWarnings.push(rejectResult.error ?? "Rejection email not sent");
        }
      }
    } else if (
      (action === "send_panel_invites" || action === "send_stage2_invites") &&
      application.status === "shortlisted"
    ) {
      updates.status = "interview";
      updates.status_history = appendStatusHistory(
        application.status_history,
        "interview",
        submitted_by,
      );
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

    // if (postUpdateHireInvite) {
    //   try {
    //     const inviteResult = await sendOnboardingInvite(
    //       supabaseAdmin,
    //       application,
    //       {
    //         recommendedStartDate: postUpdateHireInvite?.recommendedStartDate.
    //         updateStatus: false,
    //       },
    //     );
    //     if (!inviteResult.emailSent) {
    //       emailWarnings.push(
    //         inviteResult.emailError ?? "Hire / onboarding email not sent",
    //       );
    //     }
    //   } catch (inviteErr) {
    //     console.error(
    //       "[POST /api/careers/interview] onboarding invite",
    //       inviteErr,
    //     );
    //     emailWarnings.push(
    //       inviteErr instanceof Error
    //         ? inviteErr.message
    //         : "Onboarding link could not be created",
    //     );
    //   }
    // }

    if (postUpdateRejectEmail) {
      const rejectResult = await sendRejectionEmail({
        candidateName: application.full_name,
        candidateEmail: application.email,
        roleTitle: application.role_title,
        referenceNumber: application.reference_number,
      });
      if (!rejectResult.sent) {
        emailWarnings.push(rejectResult.error ?? "Rejection email not sent");
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        interview_form_data: normalizeInterviewFormData(
          data.interview_form_data,
        ),
      },
      email_warnings: emailWarnings.length ? emailWarnings : undefined,
    });
  } catch (err) {
    console.error("[POST /api/careers/interview]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
