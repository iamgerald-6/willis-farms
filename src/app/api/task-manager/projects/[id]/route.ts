import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireSeniorManagement } from "@/lib/taskManagerAuth";

// PATCH /api/task-manager/projects/[id] — Senior Management only.
// Archives or restores a project. Archiving never touches the tasks inside
// it — they're just no longer reachable from the active project pills,
// same as the project itself. Fully reversible.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    const { status } = await req.json();
    if (status !== "active" && status !== "archived") {
      return NextResponse.json({ error: "status must be 'active' or 'archived'" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from("tm_projects").update({ status }).eq("id", id).select().single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    return NextResponse.json({ project: data });
  } catch (err: any) {
    console.error("[PATCH /api/task-manager/projects/[id]]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}

// DELETE /api/task-manager/projects/[id] — Senior Management only.
// Permanently removes the project AND everything under it — tasks, audit
// log entries, extraction jobs, and recurring-task completion history all
// cascade-delete at the database level (see the `on delete cascade` foreign
// keys in docs/task-manager/schema.sql and recurrence.sql). There is no
// undo. The client is expected to make the user type the project's exact
// name to confirm (see ManageProjectsModal.tsx) — this route re-checks that
// same name server-side rather than trusting the client did.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    const { confirm_name } = await req.json();

    const { data: project, error: fetchError } = await supabaseAdmin.from("tm_projects").select("id, name").eq("id", id).single();
    if (fetchError || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    if (typeof confirm_name !== "string" || confirm_name.trim() !== project.name) {
      return NextResponse.json({ error: "Confirmation text didn't match the project name — nothing was deleted." }, { status: 400 });
    }

    const { error: deleteError } = await supabaseAdmin.from("tm_projects").delete().eq("id", id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    console.error("[DELETE /api/task-manager/projects/[id]]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
