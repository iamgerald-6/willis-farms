import type { SupabaseClient } from "@supabase/supabase-js";
import type { InterviewGuideKey } from "@/lib/careers/openings";
import { getInterviewGuideKeyForRoleSlug } from "@/lib/careers/openings";
import {
  RECRUITMENT_JOB_POSTINGS_LIST,
  RECRUITMENT_MODULE_ID,
} from "@/lib/systemDefinitions/recruitmentDefaults";
import type { SystemOption } from "@/lib/systemDefinitions";

export interface JobPostingOption {
  id: string;
  key: string;
  label: string;
  interviewGuideKey: InterviewGuideKey;
  sort_order: number;
  is_active: boolean;
}

/** @deprecated use JobPostingOption */
export type JobTitleOption = JobPostingOption;

const GUIDE_KEYS: InterviewGuideKey[] = [
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "L6",
  "L7",
  "data_analyst",
  "veterinarian",
];

export function parseJobPostingRules(
  raw: Record<string, unknown> | null | undefined,
): InterviewGuideKey {
  const key = String(raw?.interviewGuideKey ?? "L1");
  return GUIDE_KEYS.includes(key as InterviewGuideKey)
    ? (key as InterviewGuideKey)
    : "L1";
}

/** @deprecated use parseJobPostingRules */
export const parseJobTitleRules = parseJobPostingRules;

export function systemOptionToJobPosting(
  option: SystemOption,
): JobPostingOption | null {
  const key = option.legacy_value?.trim();
  if (!key) return null;

  return {
    id: option.id,
    key,
    label: option.label,
    interviewGuideKey: parseJobPostingRules(option.rules as Record<string, unknown>),
    sort_order: option.sort_order,
    is_active: option.is_active,
  };
}

export function normalizeJobPostingOptions(
  options: SystemOption[],
): JobPostingOption[] {
  return options
    .map(systemOptionToJobPosting)
    .filter((o): o is JobPostingOption => o !== null && o.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** @deprecated use normalizeJobPostingOptions */
export const normalizeJobTitleOptions = normalizeJobPostingOptions;

export async function fetchJobPostingOptions(
  supabase: SupabaseClient,
  opts?: { includeInactive?: boolean },
): Promise<JobPostingOption[]> {
  const { data, error } = await supabase
    .from("system_options")
    .select("*")
    .eq("module_id", RECRUITMENT_MODULE_ID)
    .in("option_list", [RECRUITMENT_JOB_POSTINGS_LIST, "careers.jobTitles"])
    .order("sort_order", { ascending: true });

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return [];
    }
    throw error;
  }

  const rows = (data ?? []) as SystemOption[];
  if (rows.length === 0) {
    return [];
  }

  if (opts?.includeInactive) {
    return rows
      .map(systemOptionToJobPosting)
      .filter((o): o is JobPostingOption => o !== null)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  return normalizeJobPostingOptions(rows);
}

/** @deprecated use fetchJobPostingOptions */
export const fetchJobTitleOptions = fetchJobPostingOptions;

export function findJobPostingOption(
  options: JobPostingOption[],
  key: string,
): JobPostingOption | undefined {
  return options.find((o) => o.key === key);
}

/** @deprecated use findJobPostingOption */
export const findJobTitleOption = findJobPostingOption;

export async function resolveInterviewGuideKey(
  supabase: SupabaseClient,
  roleSlug: string,
): Promise<InterviewGuideKey | undefined> {
  const legacy = getInterviewGuideKeyForRoleSlug(roleSlug);
  if (legacy) return legacy;

  const options = await fetchJobPostingOptions(supabase);
  return findJobPostingOption(options, roleSlug)?.interviewGuideKey;
}

/** Strip internal grade codes like "(L1)" from titles shown on the public careers page. */
export function formatPublicJobTitle(title: string): string {
  return title
    .replace(/\s*\(L[1-7]\)\s*$/i, "")
    .replace(/\s*—\s*L[1-7]\s*$/i, "")
    .trim();
}
