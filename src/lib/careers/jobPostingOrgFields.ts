import type { SupabaseClient } from "@supabase/supabase-js";
import { slugifyJobTitle } from "@/lib/careers/jobPostings";
import { resolveAgeRangeFromMapping } from "@/lib/organizationalStructure/ageMapping";

/**
 * Job postings carry one real foreign key column per Organizational
 * Structure list (site_id, business_unit_id, department_id, etc.) — see
 * docs/organizational-structure/job-postings-org-fields.sql. The set of
 * columns isn't fixed (admins can add/remove lists from Set up at any
 * time), so the API whitelists whatever `org_custom_list_types.
 * job_posting_column` currently exist, rather than hardcoding column
 * names anywhere in this route.
 *
 * Age is not on job_postings — eligibility is set in org mapping (min/max
 * picks from custom_age). Salary and other lists use job_posting_column as
 * usual.
 */
export type OrgFieldOption = {
  /** org_custom_list_types.id */
  id: string;
  label: string;
  singular: string;
  /** The list's own physical table, e.g. "custom_age" — stable even if the list is renamed, so this is what code should match on to find a specific built-in list (see Position/Site/Employment type on the Create job posting page, and the Age lookup in screenApplication.ts). */
  tableName: string;
  /** Column name on job_postings for a single value, e.g. "site_id". */
  column: string;
  /** Only set for numeric-range lists, e.g. "age_min_id"/"age_max_id". */
  minColumn: string | null;
  maxColumn: string | null;
  /** Disabled lists are excluded from the Create job posting form entirely, so they're never required either. */
  isActive: boolean;
};

export async function fetchOrgFieldOptions(
  supabase: SupabaseClient,
): Promise<OrgFieldOption[]> {
  const { data } = await supabase
    .from("org_custom_list_types")
    .select(
      "id, label, singular, table_name, job_posting_column, job_posting_min_column, job_posting_max_column, is_active",
    )
    .order("sort_order", { ascending: true });

  return (data ?? [])
    .filter(
      (row): row is {
        id: string;
        label: string;
        singular: string;
        table_name: string;
        job_posting_column: string;
        job_posting_min_column: string | null;
        job_posting_max_column: string | null;
        is_active: boolean | null;
      } => typeof row.job_posting_column === "string" && row.job_posting_column.length > 0,
    )
    .map((row) => ({
      id: row.id,
      label: row.label,
      singular: row.singular,
      tableName: row.table_name,
      column: row.job_posting_column,
      minColumn: row.job_posting_min_column,
      maxColumn: row.job_posting_max_column,
      isActive: row.is_active !== false,
    }));
}

/**
 * Every org-structure list is required on a job posting (Create job
 * posting's form enforces this client-side; this is the server-side
 * backstop). A numeric-range list counts as filled in if either its single
 * column or both its min/max columns are set — the two are mutually
 * exclusive depending on which mode the posting was saved in. `updates` is
 * the merged column->value map about to be written (i.e. the existing
 * row's values for a PATCH that doesn't touch a given field, layered under
 * whatever this request is changing). Returns the list of missing labels,
 * empty when everything required is present.
 */
export function findMissingOrgFields(
  options: OrgFieldOption[],
  values: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const opt of options.filter((o) => o.isActive)) {
    const hasSingle = typeof values[opt.column] === "string" && values[opt.column];
    if (hasSingle) continue;
    if (opt.minColumn && opt.maxColumn) {
      const hasRange =
        typeof values[opt.minColumn] === "string" &&
        values[opt.minColumn] &&
        typeof values[opt.maxColumn] === "string" &&
        values[opt.maxColumn];
      if (hasRange) continue;
    }
    missing.push(opt.label);
  }
  return missing;
}

/** Every job_postings column these options could possibly touch — single, min, and max. */
export function allOrgFieldColumns(options: OrgFieldOption[]): string[] {
  const columns: string[] = [];
  for (const opt of options) {
    columns.push(opt.column);
    if (opt.minColumn) columns.push(opt.minColumn);
    if (opt.maxColumn) columns.push(opt.maxColumn);
  }
  return columns;
}

/**
 * Filters a raw request body down to only the org-structure columns that
 * currently exist (single, min, and max alike), coercing "" to null
 * (clearing the field) and dropping anything not on the whitelist. Values
 * are trusted to be valid row ids within their list — the database's own
 * foreign key constraint is what actually rejects a bad id, this just
 * avoids writing to unknown columns.
 */
export function extractOrgFieldUpdates(
  body: Record<string, unknown>,
  options: OrgFieldOption[],
): Record<string, string | null> {
  const updates: Record<string, string | null> = {};
  for (const column of allOrgFieldColumns(options)) {
    if (!(column in body)) continue;
    const raw = body[column];
    updates[column] = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }
  return updates;
}

/**
 * Resolves a job posting's title straight from its selected Position —
 * Create job posting no longer has its own separate job-title-options list
 * (retired along with the "Job posting" editor under Recruitment in System
 * Definitions). `positionId` is whatever value is in the request body for
 * the Position org-structure column (see allOrgFieldColumns/
 * extractOrgFieldUpdates above); the caller is expected to have already
 * validated it's present via findMissingOrgFields.
 */
export async function resolveTitleFromPosition(
  supabase: SupabaseClient,
  options: OrgFieldOption[],
  updates: Record<string, unknown>,
): Promise<{ title: string } | null> {
  const positionOption = options.find((o) => o.tableName === "custom_position");
  if (!positionOption) return null;
  const positionId = updates[positionOption.column];
  if (typeof positionId !== "string" || !positionId) return null;

  const { data } = await supabase
    .from(positionOption.tableName)
    .select("label")
    .eq("id", positionId)
    .maybeSingle();
  if (!data?.label) return null;

  return { title: data.label as string };
}

/**
 * Turns a Position's label into a unique job posting slug/key, the same way
 * the old job-title-options "Key" field used to — checked against every
 * existing slug and, on collision, suffixed with a short timestamp (mirrors
 * the dedupe logic previously inline in the postings POST route).
 */
export async function generateUniquePostingSlug(
  supabase: SupabaseClient,
  title: string,
): Promise<string> {
  const base = slugifyJobTitle(title);
  const { data: existing } = await supabase
    .from("job_postings")
    .select("slug")
    .like("slug", `${base}%`);

  if (existing?.some((r) => r.slug === base)) {
    return `${base}_${Date.now().toString(36)}`;
  }
  return base;
}

/**
 * Resolves age eligibility for a job posting from org mapping (min/max
 * years chosen on the Age mapping tab for that posting's position path).
 */
export async function resolveAgeRangeFromPosting(
  supabase: SupabaseClient,
  jobPostingId: string | null,
): Promise<{ ageMin: number; ageMax: number } | null> {
  if (!jobPostingId) return null;

  const { data: postingRow } = await supabase
    .from("job_postings")
    .select("site_id, business_unit_id, department_id, section_id, position_id")
    .eq("id", jobPostingId)
    .maybeSingle();
  if (!postingRow) return null;

  return resolveAgeRangeFromMapping(supabase, postingRow);
}
