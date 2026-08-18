export const APPLICATION_STATUSES = [
  "applied",
  "under_review",
  "shortlisted",
  "interview",
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
  hold: "Hold / reserve",
  onboarding: "Onboarding",
  offer: "Offer",
  rejected: "Rejected",
};

export const PANEL_DECISIONS = [
  { value: "hire", label: "Hire" },
  { value: "hold", label: "Hold / Reserve" },
  { value: "do_not_hire", label: "Do not hire" },
] as const;

export type PanelDecision = (typeof PANEL_DECISIONS)[number]["value"];

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
  hr_notes: string | null;
  interview_form_data: InterviewFormData | null;
  interview_submitted_at: string | null;
  interview_submitted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PanelMember {
  name: string;
  email: string;
}

export interface InterviewSetup {
  members: PanelMember[];
  interview_start_at?: string;
  location?: string;
  invites_sent_at?: string;
  candidate_invite_sent_at?: string;
}

export type InterviewStage = 1 | 2 | 3;

export interface InterviewFormData {
  /** Panel setup — outside staged form */
  setup?: InterviewSetup;
  /** 1 = A+B, 2 = C, 3 = evaluation */
  current_stage?: InterviewStage;
  stage1_completed_at?: string;
  stage2_scheduled_at?: string;
  stage2_schedule_sent_at?: string;
  stage2_completed_at?: string;
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
    decision?: PanelDecision | "";
    decision_notes?: string;
    recommended_start_date?: string;
    decision_confirmed_at?: string;
    decision_confirmed_by?: string;
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

export function normalizeInterviewFormData(
  raw: InterviewFormData | null | undefined,
): InterviewFormData {
  const data: InterviewFormData = {
    setup: { members: [{ name: "", email: "" }] },
    current_stage: 1,
    screening: {},
    question_ratings: {},
    scenario_ratings: {},
    disqualifiers: {},
    summary: { decision: "" },
    ...(raw ?? {}),
  };

  if (!data.setup?.members?.length) {
    const legacy = raw?.panel;
    const members: PanelMember[] = [];
    if (legacy?.chair?.trim()) {
      members.push({ name: legacy.chair.trim(), email: "" });
    }
    if (legacy?.member_2?.trim()) {
      members.push({ name: legacy.member_2.trim(), email: "" });
    }
    if (legacy?.member_3?.trim()) {
      members.push({ name: legacy.member_3.trim(), email: "" });
    }
    data.setup = {
      members: members.length ? members : [{ name: "", email: "" }],
      interview_start_at: legacy?.interview_date
        ? `${legacy.interview_date}T09:00:00`
        : data.setup?.interview_start_at,
      location: legacy?.location ?? data.setup?.location,
      invites_sent_at: data.setup?.invites_sent_at,
      candidate_invite_sent_at: data.setup?.candidate_invite_sent_at,
    };
  }

  if (!data.current_stage) {
    if (data.stage2_completed_at) data.current_stage = 3;
    else if (data.stage1_completed_at) data.current_stage = 2;
    else data.current_stage = 1;
  }

  return data;
}

export function interviewWorkflowStep(
  data: InterviewFormData,
): "panel" | InterviewStage {
  const setup = data.setup;
  const hasValidPanel =
    setup?.invites_sent_at &&
    setup.members.some((m) => m.name.trim() && m.email.trim());
  if (!hasValidPanel) return "panel";
  if (!data.stage1_completed_at) return 1;
  if (!data.stage2_completed_at) return 2;
  return 3;
}
