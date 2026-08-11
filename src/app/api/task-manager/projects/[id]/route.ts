import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, requireSeniorManagement } from "@/lib/taskManagerAuth";
import { writeProjectAuditLog } from "@/lib/taskManagerData";

// PATCH /api/task-manager/projects/[id] — Senior Management only.
// Archives/restores a project (status), and/or renames it (name,
// description) — either can be sent alone or together. Archiving never
// touches the tasks inside it — they're just no longer reachable from the
// active project list, same as the project itself. Both are fully
// reversible; renaming just overwrites the name/description columns, the
// project's id (and everything linked to it) is untouched.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    // Fetched up front so the audit log below can record what actually
    // changed (previous vs. new name/description/status), not just what the
    // client asked to update.
    const { data: existing, error: existingError } = await supabaseAdmin.from("tm_projects").select("*").eq("id", id).single();
    if (existingError || !existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const body = await req.json();
    const update: Record<string, unknown> = {};

    if ("status" in body) {
      if (body.status !== "active" && body.status !== "archived") {
        return NextResponse.json({ error: "status must be 'active' or 'archived'" }, { status: 400 });
      }
      update.status = body.status;
    }

    if ("name" in body) {
      const trimmedName = typeof body.name === "string" ? body.name.trim() : "";
      if (!trimmedName) return NextResponse.json({ error: "Project name is required" }, { status: 400 });

      // Same guardrail as creation — no two projects share a name,
      // case-insensitively, excluding this project itself.
      const { data: dupe, error: dupeError } = await supabaseAdmin
        .from("tm_projects")
        .select("id")
        .ilike("name", trimmedName)
        .neq("id", id)
        .limit(1);
      if (dupeError) throw dupeError;
      if (dupe && dupe.length > 0) {
        return NextResponse.json({ error: `A project named "${trimmedName}" already exists.` }, { status: 409 });
      }

      update.name = trimmedName;
    }

    if ("description" in body) {
      update.description = typeof body.description === "string" ? body.description.trim() || null : null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.from("tm_projects").update(update).eq("id", id).select().single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    // A status change and a rename can't both happen in one request from
    // this UI (EditProjectForm and the archive/restore button are separate
    // actions), but this stays correct either way — one audit row per kind
    // of change that actually occurred, not one row per request.
    if ("status" in update && update.status !== existing.status) {
      await writeProjectAuditLog({
        project_id: id,
        action: update.status === "archived" ? "archived" : "restored",
        performedBy: user,
      });
    }
    const renamedFields = ["name", "description"].filter((f) => f in update && update[f] !== existing[f]);
    if (renamedFields.length > 0) {
      await writeProjectAuditLog({
        project_id: id,
        action: "renamed",
        changed_fields: renamedFields,
        previous_values: Object.fromEntries(renamedFields.map((f) => [f, existing[f]])),
        new_values: Object.fromEntries(renamedFields.map((f) => [f, update[f]])),
        performedBy: user,
      });
    }

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

    // Written BEFORE the cascade delete below, and deliberately not a FK to
    // tm_projects (see tm_project_deletions in schema.sql) — this is the one
    // record of the deletion that survives it. Deletion itself stays
    // instant and permanent; this is a tombstone, not an undo mechanism.
    const { error: tombstoneError } = await supabaseAdmin.from("tm_project_deletions").insert([
      {
        project_id: project.id,
        project_name: project.name,
        deleted_by: user.id,
        deleted_by_name: user.name,
        deleted_at: new Date().toISOString(),
      },
    ]);
    if (tombstoneError) throw tombstoneError;

    const { error: deleteError } = await supabaseAdmin.from("tm_projects").delete().eq("id", id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    console.error("[DELETE /api/task-manager/projects/[id]]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
