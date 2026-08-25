export const APPLICATION_STATUSES = [
  "applied",
  "under_review",
  "shortlisted",
  "interview",
  "evaluation",
  "hold",
  "onboarding",
  "offer",
  "rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  interview: "Interview",
  evaluation: "Evaluation",
  hold: "Hold / reserve",
  onboarding: "Onboarding",
  offer: "Offer",
  rejected: "Rejected",
};

export const STATUS_STYLES: Record<ApplicationStatus, string> = {
  applied: "bg-blue-50 text-blue-700 border border-blue-200",
  under_review: "bg-amber-50 text-amber-700 border border-amber-200",
  shortlisted: "bg-purple-50 text-purple-700 border border-purple-200",
  interview: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  evaluation: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  hold: "bg-orange-50 text-orange-700 border border-orange-200",
  onboarding: "bg-green-50 text-green-700 border border-green-200",
  offer: "bg-green-50 text-green-700 border border-green-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
};

export const PANEL_DECISIONS = [
  { value: "hire", label: "Hire" },
  { value: "hold", label: "Hold / Reserve" },
  { value: "do_not_hire", label: "Do not hire" },
] as const;

export type PanelDecision = (typeof PANEL_DECISIONS)[number]["value"];

export type SubmissionStatus = "draft" | "submitted";

/** One entry per status change — see src/lib/careers/statusHistory.ts for the shared append helper every write path routes through. */
export interface StatusHistoryEntry {
  status: ApplicationStatus;
  changed_at: string;
  changed_by: string | null;
}

export interface JobApplication {
  id: string;
  reference_number: string;
  full_name: string;
  email: string;
  phone: string;
  location: string | null;
  role_slug: string;
  role_title: string;
  cover_note: string | null;
  cv_url: string | null;
  cv_public_id: string | null;
  status: ApplicationStatus;
  status_history?: StatusHistoryEntry[];
  submission_status?: SubmissionStatus;
  job_posting_id?: string | null;
  application_form_data?: Record<string, unknown> | null;
  application_form_fields_snapshot?: Record<string, unknown> | null;
  draft_token?: string | null;
  hr_notes: string | null;
  interview_form_data: InterviewFormData | null;
  interview_submitted_at: string | null;
  interview_submitted_by: string | null;
  ai_screening?: AiScreening | null;
  created_at: string;
  updated_at: string;
}

/** Result of the AI shortlisting pass — set once by the screen-applications
 * cron job, read by the admin UI and the daily digest email. */
export interface AiScreening {
  score: number; // 0-100
  summary: string;
  model: string;
  screened_at: string;
}

/** Applications the AI screening has flagged — shown in the Rejects tab. */
export function isAiFlagged(application: Pick<JobApplication, "ai_screening" | "status">): boolean {
  return !!application.ai_screening && ["under_review", "rejected"].includes(application.status);
}

export interface PanelMember {
  id: string;
  name: string;
  email: string;
  stage: 1 | 2;
  access_token: string;
}

export interface StageSubmissionData {
  submitted_at?: string;
  screening?: Record<string, { pass: "yes" | "no" | ""; notes: string }>;
  question_ratings?: Record<
    string,
    { rating: number | null; notes: string }
  >;
  scenario_ratings?: Record<
    string,
    { rating: number | null; notes: string }
  >;
  area_scores?: Record<string, number | null>;
  total_weighted?: number | null;
}

export interface PanelSubmission extends StageSubmissionData {
  member_id: string;
  member_name: string;
  stage: 1 | 2;
}

export type InterviewLocationType = "onsite" | "online";

export interface InterviewSetup {
  /** @deprecated use stage1_members */
  members?: PanelMember[];
  stage1_members?: PanelMember[];
  stage2_members?: PanelMember[];
  interview_start_at?: string;
  /** Stage 1 — onsite (address in `location`) or online (link in `meeting_link`). Missing = legacy onsite records. */
  location_type?: InterviewLocationType;
  location?: string;
  meeting_link?: string;
  stage2_scheduled_at?: string;
  /** Stage 2 — onsite (address in `stage2_location`) or online (link in `stage2_meeting_link`). Missing = legacy onsite records. */
  stage2_location_type?: InterviewLocationType;
  stage2_location?: string;
  stage2_meeting_link?: string;
  /** @deprecated use stage1_invites_sent_at */
  invites_sent_at?: string;
  stage1_invites_sent_at?: string;
  stage2_invites_sent_at?: string;
  candidate_invite_sent_at?: string;
  /**
   * HR manually opens the Stage 1 / Stage 2 panel forms once the interview
   * actually begins (times can slip, so this is a deliberate click, not
   * derived from interview_start_at / stage2_scheduled_at). Panel members'
   * links show a "not open yet" message until the relevant one is set.
   */
  stage1_forms_opened_at?: string;
  stage2_forms_opened_at?: string;
}

