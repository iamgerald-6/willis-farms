import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import { validateMedicalExamToken } from "@/lib/medical/medicalExamTokens";
import {
  labReportExtractToolSchema,
  mergeExtractedLabResults,
} from "@/lib/medical/medicalLabExtract";
import type { InvestigationsData } from "@/lib/medical/medicalInvestigationDefs";
import { emptyInvestigationsData } from "@/lib/medical/medicalInvestigationDefs";
import { getInvestigationDefs } from "@/lib/medical/medicalFormSchema";
import type { MedicalExamination } from "@/lib/medical/medicalFormSchema";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

function imageMediaType(fileName: string, contentType: string | null): string | null {
  if (contentType && Object.values(IMAGE_MEDIA_TYPES).includes(contentType)) return contentType;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return IMAGE_MEDIA_TYPES[ext] ?? null;
}

function isPdfFile(fileName: string, contentType: string | null): boolean {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return contentType === "application/pdf" || ext === "pdf";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Report reading is not configured." }, { status: 500 });
  }

  const validation = await validateMedicalExamToken(supabaseAdmin, token);
  if (!validation.ok) {
    return NextResponse.json({ error: "This link is no longer valid." }, { status: 410 });
  }

  const { data: exam } = await supabaseAdmin
    .from("medical_examinations")
    .select("form_schema")
    .eq("id", validation.examinationId)
    .maybeSingle();

  if (!exam) {
    return NextResponse.json({ error: "Examination not found." }, { status: 404 });
  }

  const defs = getInvestigationDefs((exam as Pick<MedicalExamination, "form_schema">).form_schema);

  const body = (await req.json()) as {
    file_url?: string;
    file_name?: string;
    current_investigations?: InvestigationsData;
  };

  const fileUrl = body.file_url?.trim();
  const fileName = body.file_name?.trim() || "lab-report.pdf";
  if (!fileUrl) {
    return NextResponse.json({ error: "file_url is required." }, { status: 400 });
  }

  const current: InvestigationsData = {
    ...emptyInvestigationsData(),
    ...(body.current_investigations ?? {}),
    tests: { ...(body.current_investigations?.tests ?? {}) },
    lab_reports: body.current_investigations?.lab_reports ?? [],
  };

  try {
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return NextResponse.json({ error: "Could not download the uploaded file." }, { status: 400 });
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const contentType = fileRes.headers.get("content-type");

    const tool = labReportExtractToolSchema(defs);
    const contentBlocks: any[] = [];

    if (isPdfFile(fileName, contentType)) {
      contentBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      });
    } else {
      const mediaType = imageMediaType(fileName, contentType);
      if (!mediaType) {
        return NextResponse.json({ error: "Upload a PDF or image (JPEG/PNG)." }, { status: 400 });
      }
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as "image/jpeg" | "image/png",
          data: buffer.toString("base64"),
        },
      });
    }

    contentBlocks.push({
      type: "text",
      text:
        "Extract laboratory investigation results from this report for a Wills Farms occupational medical examination. " +
        "Leave any field empty if not clearly stated. Do not guess.",
    });

    const response = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 2000,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: contentBlocks }],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    const raw =
      toolBlock && toolBlock.type === "tool_use"
        ? (toolBlock.input as Record<string, unknown>)
        : {};

    if (raw.is_lab_report === false) {
      return NextResponse.json({
        data: {
          investigations: current,
          prefilled_count: 0,
          warning: "This file does not appear to be a laboratory report.",
        },
      });
    }

    const { data: merged, prefilledCount } = mergeExtractedLabResults(current, raw, defs);

    return NextResponse.json({
      data: {
        investigations: merged,
        prefilled_count: prefilledCount,
      },
    });
  } catch (err) {
    console.error("[POST /api/medical/extract-lab-report]", err);
    return NextResponse.json({ error: "Could not read the laboratory report." }, { status: 500 });
  }
}
