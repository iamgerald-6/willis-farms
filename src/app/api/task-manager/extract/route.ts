import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";
import type { ExtractedTaskProposal } from "@/types/taskManager";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_TOOL = {
  name: "record_extracted_tasks",
  description:
    "Records the compliance obligations, deadlines, and recurring checks found in the document as a structured task list.",
  input_schema: {
    type: "object" as const,
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short, actionable task name" },
            description: { type: "string", description: "Relevant detail/context copied or summarized from the document" },
            due_date: { type: "string", description: "ISO date YYYY-MM-DD if a specific deadline is stated in the document, otherwise omit this field" },
            is_recurring: { type: "boolean", description: "True if this is a recurring obligation (e.g. quarterly monitoring), false for a one-off deadline" },
            frequency: { type: "string", description: "e.g. Quarterly, Monthly, Annual — only when is_recurring is true" },
            indicator: { type: "string", description: "What is being measured or monitored, if this is a monitoring requirement" },
            method_provider: { type: "string", description: "How or by whom it's checked (e.g. 'Accredited lab', 'In-house test kit'), if stated" },
          },
          required: ["title"],
        },
      },
    },
    required: ["tasks"],
  },
};

// POST /api/task-manager/extract — Senior Management only.
// Sends an already-uploaded document (Cloudinary URL) directly to Claude —
// no separate PDF-parsing library needed, the Messages API reads PDFs
// natively. Returns proposed tasks for review; nothing is saved as a real
// task until /extract/[jobId]/save is called.
export async function POST(req: NextRequest) {
  let jobId: string | null = null;
  try {
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured on the server" }, { status: 500 });
    }

    const { project_id, file_url, file_name } = await req.json();
    if (!project_id || !file_url) {
      return NextResponse.json({ error: "project_id and file_url are required" }, { status: 400 });
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("tm_extraction_jobs")
      .insert([{ project_id, file_name: file_name ?? "document.pdf", file_url, status: "pending", created_by: user.id }])
      .select()
      .single();
    if (jobError) throw jobError;
    jobId = job.id;

    const fileRes = await fetch(file_url);
    if (!fileRes.ok) throw new Error(`Could not download the document (HTTP ${fileRes.status})`);
    const arrayBuffer = await fileRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const message = await anthropic.messages.create({
      // Swap this for whatever's current on console.anthropic.com/models if
      // this string ever stops resolving.
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "record_extracted_tasks" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            } as any,
            {
              type: "text",
              text: "This is a compliance document (e.g. a permit, licence, or regulatory notice) for a farm operation. Read it and extract every distinct obligation, deadline, renewal date, and recurring monitoring/reporting requirement as a task. Use clear, specific task titles a manager could act on directly, and use the units/dates exactly as stated in the document.",
            },
          ],
        },
      ],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const proposals: ExtractedTaskProposal[] = (toolUse as any)?.input?.tasks ?? [];

    if (proposals.length === 0) {
      await supabaseAdmin
        .from("tm_extraction_jobs")
        .update({ status: "failed", error_message: "No tasks could be identified in this document." })
        .eq("id", job.id);
      return NextResponse.json({ error: "No tasks could be identified in this document." }, { status: 422 });
    }

    await supabaseAdmin.from("tm_extraction_jobs").update({ status: "completed", extracted_tasks: proposals }).eq("id", job.id);

    return NextResponse.json({ job: { ...job, status: "completed", extracted_tasks: proposals } });
  } catch (err: any) {
    console.error("[POST /api/task-manager/extract]", err);
    if (jobId) {
      await supabaseAdmin
        .from("tm_extraction_jobs")
        .update({ status: "failed", error_message: err.message ?? "Extraction failed" })
        .eq("id", jobId);
    }
    return NextResponse.json({ error: err.message ?? "Extraction failed" }, { status: 500 });
  }
}