export interface Stage1Review {
  average_score?: number | null;
  passed?: boolean;
  reviewed_at?: string;
  reviewed_by?: string;
  notes?: string;
  /** AI-generated read of the panel's Stage 1 scores/notes — advisory only, HR still decides. */
  ai_analysis?: string;
  ai_recommendation?: "advance_to_stage2" | "reject";
  ai_generated_at?: string;
}

/**
 * Comprehensive interview report for an evaluation-status applicant.
 * Generated once by AI (src/app/api/careers/interview/report/generate);
 * HR can then edit freely — edits always save to a separate copy
 * (summary.interview_report_edit) so the original AI version is preserved.
 */
export interface InterviewReport {
  generated_at: string;
  executive_summary: string;
  applicant_details: {
    name: string;
    role: string;
    reference_number: string;
    panel_names: string[];
    interview_date: string | null;
    location: string | null;
    overall_rating: number | null;
  };
  core_competencies: { area: string; score: number | null; assessment: string }[];
  key_observations: {
    strengths: string[];
    weaknesses: string[];
    summary: string;
  };
  final_recommendation: {
    decision: PanelDecision;
    rationale: string;
  };
  /**
   * Every panel member's (and HR's) full raw responses across Stage 1 and
   * Stage 2 — one readable text block per grader, captured at generation
   * time. Shown as an appendix in the downloaded/emailed PDF. Absent on
   * reports generated before this field was added.
   */
  panel_responses?: string[];
}

/**
 * Consolidated, AI-generated hiring summary for a single role — the report
 * HR uses to make the final call on who to hire. One per role, generated
 * once (src/app/api/careers/interview/role-report/generate), then editable
 * by HR indefinitely with every save logged. Stored in the standalone
 * role_interview_reports table (job_applications span multiple roles, so
 * this can't live on a single application row the way InterviewReport does).
 *
 * Because this drives a still-open hire decision, every "who should we
 * hire" section (candidate_rankings, the competency/observation tables,
 * final_recommendation) is scoped to candidates currently in Evaluation
 * status only — Hold/Rejected/Hired candidates already have a decision and
 * aren't part of choosing who to hire now. The funnel and applicant_roster
 * below are the exception: they cover every applicant for the role,
 * regardless of status, as pipeline-wide context.
 */
export interface RoleInterviewReport {
  generated_at: string;
  role_slug: string;
  role_title: string;

  // 1. Executive summary
  executive_summary: string;

  // 2. Applicant funnel — whole pipeline, every status.
  funnel: {
    total_applicants: number;
    /** Screened out at Applied/Under review — never reached Shortlisted. */
    never_shortlisted: number;
    /** Reached Shortlisted at some point (sum of the three buckets below). */
    shortlisted_total: number;
    /** Shortlisted, but the interview process was never started. */
    never_started_interview: number;
    /** Interview started but not finished — never completed Stage 2. */
    reached_stage1_only: number;
    /** Completed both interview stages in full. */
    completed_full_interview: number;
    /** Breakdown of the completed_full_interview group by current outcome. */
    completed_breakdown: {
      still_deciding: number;
      hold: number;
      rejected: number;
      hired: number;
    };
  };

  // 3. Candidate ranking — Evaluation status only (who's actually still in the running).
  candidate_rankings: {
    application_id: string;
    name: string;
    reference_number: string;
    rank: number;
    combined_score: number | null;
  }[];

  // 4. Full applicant roster — every applicant for the role, regardless of status.
  applicant_roster: {
    application_id: string;
    name: string;
    role_title: string;
    /** Human-readable label for how far they got, e.g. "Never shortlisted", "Shortlisted — interview not started", "Reached Stage 1", "Completed — Evaluation" / "— Hold" / "— Rejected" / "— Hired". */
    stage_reached: string;
    panel_names: string[];
    interview_date: string | null;
    location: string | null;
    stage1_rating: number | null;
    stage2_rating: number | null;
  }[];

