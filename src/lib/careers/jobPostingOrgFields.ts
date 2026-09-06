import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Job postings carry one real foreign key column per Organizational
 * Structure list (site_id, business_unit_id, department_id, etc.) — see
 * docs/organizational-structure/job-postings-org-fields.sql. The set of
 * columns isn't fixed (admins can add/remove lists from Set up at any
 * time), so the API whitelists whatever `org_custom_list_types.
 * job_posting_column` currently exist, rather than hardcoding column
 * names anywhere in this route.
 *
 * Numeric-range lists (Age, Salary, ...) additionally have min/max
 * columns (docs/organizational-structure/job-postings-range-fields.sql),
 * letting a posting specify a range instead of one value.
 */
export type OrgFieldOption = {
  /** org_custom_list_types.id */
  id: string;
  label: string;
  singular: string;
  /** Column name on job_postings for a single value, e.g. "site_id". */
  column: string;
  /** Only set for numeric-range lists, e.g. "age_min_id"/"age_max_id". */
  minColumn: string | null;
  maxColumn: string | null;
};

export async function fetchOrgFieldOptions(
  supabase: SupabaseClient,
): Promise<OrgFieldOption[]> {
  const { data } = await supabase
    .from("org_custom_list_types")
    .select("id, label, singular, job_posting_column, job_posting_min_column, job_posting_max_column")
    .order("sort_order", { ascending: true });

  return (data ?? [])
    .filter(
      (row): row is {
        id: string;
        label: string;
        singular: string;
        job_posting_column: string;
        job_posting_min_column: string | null;
        job_posting_max_column: string | null;
      } => typeof row.job_posting_column === "string" && row.job_posting_column.length > 0,
    )
    .map((row) => ({
      id: row.id,
      label: row.label,
      singular: row.singular,
      column: row.job_posting_column,
      minColumn: row.job_posting_min_column,
      maxColumn: row.job_posting_max_column,
    }));
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
