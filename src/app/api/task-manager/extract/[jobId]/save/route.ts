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

    // A job can now cover several files read together (see extract/route.ts)
    // — `files` is the source of truth, falling back to the legacy single
    // file_url/file_name columns for any job created before that existed.
    // Per task, source_document_* points at whichever single file it was
    // attributed to (source_file_name, set by Claude — see EXTRACTION_TOOL),
    // or falls back to every file name joined together when a task drew on
    // more than one document.
    const jobFiles: { file_name: string; file_url: string }[] =
      Array.isArray(job.files) && job.files.length > 0 ? job.files : job.file_url ? [{ file_name: job.file_name ?? "document", file_url: job.file_url }] : [];
    const joinedFileNames = jobFiles.map((f) => f.file_name).join(" + ") || null;
    const findFile = (name?: string | null) => (name ? jobFiles.find((f) => f.file_name?.toLowerCase() === name.toLowerCase()) : undefined);

    // A single document (e.g. an EPA permit) routinely mixes one-off
    // obligations ("submit annual report by March 31") with recurring
    // monitoring/testing requirements ("test effluent quarterly") — the
    // "From Document" button only lives on the Obligation Register tab
    // (see TaskListView.tsx), but the tasks it produces still need to land
    // on whichever tab actually fits each one, or every monitoring-style
    // requirement in the document silently disappears from the Monitoring
    // Schedule tab. is_recurring alone can't tell them apart any more —
    // Obligation Register tasks can also be recurring now (e.g. an annual
    // licence renewal) — so classification instead follows indicator/
    // method_provider, which the extraction tool only fills in for genuine
    // monitoring requirements (see EXTRACTION_TOOL in extract/route.ts).
    // Those two fields are kept for monitoring tasks, where they're
    // meaningful, and nulled out for everything else — Claude sometimes
    // writes a person's name into method_provider despite being told not
    // to, and this is the backstop that keeps that from ever being saved
    // on a plain obligation.
    const rowsToInsert = tasks.map((t) => {
      const isMonitoring = !!(t.indicator || t.method_provider);
      const matchedFile = findFile(t.source_file_name);
      return {
        project_id: job.project_id,
        title: t.title.trim(),
        description: t.description ?? null,
        owner_id: t.owner_id ?? null,
        start_date: t.start_date ?? null,
        due_date: t.due_date ?? null,
        is_recurring: !!t.is_recurring,
        task_type: isMonitoring ? "monitoring" : "obligation",
        frequency: t.frequency ?? null,
        indicator: isMonitoring ? (t.indicator ?? null) : null,
        method_provider: isMonitoring ? (t.method_provider ?? null) : null,
        source: "ai_extracted",
        source_document_url: matchedFile?.file_url ?? jobFiles[0]?.file_url ?? null,
        source_document_name: matchedFile?.file_name ?? joinedFileNames,
        created_by: user.id,
      };
    });

    const { data: created, error } = await supabaseAdmin.from("tm_tasks").insert(rowsToInsert).select();
    if (error) throw error;

    await Promise.all(
      (created ?? []).map((task) =>
        writeAuditLog({
          task_id: task.id,
          project_id: task.project_id,
          action: "created",
          // source_document_name rides along here so the History drawer can
          // show which document a task came from, not just that it was
          // AI-extracted (see AuditLogDrawer.tsx) — task.source_document_name
          // is already set above from the matched/joined file name(s).
          new_values: { title: task.title, due_date: task.due_date, source: "ai_extracted", source_document_name: task.source_document_name },
          performedBy: user,
        }),
      ),
    );

    // Subtasks are never proposed or saved as part of this flow anymore —
    // Claude no longer suggests a breakdown (see EXTRACTION_TOOL in
    // extract/route.ts), and a reviewer adds them the normal way, after the
    // fact, via the Subtasks panel on the saved task (same one used for any
    // manually-created task) — not in this pre-save review window.
    const userNames = await fetchUserNames((created ?? []).map((t) => t.owner_id));
    return NextResponse.json({ tasks: enrichTasks(created ?? [], userNames) });
  } catch (err: any) {
    console.error("[POST /api/task-manager/extract/[jobId]/save]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