  // 5. Core competencies — narrative synthesis + per-candidate table, Evaluation status only.
  core_competencies_summary: string;
  core_competencies_table: {
    application_id: string;
    name: string;
    competencies: { area: string; score: number | null; assessment: string }[];
  }[];

  // 6. Key observations — narrative synthesis + per-candidate strengths/weaknesses, Evaluation status only.
  key_observations_summary: string;
  key_observations_table: {
    application_id: string;
    name: string;
    strengths: string[];
    weaknesses: string[];
  }[];

  // 7. Constraints flagged in HR notes across Evaluation-status candidates (availability, salary expectations, disqualifiers, etc.) — empty if none noted.
  constraints: string[];

  // 8. Final recommendation on who to hire, based on candidate_rankings.
  final_recommendation: {
    /** Null if no currently-undecided (Evaluation status) candidate qualifies for a recommendation. */
    application_id: string | null;
    candidate_name: string | null;
    reference_number: string | null;
    rationale: string;
  };

  /**
   * Appendix — links back into the app for every applicant who had at
   * least one interview stage (panel forms/responses, and their individual
   * comprehensive report if one was generated), regardless of status.
   */
  candidate_links: {
    application_id: string;
    name: string;
    reference_number: string;
    /** Deep link into the recruitment dashboard, opened straight to this applicant's panel responses. */
    panel_forms_url: string;
    /** Their individual interview report PDF (includes the full panel-responses appendix) — null if none was generated. */
    individual_report_url: string | null;
  }[];
}

export interface RoleInterviewReportRow {
  id: string;
  role_slug: string;
  role_title: string;
  report: RoleInterviewReport;
  report_edit: RoleInterviewReport | null;
  report_edit_log: { edited_at: string; edited_by: string }[];
  generated_at: string;
  generated_by: string | null;
  updated_at: string;
}

/**
 * Backfills fields added to RoleInterviewReport after a given report was
 * generated with safe empty defaults, so older rows in
 * role_interview_reports don't crash the UI/PDF when read back. Always run
 * report/report_edit through this before use.
 */
export function normalizeRoleInterviewReport(report: RoleInterviewReport): RoleInterviewReport {
  return {
    ...report,
    constraints: report.constraints ?? [],
    candidate_rankings: report.candidate_rankings ?? [],
    applicant_roster: report.applicant_roster ?? [],
    core_competencies_summary: report.core_competencies_summary ?? "",
    core_competencies_table: report.core_competencies_table ?? [],
    key_observations_summary: report.key_observations_summary ?? "",
    key_observations_table: report.key_observations_table ?? [],
    candidate_links: report.candidate_links ?? [],
  };
}

export type InterviewStage = 1 | 2 | 3;

export interface InterviewFormData {
  /** Panel setup — outside staged form */
  setup?: InterviewSetup;
  /** Per-panel member submissions (via public link) */
  panel_submissions?: PanelSubmission[];
  /** HR's own stage scores */
  hr_submission?: {
    stage1?: StageSubmissionData;
    stage2?: StageSubmissionData;
  };
  /** Stage 1 grading review before opening stage 2 */
  stage1_review?: Stage1Review;
  /** 1 = A+B, 2 = C, 3 = evaluation */
  current_stage?: InterviewStage;
  stage1_completed_at?: string;
  stage2_scheduled_at?: string;
  stage2_schedule_sent_at?: string;
  stage2_completed_at?: string;
  /** @deprecated legacy shared ratings — migrated to hr_submission on read */
  screening?: Record<string, { pass: "yes" | "no" | ""; notes: string }>;
  question_ratings?: Record<
    string,
    { rating: number | null; notes: string }
  >;
  scenario_ratings?: Record<
    string,
    { rating: number | null; notes: string }
  >;
  disqualifiers?: Record<string, { observed: "yes" | "no" | ""; notes: string }>;
  summary?: {
    area_scores?: Record<string, number | null>;
    total_weighted?: number | null;
    stage1_average?: number | null;
    stage2_average?: number | null;
    decision?: PanelDecision | "";
    decision_notes?: string;
    recommended_start_date?: string;
    decision_confirmed_at?: string;
    decision_confirmed_by?: string;
    /** AI-generated read of the full Stage 1 + Stage 2 record — advisory only, HR still decides. */
    ai_analysis?: string;
    ai_recommendation?: PanelDecision;
    ai_generated_at?: string;
    /** The comprehensive interview report, generated once by AI — never overwritten after generation. */
    interview_report?: InterviewReport;
    /** HR's editable copy of the report. Saving always writes here, never to interview_report. Falls back to interview_report when this doesn't exist yet. */
    interview_report_edit?: InterviewReport;
    /** Every time HR saves an edit to interview_report_edit, an entry is appended here. */
    interview_report_edit_log?: { edited_at: string; edited_by: string }[];
  };
  /** @deprecated legacy panel fields — migrated on read */
  panel?: {
    chair?: string;
    member_2?: string;
    member_3?: string;
    interview_date?: string;
    location?: string;
  };
}

