import type { SupabaseClient } from "@supabase/supabase-js";
import type { InterviewGuideKey } from "@/lib/careers/openings";

export type JobPostingStatus = "published" | "closed";

export interface JobPosting {
  id: string;
  slug: string;
  job_title_key: string | null;
  title: string;
  location: string;
  employment_type: string;
  summary: string;
  description: string;
  interview_guide_key: InterviewGuideKey;
  jd_file_url: string | null;
  jd_file_public_id: string | null;
  closes_at: string;
  status: JobPostingStatus;
  /** @deprecated use status */
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

export type JobPostingInput = {
  job_title_key: string;
  location?: string;
  employment_type?: string;
  summary: string;
  description: string;
  jd_file_url?: string | null;
  jd_file_public_id?: string | null;
  closes_at: string;
  status?: JobPostingStatus;
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
