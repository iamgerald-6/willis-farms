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
 * Resolves the age-eligibility band for a specific job posting from its own
 * Age org-structure field, rather than from a job-grade config — used by AI
 * screening (screenApplication.ts). Age is now a required field on every
 * posting (see Create job posting), stored either as a single value column
 * or as a min/max range pair depending on which mode it was saved in; both
 * are real foreign keys into the Age list's own table. Returns null only if
 * the Age list itself doesn't exist or the posting's row can't be read —
 * should not happen for any posting created after Age became required.
 */
export async function resolveAgeRangeFromPosting(
  supabase: SupabaseClient,
  jobPostingId: string | null,
): Promise<{ ageMin: number; ageMax: number } | null> {
  if (!jobPostingId) return null;

  const options = await fetchOrgFieldOptions(supabase);
  const ageOption = options.find((o) => o.tableName === "custom_age");
  if (!ageOption) return null;

  const columns = [ageOption.column, ageOption.minColumn, ageOption.maxColumn].filter(
    (c): c is string => !!c,
  );
  const { data: postingRow } = await supabase
    .from("job_postings")
    .select(columns.join(", "))
    .eq("id", jobPostingId)
    .maybeSingle();
  if (!postingRow) return null;

  const row = postingRow as unknown as Record<string, unknown>;
  const singleId = row[ageOption.column];
  const minId = ageOption.minColumn ? row[ageOption.minColumn] : null;
  const maxId = ageOption.maxColumn ? row[ageOption.maxColumn] : null;

  const ids = [singleId, minId, maxId].filter((v): v is string => typeof v === "string");
  if (ids.length === 0) return null;

  const { data: ageItems } = await supabase.from(ageOption.tableName).select("id, label").in("id", ids);
  const labelById = new Map((ageItems ?? []).map((item) => [item.id as string, item.label as string]));

  const parseAge = (id: unknown): number | null => {
    if (typeof id !== "string") return null;
    const label = labelById.get(id);
    if (label == null) return null;
    const n = parseInt(label, 10);
    return Number.isFinite(n) ? n : null;
  };

  if (typeof minId === "string" && typeof maxId === "string") {
    const ageMin = parseAge(minId);
    const ageMax = parseAge(maxId);
    if (ageMin != null && ageMax != null) return { ageMin, ageMax };
  }
  if (typeof singleId === "string") {
    const age = parseAge(singleId);
    if (age != null) return { ageMin: age, ageMax: age };
  }
  return null;
}
