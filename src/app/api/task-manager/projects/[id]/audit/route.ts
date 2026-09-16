import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, getRequestUser } from "@/lib/taskManagerAuth";
import { isSeniorManagement } from "@/lib/taskAccessControl";
import { isProjectSiteVisible } from "@/lib/taskManagerScope";

// GET /api/task-manager/projects/[id]/audit — who changed the project, and
// when. Mirrors tasks/[id]/audit/route.ts. Senior Management only.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getRequestUser(req);
  if (!user || !isSeniorManagement(user.role)) {
    return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });
  }

  // Being Senior Management doesn't mean any site — same rule as
  // everywhere else.
  const { data: project } = await supabaseAdmin
    .from("tm_projects")
    .select("site_id, created_by")
    .eq("id", id)
    .maybeSingle();
  if (project && !isProjectSiteVisible(user, project)) {
    return NextResponse.json(
      { error: "Forbidden — this project isn't at a site you have access to." },
      { status: 403 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("tm_project_audit_log")
    .select("*")
    .eq("project_id", id)
    .order("performed_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data ?? [] });
}
