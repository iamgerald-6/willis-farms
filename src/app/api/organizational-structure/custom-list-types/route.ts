import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";
import { slugifyLabel } from "@/lib/organizationalStructure";
import type {
  CustomFieldDef,
  CustomFieldType,
  OrgCustomListType,
} from "@/lib/organizationalStructureCustomLists";
import {
  isAgeCatalogListType,
  normalizeAgeCatalogListType,
} from "@/lib/organizationalStructureCustomLists";

const VALID_FIELD_TYPES: CustomFieldType[] = ["text", "number", "boolean", "date", "select"];

// Columns every custom list's table already has — an extra field can't
// reuse one of these names.
const RESERVED_FIELD_KEYS = new Set([
  "id",
  "label",
  "code",
  "region",
  "sort_order",
  "is_active",
  "notes",
  "created_at",
  "updated_at",
]);

function sanitizeFields(input: unknown): CustomFieldDef[] | null {
  if (!Array.isArray(input)) return [];
  const fields: CustomFieldDef[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const label = (raw as { label?: unknown }).label;
    const type = (raw as { type?: unknown }).type;
    if (typeof label !== "string" || !label.trim()) return null;
    if (typeof type !== "string" || !VALID_FIELD_TYPES.includes(type as CustomFieldType)) {
      return null;
    }
    const field: CustomFieldDef = {
      key: slugifyLabel(label),
      label: label.trim(),
      type: type as CustomFieldType,
    };
    if (type === "select") {
      const options = (raw as { options?: unknown }).options;
      field.options = Array.isArray(options)
        ? options.filter((o): o is string => typeof o === "string" && !!o.trim()).map((o) => o.trim())
        : [];
    }
    fields.push(field);
  }
  return fields;
}

