import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Site/Business unit/Department/Section/Position/Grade level to copy onto a
 * new employee record (see users-org-placement.sql).
 *
 * Two sources, never mixed:
 *   1. Direct invite (no application_id) — the IDs picked on the invite form.
 *   2. Onboarding hire (has application_id) — the job posting linked to
 *      that application (users.application_id → job_applications →
 *      job_postings).
 */
export type EmployeeOrgPlacement = {
  site_id: string | null;
  business_unit_id: string | null;
  department_id: string | null;
  section_id: string | null;
  position_id: string | null;
  grade_level_id: string | null;
  /** Copied from the posting’s role column (job_postings.supervisory_role_id
   * or the User role list’s job_posting_column). Same UUID as users.user_role_id. */
  user_role_id: string | null;
};

export const EMPTY_PLACEMENT: EmployeeOrgPlacement = {
  site_id: null,
  business_unit_id: null,
  department_id: null,
  section_id: null,
  position_id: null,
  grade_level_id: null,
  user_role_id: null,
};

const POSTING_CORE_COLUMNS =
  "site_id, business_unit_id, department_id, section_id, position_id, grade_level_id";

/** Posting column that holds the User / Supervisory role picked on Create job posting. */
const POSTING_ROLE_COLUMN_CANDIDATES = [
  "supervisory_role_id",
  "user_role_id",
] as const;

function listNameLooksLikeUserRole(label: string | null | undefined): boolean {
  const name = (label ?? "").trim().toLowerCase();
  return (
    name === "user role" ||
    name === "supervisory role" ||
    name === "supervisory_role"
  );
}

async function resolvePostingUserRoleColumn(
  supabase: SupabaseClient,
): Promise<string> {
  const { data } = await supabase
    .from("org_custom_list_types")
    .select("job_posting_column, label, singular");

  const matched = (data ?? []).find((row) => {
    const column = (row.job_posting_column as string | null) ?? "";
    if (POSTING_ROLE_COLUMN_CANDIDATES.includes(column as (typeof POSTING_ROLE_COLUMN_CANDIDATES)[number])) {
      return true;
    }
    return (
      listNameLooksLikeUserRole(row.singular as string) ||
      listNameLooksLikeUserRole(row.label as string)
    );
  });

  const fromList = (matched?.job_posting_column as string | null)?.trim();
  return fromList || "supervisory_role_id";
}

function userRoleIdFromPostingRow(
  data: Record<string, unknown>,
  roleColumn: string,
): string | null {
  const fromNamed = data[roleColumn];
  const fromSupervisory = data.supervisory_role_id;
  const fromUserRole = data.user_role_id;
  const value =
    (typeof fromNamed === "string" && fromNamed) ||
    (typeof fromSupervisory === "string" && fromSupervisory) ||
    (typeof fromUserRole === "string" && fromUserRole) ||
    null;
  return value;
}

export function placementFromDirectInvite(
  input: Partial<EmployeeOrgPlacement> | null | undefined,
): EmployeeOrgPlacement {
  return {
    site_id: input?.site_id ?? null,
    business_unit_id: input?.business_unit_id ?? null,
    department_id: input?.department_id ?? null,
    section_id: input?.section_id ?? null,
    position_id: input?.position_id ?? null,
    grade_level_id: input?.grade_level_id ?? null,
    user_role_id: input?.user_role_id ?? null,
  };
}

export function isCoreOrgPlacementComplete(
  placement: EmployeeOrgPlacement,
): boolean {
  return !!(
    placement.site_id &&
    placement.business_unit_id &&
    placement.department_id &&
    placement.section_id &&
    placement.position_id &&
    placement.grade_level_id
  );
}

export function isCoreOrgPlacementEmpty(
  row: Partial<EmployeeOrgPlacement> | null | undefined,
): boolean {
  if (!row) return true;
  return (
    !row.site_id &&
    !row.business_unit_id &&
    !row.department_id &&
    !row.section_id &&
    !row.position_id &&
    !row.grade_level_id
  );
}

function rowToPlacement(
  data: Record<string, unknown> | null,
  roleColumn = "supervisory_role_id",
): EmployeeOrgPlacement {
  if (!data) return EMPTY_PLACEMENT;
  return {
    site_id: (data.site_id as string | null) ?? null,
    business_unit_id: (data.business_unit_id as string | null) ?? null,
    department_id: (data.department_id as string | null) ?? null,
    section_id: (data.section_id as string | null) ?? null,
    position_id: (data.position_id as string | null) ?? null,
    grade_level_id: (data.grade_level_id as string | null) ?? null,
    user_role_id: userRoleIdFromPostingRow(data, roleColumn),
  };
}

