import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchJobPostingOptions,
  findJobPostingOption,
  type JobPostingOption,
} from "@/lib/careers/jobPostingOptions";

export async function resolveJobTitleKey(
  supabase: SupabaseClient,
  jobTitleKey: string,
): Promise<{ option: JobPostingOption } | { error: string }> {
  const key = jobTitleKey?.trim();
  if (!key) {
    return { error: "Job posting role is required." };
  }

  const options = await fetchJobPostingOptions(supabase);
  const option = findJobPostingOption(options, key);
  if (!option) {
    return { error: "Invalid job posting role selected." };
  }

  return { option };
}
