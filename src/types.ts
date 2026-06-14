export type Role = "admin" | "super_admin" | "employee";

export type GradeLevel = "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";

export interface User {
  id: string;
  user_id: string;
  email: string;
  phone?: string | null;
  role: Role;
  first_name: string;
  last_name: string;
  company_id: string;
  job_position?: string | null;
  grade_level?: GradeLevel | null;
  created_at?: string;
}

export interface Content {
  id: string;
  title: string;
  category: string;
  sub_category: string;
  description: string;
  cover_image_url?: string;
  video_url?: string;
  video_duration_minutes?: number;
  document_url?: string;
  document_read_minutes?: number;
  created_at: string;
  created_by: string;
}

export type RatingValue = 1 | 2 | 3 | 4 | 5;

export interface RatingItem {
  rating: RatingValue | null;
  comment: string;
}

export interface SectionRatings {
  [itemLabel: string]: RatingItem;
}

export interface Ratings {
  [sectionKey: string]: SectionRatings;
}

export interface Appraisal {
  id: string;
  company_id: string;
  employee_name: string;
  job_title: string;
  current_grade: string;
  grade_band: string;
  cycle: "quarterly" | "annual";
  review_quarter?: string | null;
  review_year: number;
  immediate_supervisor: string;
  reviewing_manager?: string | null;
  period_covered?: string | null;
  section_authorisations_held?: string | null;
  ratings: Ratings;
  promotion_readiness: string;
  strengths_observed?: string | null;
  improvement_areas?: string | null;
  agreed_actions?: string | null;
  employee_comments?: string | null;
  most_significant_achievement?: string | null;
  development_plan_next_year?: string | null;
  promotion_readiness_assessment?: string | null;
  compensation_review_input?: string | null;
  created_at: string;
}

export interface Appraisal {
  id: string;
  company_id: string;
  employee_name: string;
  job_title: string;
  current_grade: string;
  grade_band: string;
  cycle: "quarterly" | "annual";
  review_quarter?: string | null;
  review_year: number;
  immediate_supervisor: string;
  reviewing_manager?: string | null;
  period_covered?: string | null;
  section_authorisations_held?: string | null;
  ratings: Ratings;
  promotion_readiness: string;
  strengths_observed?: string | null;
  improvement_areas?: string | null;
  agreed_actions?: string | null;
  employee_comments?: string | null;
  most_significant_achievement?: string | null;
  development_plan_next_year?: string | null;
  promotion_readiness_assessment?: string | null;
  compensation_review_input?: string | null;
  created_at: string;
}
