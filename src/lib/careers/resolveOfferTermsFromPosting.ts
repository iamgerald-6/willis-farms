import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrgFieldOptions } from "@/lib/careers/jobPostingOrgFields";

/**
 * Everything Offer Terms can source straight from the application's linked
 * job posting, instead of asking HR to re-type it. Undefined for any piece
 * a specific posting doesn't have — should only happen for a posting saved
 * before that field existed/became required.
 */
export type PostingSourcedOfferTerms = {
  position_title?: string;
  employment_type?: string;
  department?: string;
  work_location?: string;
  grade_level?: string;
  /** The posting's own Salary item label, used as-is — see the "Salary source" decision: the posting's Salary field replaces the old grade-level pay-tier system entirely. */
  salary_tier?: string;
  /** Formatted "GHS min – max", when the salary value/label is a parseable numeric range. */
  salary_range?: string;
  salary_band_min?: string;
  salary_band_max?: string;
};

/** Strips currency/commas and pulls two numbers separated by a dash — matches both a bands-mode item's own label (e.g. "3000-4000", see generate-range/route.ts) and a digits-mode min/max pair joined the same way. */
function parseRangeLabel(label: string): { min: number; max: number } | null {
  const cleaned = label.replace(/,/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function formatGhsRange(min: number, max: number): string {
  const fmt = (n: number) => `GHS ${n.toLocaleString("en-GH")}`;
  return `${fmt(min)} – ${fmt(max)}`;
}

export async function resolveOfferTermsFromPosting(
  supabase: SupabaseClient,
  jobPostingId: string | null | undefined,
): Promise<PostingSourcedOfferTerms | null> {
  if (!jobPostingId) return null;

  const options = await fetchOrgFieldOptions(supabase);
  const deptOption = options.find((o) => o.tableName === "departments");
  const gradeOption = options.find((o) => o.tableName === "grade_levels");
  const salaryOption = options.find((o) => o.tableName === "custom_salary");

  const columns = new Set(["id", "title", "location", "employment_type"]);
  if (deptOption) columns.add(deptOption.column);
  if (gradeOption) columns.add(gradeOption.column);
  if (salaryOption) {
    columns.add(salaryOption.column);
    if (salaryOption.minColumn) columns.add(salaryOption.minColumn);
    if (salaryOption.maxColumn) columns.add(salaryOption.maxColumn);
  }

  const { data: postingRaw } = await supabase
    .from("job_postings")
    .select([...columns].join(", "))
    .eq("id", jobPostingId)
    .maybeSingle();
  if (!postingRaw) return null;
  const row = postingRaw as unknown as Record<string, unknown>;

  const result: PostingSourcedOfferTerms = {
    position_title: typeof row.title === "string" ? row.title : undefined,
    employment_type: typeof row.employment_type === "string" ? row.employment_type : undefined,
    work_location: typeof row.location === "string" ? row.location : undefined,
  };

  if (deptOption) {
    const deptId = row[deptOption.column];
    if (typeof deptId === "string" && deptId) {
      const { data: dept } = await supabase
        .from(deptOption.tableName)
        .select("label")
        .eq("id", deptId)
        .maybeSingle();
      if (dept?.label) result.department = dept.label as string;
    }
  }

  if (gradeOption) {
    const gradeId = row[gradeOption.column];
    if (typeof gradeId === "string" && gradeId) {
      const { data: grade } = await supabase
        .from(gradeOption.tableName)
        .select("label")
        .eq("id", gradeId)
        .maybeSingle();
      if (grade?.label) result.grade_level = grade.label as string;
    }
  }

  if (salaryOption) {
    const singleId = row[salaryOption.column];
    const minId = salaryOption.minColumn ? row[salaryOption.minColumn] : null;
    const maxId = salaryOption.maxColumn ? row[salaryOption.maxColumn] : null;

    if (typeof minId === "string" && minId && typeof maxId === "string" && maxId) {
      const { data: items } = await supabase
        .from(salaryOption.tableName)
        .select("id, label")
        .in("id", [minId, maxId]);
      const byId = new Map((items ?? []).map((i) => [i.id as string, i.label as string]));
      const minLabel = byId.get(minId);
      const maxLabel = byId.get(maxId);
      if (minLabel && maxLabel) {
        result.salary_tier = `${minLabel} – ${maxLabel}`;
        const minNum = Number(minLabel.replace(/,/g, ""));
        const maxNum = Number(maxLabel.replace(/,/g, ""));
        if (Number.isFinite(minNum) && Number.isFinite(maxNum)) {
          result.salary_range = formatGhsRange(minNum, maxNum);
          result.salary_band_min = String(minNum);
          result.salary_band_max = String(maxNum);
        }
      }
    } else if (typeof singleId === "string" && singleId) {
      const { data: item } = await supabase
        .from(salaryOption.tableName)
        .select("label")
        .eq("id", singleId)
        .maybeSingle();
      if (item?.label) {
        result.salary_tier = item.label as string;
        const parsed = parseRangeLabel(item.label as string);
        if (parsed) {
          result.salary_range = formatGhsRange(parsed.min, parsed.max);
          result.salary_band_min = String(parsed.min);
          result.salary_band_max = String(parsed.max);
        }
      }
    }
  }

  return result;
}