export async function resolveEmployeeOrgPlacementFromPosting(
  supabase: SupabaseClient,
  jobPostingId: string | null | undefined,
): Promise<EmployeeOrgPlacement> {
  if (!jobPostingId) return EMPTY_PLACEMENT;

  const roleColumn = await resolvePostingUserRoleColumn(supabase);

  const withRole = await supabase
    .from("job_postings")
    .select(`${POSTING_CORE_COLUMNS}, ${roleColumn}`)
    .eq("id", jobPostingId)
    .maybeSingle();

  if (!withRole.error) {
    return rowToPlacement(
      withRole.data as Record<string, unknown> | null,
      roleColumn,
    );
  }

  for (const fallback of POSTING_ROLE_COLUMN_CANDIDATES) {
    if (fallback === roleColumn) continue;
    const attempt = await supabase
      .from("job_postings")
      .select(`${POSTING_CORE_COLUMNS}, ${fallback}`)
      .eq("id", jobPostingId)
      .maybeSingle();
    if (!attempt.error) {
      return rowToPlacement(
        attempt.data as Record<string, unknown> | null,
        fallback,
      );
    }
  }

  const core = await supabase
    .from("job_postings")
    .select(POSTING_CORE_COLUMNS)
    .eq("id", jobPostingId)
    .maybeSingle();

  return rowToPlacement(core.data as Record<string, unknown> | null, roleColumn);
}

export async function resolveEmployeeOrgPlacementFromApplication(
  supabase: SupabaseClient,
  applicationId: string | null | undefined,
): Promise<EmployeeOrgPlacement> {
  if (!applicationId) return EMPTY_PLACEMENT;

  const { data: app } = await supabase
    .from("job_applications")
    .select("job_posting_id")
    .eq("id", applicationId)
    .maybeSingle();

  return resolveEmployeeOrgPlacementFromPosting(
    supabase,
    app?.job_posting_id ?? null,
  );
}

/**
 * Invite-time placement:
 *   application_id set  → onboarding hire, copy from the application’s posting
 *   otherwise           → direct invite, use the IDs picked on the form
 */
export async function resolveOrgPlacementForInvite(
  supabase: SupabaseClient,
  input: {
    application_id?: string | null;
  } & Partial<EmployeeOrgPlacement>,
): Promise<EmployeeOrgPlacement> {
  const applicationId = input.application_id?.trim() || null;
  if (applicationId) {
    return resolveEmployeeOrgPlacementFromApplication(supabase, applicationId);
  }
  return placementFromDirectInvite(input);
}

export function mergePlacementIfEmpty<T extends Partial<EmployeeOrgPlacement>>(
  row: T,
  fromPosting: EmployeeOrgPlacement,
): T {
  const coreEmpty = isCoreOrgPlacementEmpty(row);
  if (!coreEmpty && row.user_role_id) return row;
  return {
    ...row,
    ...(coreEmpty
      ? {
          site_id: row.site_id ?? fromPosting.site_id,
          business_unit_id: row.business_unit_id ?? fromPosting.business_unit_id,
          department_id: row.department_id ?? fromPosting.department_id,
          section_id: row.section_id ?? fromPosting.section_id,
          position_id: row.position_id ?? fromPosting.position_id,
          grade_level_id: row.grade_level_id ?? fromPosting.grade_level_id,
        }
      : {}),
    user_role_id: row.user_role_id ?? fromPosting.user_role_id,
  };
}

function needsPostingOverlay(
  row: Partial<EmployeeOrgPlacement> & { application_id?: string | null },
): boolean {
  if (!row.application_id) return false;
  return isCoreOrgPlacementEmpty(row) || !row.user_role_id;
}

/** Overlay posting placement onto user rows that have application_id but empty org fields. */
export async function overlayPlacementFromApplications<
  T extends Partial<EmployeeOrgPlacement> & { application_id?: string | null },
>(
  supabase: SupabaseClient,
  users: T[],
): Promise<T[]> {
  const needs = users.filter((u) => needsPostingOverlay(u));
  if (needs.length === 0) return users;

  const appIds = [
    ...new Set(needs.map((u) => u.application_id!).filter(Boolean)),
  ];
  const { data: apps } = await supabase
    .from("job_applications")
    .select("id, job_posting_id")
    .in("id", appIds);

  const postingIds = [
    ...new Set(
      (apps ?? [])
        .map((a) => a.job_posting_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];
  if (postingIds.length === 0) return users;

  const postingById = new Map<string, EmployeeOrgPlacement>();
  await Promise.all(
    postingIds.map(async (id) => {
      postingById.set(
        id,
        await resolveEmployeeOrgPlacementFromPosting(supabase, id),
      );
    }),
  );

  const postingIdByApp = new Map(
    (apps ?? []).map((a) => [a.id as string, a.job_posting_id as string | null]),
  );

  const persist: Promise<unknown>[] = [];
  const next = users.map((u) => {
    if (!needsPostingOverlay(u)) return u;
    const postingId = postingIdByApp.get(u.application_id!);
    const fromPosting = postingId ? postingById.get(postingId) : undefined;
    if (!fromPosting) return u;
    const merged = mergePlacementIfEmpty(u, fromPosting);
    const userId = (u as { user_id?: string }).user_id;
    const changed =
      (isCoreOrgPlacementEmpty(u) && !isCoreOrgPlacementEmpty(merged)) ||
      (!u.user_role_id && !!merged.user_role_id);
    if (userId && changed) {
      persist.push(
        supabase
          .from("users")
          .update({
            site_id: merged.site_id,
            business_unit_id: merged.business_unit_id,
            department_id: merged.department_id,
            section_id: merged.section_id,
            position_id: merged.position_id,
            grade_level_id: merged.grade_level_id,
            user_role_id: merged.user_role_id,
          })
          .eq("user_id", userId),
      );
    }
    return merged;
  });
  if (persist.length > 0) await Promise.all(persist);
  return next;
}
