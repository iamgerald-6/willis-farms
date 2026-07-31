import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";
import { writeAuditLog, enrichTasks, fetchUserNames } from "@/lib/taskManagerData";
import type { ExtractedTaskProposal } from "@/types/taskManager";

// POST /api/task-manager/extract/[jobId]/save — Senior Management only.
// Saves the (possibly edited, possibly trimmed) list of reviewed proposals
// as real tasks, tagged source = 'ai_extracted' and linked back to the
// source document.
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    const { tasks }: { tasks: ExtractedTaskProposal[] } = await req.json();
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json({ error: "No tasks to save" }, { status: 400 });
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("tm_extraction_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (jobError || !job) return NextResponse.json({ error: "Extraction job not found" }, { status: 404 });

    const rowsToInsert = tasks.map((t) => ({
      project_id: job.project_id,
      title: t.title.trim(),
      description: t.description ?? null,
      owner_id: t.owner_id ?? null,
      due_date: t.due_date ?? null,
      is_recurring: !!t.is_recurring,
      task_type: t.is_recurring ? "monitoring" : "obligation",
      frequency: t.frequency ?? null,
      indicator: t.indicator ?? null,
      method_provider: t.method_provider ?? null,
      source: "ai_extracted",
      source_document_url: job.file_url,
      source_document_name: job.file_name,
      created_by: user.id,
    }));

    const { data: created, error } = await supabaseAdmin.from("tm_tasks").insert(rowsToInsert).select();
    if (error) throw error;

    await Promise.all(
      (created ?? []).map((task) =>
        writeAuditLog({
          task_id: task.id,
          project_id: task.project_id,
          action: "created",
          new_values: { title: task.title, due_date: task.due_date, source: "ai_extracted" },
          performedBy: user,
        }),
      ),
    );

    const userNames = await fetchUserNames((created ?? []).map((t) => t.owner_id));
    return NextResponse.json({ tasks: enrichTasks(created ?? [], userNames) });
  } catch (err: any) {
    console.error("[POST /api/task-manager/extract/[jobId]/save]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