/** GET — every custom list type, with a live item count per list for the Set up hub table. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden(
        "System Definitions view access is required to view custom lists.",
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data, error } = await supabase
      .from("org_custom_list_types")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const listTypes = (data ?? []) as OrgCustomListType[];
    const withCounts: OrgCustomListType[] = await Promise.all(
      listTypes.map(async (listType) => {
        const { count } = await supabase
          .from(listType.table_name)
          .select("id", { count: "exact", head: true });
        return { ...normalizeAgeCatalogListType(listType), item_count: count ?? 0 };
      }),
    );

    return NextResponse.json({ data: withCounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — create a new custom list type, and its own physical table. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden(
        "System Definitions add access is required to add a new list.",
      );
    }

    const body = await req.json();
    const label = (body.label as string | undefined)?.trim();
    const hasRegion = body.has_region === true;
    const isNumericRange = body.is_numeric_range === true;
    const isAgeCatalogLabel = /^ages?$/i.test(label.trim());
    let numericRangeMode = body.numeric_range_mode === "bands" ? "bands" : "digits";
    // Age: digits fill on Manage (33, 34, 35…). Salary: bands. No job posting columns for Age.
    const effectiveIsNumericRange = isAgeCatalogLabel || isNumericRange;
    if (isAgeCatalogLabel) numericRangeMode = "digits";

    if (!label) {
      return NextResponse.json({ error: "List name is required" }, { status: 400 });
    }

    const fields = sanitizeFields(body.fields);
    if (fields === null) {
      return NextResponse.json({ error: "Invalid field definitions" }, { status: 400 });
    }

    const fieldKeys = new Set<string>();
    for (const f of fields) {
      if (RESERVED_FIELD_KEYS.has(f.key)) {
        return NextResponse.json(
          { error: `"${f.label}" isn't available as a field name. Choose another.` },
          { status: 400 },
        );
      }
      if (fieldKeys.has(f.key)) {
        return NextResponse.json(
          { error: `Duplicate field: "${f.label}"` },
          { status: 400 },
        );
      }
      fieldKeys.add(f.key);
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { count } = await supabase
      .from("org_custom_list_types")
      .select("id", { count: "exact", head: true });

    // No singularization — a naive "strip a trailing s" guess (e.g. for
    // "Add ___" button text) mangled words like "Status", "Series", or
    // "Business" that already end in "s" without being plural. Using the
    // label as-is means "Add Sites" instead of "Add Site", but it's never
    // wrong, unlike the guess. Admins can't rename it after creation (same
    // as `code` on the fixed lists).
    const singular = label.trim();
    const code = slugifyLabel(label);
    const tableName = `custom_${code}`;

    // Create the physical table first — if this fails (e.g. name
    // collision), nothing is written to org_custom_list_types at all.
    const { error: createTableError } = await supabase.rpc("create_org_dynamic_list_table", {
      p_table_name: tableName,
      p_has_region: hasRegion,
      p_fields: fields,
    });

    if (createTableError) {
      return NextResponse.json({ error: createTableError.message }, { status: 500 });
    }

    // Give this list its own real foreign key column on job_postings, so a
    // posting can reference one row from it — same "job_posting_column"
    // every list gets, base or custom. Column name derived from the
    // singular (e.g. "business unit" -> "business_unit_id"), with a
    // numeric suffix on collision, same convention as mapping table
    // column names used to follow.
    // Age is catalog + org-mapping only — no columns on job_postings.
    const isAgeCatalog = tableName === "custom_age" || isAgeCatalogLabel;

    let jobPostingColumn: string | null = null;
    if (!isAgeCatalog) {
      const baseColumn = `${slugifyLabel(singular)}_id`;
      jobPostingColumn = baseColumn;
      let colSuffix = 2;
      for (;;) {
        const { data: collision } = await supabase
          .from("org_custom_list_types")
          .select("id")
          .eq("job_posting_column", jobPostingColumn)
          .maybeSingle();
        if (!collision) break;
        jobPostingColumn = `${baseColumn}_${colSuffix}`;
        colSuffix += 1;
      }

      const { error: addColumnError } = await supabase.rpc("add_job_posting_org_column", {
        p_column_name: jobPostingColumn,
        p_referenced_table: tableName,
      });
      if (addColumnError) {
        await supabase.rpc("drop_org_dynamic_list_table", { p_table_name: tableName });
        return NextResponse.json({ error: addColumnError.message }, { status: 500 });
      }
    }

    // Digits-mode numeric-range lists (except Age) get min/max posting columns.
    let jobPostingMinColumn: string | null = null;
    let jobPostingMaxColumn: string | null = null;
    if (effectiveIsNumericRange && numericRangeMode === "digits" && !isAgeCatalog && jobPostingColumn) {
      const slugBase = slugifyLabel(singular);
      jobPostingMinColumn = `${slugBase}_min_id`;
      jobPostingMaxColumn = `${slugBase}_max_id`;
      if (jobPostingMinColumn === jobPostingColumn || jobPostingMaxColumn === jobPostingColumn) {
        jobPostingMinColumn = `${jobPostingColumn}_min`;
        jobPostingMaxColumn = `${jobPostingColumn}_max`;
      }

      const { error: addMinError } = await supabase.rpc("add_job_posting_org_column", {
        p_column_name: jobPostingMinColumn,
        p_referenced_table: tableName,
      });
      const { error: addMaxError } = addMinError
        ? { error: null }
        : await supabase.rpc("add_job_posting_org_column", {
            p_column_name: jobPostingMaxColumn,
            p_referenced_table: tableName,
          });
      if (addMinError || addMaxError) {
        await supabase.rpc("drop_job_posting_org_column", { p_column_name: jobPostingColumn });
        if (!addMinError) {
          await supabase.rpc("drop_job_posting_org_column", { p_column_name: jobPostingMinColumn });
        }
        await supabase.rpc("drop_org_dynamic_list_table", { p_table_name: tableName });
        return NextResponse.json(
          { error: (addMinError ?? addMaxError)?.message },
          { status: 500 },
        );
      }
    }

    const { data, error } = await supabase
      .from("org_custom_list_types")
      .insert([
        {
          label: label.trim(),
          singular,
          code,
          table_name: tableName,
          has_region: hasRegion,
          is_numeric_range: effectiveIsNumericRange,
          numeric_range_mode: numericRangeMode,
          fields,
          sort_order: count ?? 0,
          job_posting_column: jobPostingColumn,
          job_posting_min_column: jobPostingMinColumn,
          job_posting_max_column: jobPostingMaxColumn,
        },
      ])
      .select()
      .single();

    if (error) {
      // Metadata insert failed after the table and column(s) were already
      // created — clean up so nothing orphaned is left behind.
      await supabase.rpc("drop_job_posting_org_column", { p_column_name: jobPostingColumn });
      if (jobPostingMinColumn) {
        await supabase.rpc("drop_job_posting_org_column", { p_column_name: jobPostingMinColumn });
      }
      if (jobPostingMaxColumn) {
        await supabase.rpc("drop_job_posting_org_column", { p_column_name: jobPostingMaxColumn });
      }
      await supabase.rpc("drop_org_dynamic_list_table", { p_table_name: tableName });
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A list with that name already exists." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
