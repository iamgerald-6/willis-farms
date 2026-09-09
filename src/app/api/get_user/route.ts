import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchUserRoleLabelMap } from "@/lib/userRoleAccessControl";
import { overlayPlacementFromApplications } from "@/lib/careers/resolveEmployeeOrgPlacement";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    // "*, grade_levels(code)" — grade_level is no longer a stored column on
    // users; it's derived live on every request from grade_level_id's FK
    // join to the Organizational Structure "Grade levels" catalog, so it
    // can never drift from the catalog's own definitions. See
    // docs/organizational-structure/drop-users-grade-level-column.sql.
    let { data, error } = await supabaseAdmin
      .from("users")
      .select("*, grade_levels(code), sections(label)");

    // sections(label) needs users.section_id → sections.id. If that embed
    // isn't in the PostgREST cache yet, still return users so appraisal
    // and access-control keep working; the form then falls back to the
    // /appraisal/sections catalog lookup.
    if (error) {
      const fallback = await supabaseAdmin
        .from("users")
        .select("*, grade_levels(code)");
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return NextResponse.json([], { status: 400 });
    }

    // Attach each user's resolved "User role" label (Standard, Executive,
    // Supervisory, ...) so client pages can build access decisions off the
    // new role system without each one re-resolving the dynamic list table
    // themselves — see userRoleAccessControl.ts. Empty map (list not
    // created yet, or nobody migrated) just means every user_role_label
    // comes back null, and callers fall back to the old role/grade fields.
    const roleLabels = await fetchUserRoleLabelMap(supabaseAdmin);
    const withRoleLabels = (data ?? []).map((row) => {
      const { grade_levels, sections, ...rest } = row as typeof row & {
        grade_levels?: { code: string | null } | null;
        sections?: { label: string | null } | null;
      };
      return {
        ...rest,
        grade_level: grade_levels?.code ?? null,
        section_label: sections?.label ?? null,
        user_role_label: rest.user_role_id ? roleLabels.get(rest.user_role_id) ?? null : null,
      };
    });

    const withPlacement = await overlayPlacementFromApplications(
      supabaseAdmin,
      withRoleLabels,
    );

    const missingGradeIds = [
      ...new Set(
        withPlacement
          .filter((u) => u.grade_level_id && !u.grade_level)
          .map((u) => u.grade_level_id as string),
      ),
    ];
    if (missingGradeIds.length > 0) {
      const { data: grades } = await supabaseAdmin
        .from("grade_levels")
        .select("id, code")
        .in("id", missingGradeIds);
      const codeById = new Map(
        (grades ?? []).map((g) => [g.id as string, g.code as string | null]),
      );
      for (const u of withPlacement) {
        if (!u.grade_level && u.grade_level_id) {
          u.grade_level = codeById.get(u.grade_level_id) ?? u.grade_level;
        }
      }
    }

    return NextResponse.json(withPlacement);
  } catch (err) {
    return NextResponse.json([], { status: 500 });
  }
}
