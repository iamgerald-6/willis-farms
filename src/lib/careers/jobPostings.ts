import type { SupabaseClient } from "@supabase/supabase-js";
import type { InterviewGuideKey } from "@/lib/careers/openings";

export type JobPostingStatus = "published" | "closed";

/** Field key -> human label, shared between the admin editor and the public details page. */
export const JOB_POSTING_CONTENT_SECTIONS: {
  key: JobPostingContentField;
  label: string;
}[] = [
  { key: "role_scope", label: "Role Scope" },
  { key: "key_responsibilities", label: "Key Responsibilities" },
  { key: "minimum_qualifications", label: "Minimum Qualifications" },
  { key: "preferred_qualifications", label: "Preferred Qualifications" },
  { key: "experience", label: "Experience" },
  { key: "required_skills_attributes", label: "Required Skills & Attributes" },
  { key: "non_negotiable_standards", label: "Non-Negotiable Standards" },
];

export type JobPostingContentField =
  | "role_scope"
  | "key_responsibilities"
  | "minimum_qualifications"
  | "preferred_qualifications"
  | "experience"
  | "required_skills_attributes"
  | "non_negotiable_standards";

export interface JobPosting {
  id: string;
  slug: string;
  job_title_key: string | null;
  title: string;
  location: string;
  employment_type: string;
  summary: string;
  description: string;
  // Long-form job description sections. Plain text, written using
  // SectionTextEditor's shorthand ("# heading", "- bullet", "1. numbered",
  // "*bold*", "_italic_") and formatted for display by SectionText.
  role_scope: string;
  key_responsibilities: string;
  minimum_qualifications: string;
  preferred_qualifications: string;
  experience: string;
  required_skills_attributes: string;
  non_negotiable_standards: string;
  interview_guide_key: InterviewGuideKey;
  jd_file_url: string | null;
  jd_file_public_id: string | null;
  closes_at: string;
  status: JobPostingStatus;
  /** @deprecated use status */
  is_active?: boolean;
  created_at: string;
  updated_at: string;
  /** Set once this closed posting has been reopened as a new posting — points at the new one. Null means still current. */
  superseded_by?: string | null;
}

export type JobPostingInput = {
  job_title_key: string;
  location?: string;
  employment_type?: string;
  summary: string;
  description: string;
  role_scope?: string;
  key_responsibilities?: string;
  minimum_qualifications?: string;
  preferred_qualifications?: string;
  experience?: string;
  required_skills_attributes?: string;
  non_negotiable_standards?: string;
  jd_file_url?: string | null;
  jd_file_public_id?: string | null;
  closes_at: string;
  status?: JobPostingStatus;
  /** Set when this new posting is reopening an old, closed one — marks that old posting as superseded so it drops off the HR list. */
  supersedes_id?: string;
};

export const JOB_POSTING_STATUS_LABELS: Record<JobPostingStatus, string> = {
  published: "Published",
  closed: "Closed",
};

export { formatPublicJobTitle } from "@/lib/careers/jobPostingOptions";

export function slugifyJobTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function normalizePostingStatus(
  row: Pick<JobPosting, "status" | "is_active" | "closes_at">,
): JobPostingStatus {
  if (row.status === "published" || row.status === "closed") {
    return row.status;
  }
  if (row.is_active === false) return "closed";
  if (new Date(row.closes_at).getTime() <= Date.now()) return "closed";
  return "published";
}

/** Public careers page and new applications — published only. */
export function isPostingPublic(
  posting: Pick<JobPosting, "status" | "is_active" | "closes_at">,
): boolean {
  return normalizePostingStatus(posting) === "published";
}

/** @deprecated use isPostingPublic */
export function isPostingLive(
  posting: Pick<JobPosting, "status" | "is_active" | "closes_at">,
): boolean {
  return isPostingPublic(posting);
}

export function statusFromClosingDate(closesAt: string): JobPostingStatus {
  return new Date(closesAt).getTime() > Date.now() ? "published" : "closed";
}

/** When deadline passes, mark published postings as closed (HR still sees them). */
export async function syncExpiredPostings(
  supabase: SupabaseClient,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("job_postings")
    .update({ status: "closed" })
    .eq("status", "published")
    .lt("closes_at", now);

  if (error && !error.message?.includes("status")) {
    throw error;
  }
}

export function previewDescription(text: string, maxLength = 220): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trim()}…`;
}