import { createPanelMember, ensureMemberTokens } from "@/lib/careers/panelInterview";

export function normalizeInterviewFormData(
  raw: InterviewFormData | null | undefined,
): InterviewFormData {
  const data: InterviewFormData = {
    setup: { stage1_members: [createPanelMember("", "", 1)] },
    panel_submissions: [],
    hr_submission: {},
    current_stage: 1,
    screening: {},
    question_ratings: {},
    scenario_ratings: {},
    disqualifiers: {},
    summary: { decision: "" },
    ...(raw ?? {}),
  };

  // Migrate legacy setup.members → stage1_members
  if (!data.setup?.stage1_members?.length && data.setup?.members?.length) {
    data.setup.stage1_members = data.setup.members.map((m) =>
      createPanelMember(m.name, m.email, m.stage ?? 1),
    );
  }

  if (!data.setup?.stage1_members?.length) {
    const legacy = raw?.panel;
    const members: PanelMember[] = [];
    if (legacy?.chair?.trim()) {
      members.push(createPanelMember(legacy.chair.trim(), "", 1));
    }
    if (legacy?.member_2?.trim()) {
      members.push(createPanelMember(legacy.member_2.trim(), "", 1));
    }
    if (legacy?.member_3?.trim()) {
      members.push(createPanelMember(legacy.member_3.trim(), "", 1));
    }
    data.setup = {
      ...data.setup,
      stage1_members: members.length
        ? members
        : [createPanelMember("", "", 1)],
      interview_start_at: legacy?.interview_date
        ? `${legacy.interview_date}T09:00:00`
        : data.setup?.interview_start_at,
      location: legacy?.location ?? data.setup?.location,
      stage1_invites_sent_at:
        data.setup?.stage1_invites_sent_at ?? data.setup?.invites_sent_at,
      candidate_invite_sent_at: data.setup?.candidate_invite_sent_at,
    };
  }

  if (data.setup?.stage1_members) {
    data.setup.stage1_members = ensureMemberTokens(data.setup.stage1_members);
  }
  if (data.setup?.stage2_members) {
    data.setup.stage2_members = ensureMemberTokens(data.setup.stage2_members);
  }

  // Migrate legacy shared ratings → hr_submission
  if (
    !data.hr_submission?.stage1 &&
    (Object.keys(data.question_ratings ?? {}).length > 0 ||
      Object.keys(data.screening ?? {}).length > 0)
  ) {
    data.hr_submission = {
      ...data.hr_submission,
      stage1: {
        screening: data.screening,
        question_ratings: data.question_ratings,
        submitted_at: data.stage1_completed_at,
        total_weighted: data.summary?.total_weighted,
        area_scores: data.summary?.area_scores,
      },
    };
  }

  if (
    !data.hr_submission?.stage2 &&
    Object.keys(data.scenario_ratings ?? {}).length > 0
  ) {
    data.hr_submission = {
      ...data.hr_submission,
      stage2: {
        scenario_ratings: data.scenario_ratings,
        submitted_at: data.stage2_completed_at,
      },
    };
  }

  if (!data.current_stage) {
    if (data.stage2_completed_at) data.current_stage = 3;
    else if (data.stage1_completed_at) data.current_stage = 2;
    else data.current_stage = 1;
  }

  return data;
}

/** @deprecated use interviewWorkflowStepV2 from panelInterview.ts */
export function interviewWorkflowStep(
  data: InterviewFormData,
): "panel" | InterviewStage {
  const setup = data.setup;
  const hasValidPanel =
    (setup?.stage1_invites_sent_at ?? setup?.invites_sent_at) &&
    (setup.stage1_members ?? setup.members ?? []).some(
      (m) => m.name.trim() && m.email.trim(),
    );
  if (!hasValidPanel) return "panel";
  if (!data.stage1_completed_at) return 1;
  if (!data.stage2_completed_at) return 2;
  return 3;
}
