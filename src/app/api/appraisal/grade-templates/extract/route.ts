import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { requireSystemDefinitionsAccess } from "@/lib/apiRequestAuth";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";

/**
 * Reads an uploaded document (job description, SOP, old appraisal form,
 * etc.) and extracts rating sections + line items for an Appraisal grade
 * template — same upload → server-side extraction → Anthropic tool-use
 * pattern as /api/careers/interview-setup/extract.
 */
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

function isWordDoc(fileName: string, contentType: string | null): boolean {
  const name = fileName.toLowerCase();
  return (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    !!contentType?.includes("wordprocessingml") ||
    !!contentType?.includes("msword")
  );
}

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function imageMediaType(fileName: string, contentType: string | null): string | null {
  if (contentType && Object.values(IMAGE_MEDIA_TYPES).includes(contentType)) return contentType;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return IMAGE_MEDIA_TYPES[ext] ?? null;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_TOOL = {
  name: "record_extracted_appraisal_sections",
  description:
    "Records performance-appraisal rating sections and line items extracted from an uploaded document (job description, SOP, old appraisal form, etc.), structured to match Wills Farms' appraisal grade templates.",
  input_schema: {
    type: "object" as const,
    properties: {
      sections: {
        type: "array",
        description:
          "The rating sections this role/grade should be appraised on. Group related responsibilities under one section (e.g. 'Biosecurity Compliance', 'Team Leadership'). Aim for 3-7 sections.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Short section title, e.g. \"Operational Control and Work Planning\".",
            },
            items: {
              type: "array",
              description:
                "The specific rating line items under this section — concrete, observable behaviours or outcomes a supervisor can score 1-5 on. Derive these from the document's responsibilities/duties/KPIs, don't just copy job-description bullet points verbatim if they're not gradeable.",
              items: { type: "string" },
            },
          },
          required: ["title", "items"],
        },
      },
    },
    required: ["sections"],
  },
};

const INSTRUCTIONS =
  "This document describes a role, its responsibilities, or an existing appraisal/review form at Wills Farms, a farm operation in Ghana. Read it and extract performance-appraisal rating sections and line items into the fields defined by the record_extracted_appraisal_sections tool. Each line item must be something a supervisor can realistically observe and score 1-5 on — turn vague duties into concrete, gradeable behaviours. Don't invent content that isn't grounded in the document.";

export async function POST(req: NextRequest) {
  try {
    const user = await requireSystemDefinitionsAccess(req, "add");
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured on the server" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as { file_url?: string; file_name?: string };
    const fileUrl = body.file_url;
    if (!fileUrl) {
      return NextResponse.json({ error: "file_url is required" }, { status: 400 });
    }
    const fileName = body.file_name || decodeURIComponent(fileUrl.split("/").pop() ?? "document");

    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Could not download "${fileName}" (HTTP ${fileRes.status})` },
        { status: 502 },
      );
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const contentType = fileRes.headers.get("content-type");

    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `"${fileName}" is ${(buffer.byteLength / (1024 * 1024)).toFixed(1)}MB, which is too large to read reliably. Try a smaller file.`,
        },
        { status: 400 },
      );
    }

    const wordDoc = isWordDoc(fileName, contentType);
    const imgMediaType = imageMediaType(fileName, contentType);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: any[] = [{ type: "text", text: INSTRUCTIONS }];

    if (wordDoc) {
      const { value: text } = await mammoth.extractRawText({ buffer });
      if (!text.trim()) {
        return NextResponse.json({ error: `Couldn't read any text out of "${fileName}".` }, { status: 422 });
      }
      content.push({ type: "text", text });
    } else if (imgMediaType) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: imgMediaType, data: buffer.toString("base64") },
      });
    } else {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      });
    }

    const message = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 8192,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "record_extracted_appraisal_sections" },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const extracted = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};

    const rawSections = Array.isArray(extracted.sections) ? extracted.sections : [];
    const cleanSections = rawSections
      .filter(
        (s): s is { title: string; items?: unknown[] } =>
          !!s && typeof s === "object" && typeof (s as { title?: unknown }).title === "string",
      )
      .map((s, i) => {
        const items = (Array.isArray(s.items) ? s.items : [])
          .filter((item): item is string => typeof item === "string" && !!item.trim())
          .map((item) => item.trim());
        const key = i < 26 ? String.fromCharCode(65 + i) : `S${i + 1}`;
        return { key, title: s.title.trim(), items: items.length ? items : ["New rating item"] };
      });

    if (cleanSections.length === 0) {
      return NextResponse.json(
        { error: "Couldn't find any appraisal sections in that document." },
        { status: 422 },
      );
    }

    const weight = 1 / cleanSections.length;
    const sections = cleanSections.map((s) => ({ ...s, weight }));

    return NextResponse.json({ data: { sections } });
  } catch (err: unknown) {
    console.error("[POST /api/appraisal/grade-templates/extract]", err);
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
