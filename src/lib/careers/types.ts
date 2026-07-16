export const APPLICATION_STATUSES = [
  "applied",
  "under_review",
  "shortlisted",
  "interview",
  "offer",
  "rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  interview: "Interview",
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

export interface InterviewFormData {
  panel?: {
    chair?: string;
    member_2?: string;
    member_3?: string;
    interview_date?: string;
    location?: string;
  };
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
  };
}
