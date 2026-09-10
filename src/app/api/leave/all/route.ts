import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsonForbidden } from "@/lib/apiRequestAuth";
import {
  canApproveLeaveSignoffStage,
  canApproveLeaveSupervisorStage,
  getLeaveAuthContext,
  loadDirectReportUserIds,
} from "@/lib/leaveAccess";
import { resolveUserRoleLabelById } from "@/lib/userRoleAccessControl";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const LEAVE_SELECT = `
  *,
  users!leave_requests_user_id_fkey (
    email,
    first_name,
    last_name,
    role,
    user_role_id,
    supervisor_id
  )
`;

async function enrichLeaveRows(
  data: Array<{
    reviewed_by?: string | null;
    supervisor_reviewed_by?: string | null;
    stage?: string | null;
    user_id: string;
    users?: { supervisor_id?: string | null; user_role_id?: string | null } | null;
    [key: string]: unknown;
  }> | null,
  caller: { id: string; role: string | null },
) {
  const reviewerIds = [
    ...new Set(
      (data ?? [])
        .flatMap((r) => [r.reviewed_by, r.supervisor_reviewed_by])
        .filter((id): id is string => !!id),
    ),
  ];

  let reviewerNameById: Record<string, string> = {};
  if (reviewerIds.length > 0) {
    const { data: reviewers } = await supabaseAdmin
      .from("users")
      .select("user_id, first_name, last_name")
      .in("user_id", reviewerIds);
    reviewerNameById = Object.fromEntries(
      (reviewers ?? []).map((u) => [
        u.user_id,
        `${u.first_name} ${u.last_name}`.trim(),
      ]),
    );
  }

  return Promise.all(
    (data ?? []).map(async (r) => {
      const stage = r.stage ?? "pending_supervisor";
      let canAct = false;
      if (r.user_id !== caller.id) {
        if (stage === "pending_supervisor") {
          canAct = canApproveLeaveSupervisorStage(
            caller.id,
            r.user_id,
            r.users?.supervisor_id,
            caller.role,
          );
        } else if (stage === "pending_signoff") {
          const applicantRoleLabel = await resolveUserRoleLabelById(
            supabaseAdmin,
            r.users?.user_role_id,
          );
          canAct = canApproveLeaveSignoffStage(
            caller.id,
            r.user_id,
            applicantRoleLabel,
            caller.role,
          );
        }
      }

      return {
        ...r,
        reviewed_by_name: r.reviewed_by
          ? reviewerNameById[r.reviewed_by] ?? "Unknown"
          : null,
        supervisor_reviewed_by_name: r.supervisor_reviewed_by
          ? reviewerNameById[r.supervisor_reviewed_by] ?? "Unknown"
          : null,
        can_act: canAct,
      };
    }),
  );
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getLeaveAuthContext(req);
    if (!ctx) {
      return jsonForbidden(
        "Forbidden — leave review access, or being an assigned supervisor, is required.",
      );
    }

    let query = supabaseAdmin
      .from("leave_requests")
      .select(LEAVE_SELECT)
      .order("created_at", { ascending: false });

    if (ctx.scope === "reports") {
      const reportIds = await loadDirectReportUserIds(
        supabaseAdmin,
        ctx.user.id,
      );
      if (reportIds.length === 0) {
        return NextResponse.json({ data: [] });
      }
      query = query.in("user_id", reportIds);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const enriched = await enrichLeaveRows(data, {
      id: ctx.user.id,
      role: ctx.user.role,
    });
    return NextResponse.json({ data: enriched });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
