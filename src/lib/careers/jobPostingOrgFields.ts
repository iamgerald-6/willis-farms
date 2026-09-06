import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Job postings carry one real foreign key column per Organizational
 * Structure list (site_id, business_unit_id, department_id, etc.) — see
 * docs/organizational-structure/job-postings-org-fields.sql. The set of
 * columns isn't fixed (admins can add/remove lists from Set up at any
 * time), so the API whitelists whatever `org_custom_list_types.
 * job_posting_column` currently exist, rather than hardcoding column
 * names anywhere in this route.
 */
export type OrgFieldOption = {
  /** org_custom_list_types.id */
  id: string;
  label: string;
  singular: string;
  /** Column name on job_postings, e.g. "site_id". */
  column: string;
};

export async function fetchOrgFieldOptions(
  supabase: SupabaseClient,
): Promise<OrgFieldOption[]> {
  const { data } = await supabase
    .from("org_custom_list_types")
    .select("id, label, singular, job_posting_column")
    .order("sort_order", { ascending: true });

  return (data ?? [])
    .filter((row): row is { id: string; label: string; singular: string; job_posting_column: string } =>
      typeof row.job_posting_column === "string" && row.job_posting_column.length > 0,
    )
    .map((row) => ({
      id: row.id,
      label: row.label,
      singular: row.singular,
      column: row.job_posting_column,
    }));
}

/**
 * Filters a raw request body down to only the org-structure columns that
 * currently exist, coercing "" to null (clearing the field) and dropping
 * anything not on the whitelist. Values are trusted to be valid row ids
 * within their list — the database's own foreign key constraint is what
 * actually rejects a bad id, this just avoids writing to unknown columns.
 */
export function extractOrgFieldUpdates(
  body: Record<string, unknown>,
  options: OrgFieldOption[],
): Record<string, string | null> {
  const updates: Record<string, string | null> = {};
  for (const opt of options) {
    if (!(opt.column in body)) continue;
    const raw = body[opt.column];
    updates[opt.column] = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }
  return updates;
}
