import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { requireAppraisalGradeTemplateAccess } from "@/lib/apiRequestAuth";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import { normalizePipFormSchema, PIP_SYSTEM_FIELD_SOURCES } from "@/lib/appraisal/pipFormSchema";

const SYSTEM_SOURCE_KEYS = PIP_SYSTEM_FIELD_SOURCES.map((s) => s.key);
const SYSTEM_SOURCE_GUIDE = PIP_SYSTEM_FIELD_SOURCES.map((s) => `"${s.key}" (${s.label})`).join(", ");

/**
 * Reads an HR-uploaded PIP document (e.g. "PIP Form/Wills Farms
 * Performance Improvement Plan_15 Sep 2026.docx") and extracts its section
 * / field structure into a PipFormSchema draft — same upload → server-side
 * extraction → Anthropic tool-use pattern as
 * /api/appraisal/grade-templates/extract and
 * /api/careers/interview-setup/extract. The draft is returned for HR to
 * preview; nothing is saved here (see POST /api/appraisal/pip-templates
 * for that).
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
  name: "record_extracted_pip_form",
  description:
    "Records the section/field structure of a Performance Improvement Plan (PIP) document extracted from an uploaded file, structured for rendering as a dynamic HR form at Wills Farms.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "The document's title, e.g. \"Performance Improvement Plan (PIP)\".",
      },
      intro: {
        type: "string",
        description:
          "Any introductory/purpose/scope paragraph shown before the numbered sections (e.g. explaining the PIP is developmental, not disciplinary, and what's excluded). Omit if none exists.",
      },
      sections: {
        type: "array",
        description:
          "Every numbered section of the document, in document order. Each is either a 'fields' section (a fixed set of single-value fields, e.g. employee details) or a 'table' section (a repeating table the person filling out the PIP adds rows to, e.g. a weekly coaching log or a list of objectives).",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Section title, keep the document's own numbering, e.g. \"2. Performance Gaps\".",
            },
            helpText: {
              type: "string",
              description: "Any explanatory note/example text under the section heading. Omit if none.",
            },
            kind: {
              type: "string",
              enum: ["fields", "table"],
              description:
                "'fields' for a fixed set of labeled inputs; 'table' for a repeating table with column headers.",
            },
            fields: {
              type: "array",
              description: "Only for kind='fields'. The labeled inputs in this section, in order.",
              items: {
                type: "object",
                properties: {
                  label: {
                    type: "string",
                    description:
                      "Required unless type='system'. For type='system', either omit this or repeat the tracked field's own name from the document — it isn't used, the display label always comes from the fixed catalog.",
                  },
                  type: {
                    type: "string",
                    enum: ["text", "textarea", "date", "select", "signature", "number", "system"],
                    description:
                      "'system' for a field that is really tracked employee/appraisal data (see systemSource) rather than something HR types in — these render locked/read-only, never as a plain input. 'textarea' for longer free text (comments, evidence, outcome summary), 'date' for date fields, 'select' for a fixed set of choices (e.g. PIP duration 30/60/90 days, or outcome checkboxes), 'signature' for signature/acknowledgment lines, 'text' otherwise.",
                  },
                  systemSource: {
                    type: "string",
                    enum: SYSTEM_SOURCE_KEYS,
                    description: `Required when type='system'. Which tracked source this field maps to: ${SYSTEM_SOURCE_GUIDE}.`,
                  },
                  options: {
                    type: "array",
                    items: { type: "string" },
                    description: "Only for type='select' — the fixed choices, e.g. [\"30\", \"60\", \"90\"].",
                  },
                },
                required: ["type"],
              },
            },
            columns: {
              type: "array",
              description: "Only for kind='table'. The column headers of the repeating table, in order.",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  type: {
                    type: "string",
                    enum: ["text", "textarea", "date", "select", "signature", "number"],
                  },
                },
                required: ["label"],
              },
            },
            minRows: {
              type: "number",
              description:
                "Only for kind='table'. How many blank rows a fresh PIP should start with for this table (e.g. the document shows 4 numbered objective rows, or 8 weekly log rows). Default to what the document actually shows.",
            },
            audience: {
              type: "string",
              enum: ["all", "supervisor", "hr"],
              description:
                "Who fills this section on a live PIP. Use 'hr' for sections marked HR-use-only / HR review / confidential HR fields in the document — supervisors must not see those. Use 'supervisor' for coaching logs and supervisor-owned content. Default 'all' for employee details and shared acknowledgments.",
            },
          },
          required: ["title", "kind"],
        },
      },
    },
    required: ["title", "sections"],
  },
};

const INSTRUCTIONS =
  `This document is a Performance Improvement Plan (PIP) form/template used at Wills Farms, a farm operation in Ghana. Read it and extract its full section structure into the fields defined by the record_extracted_pip_form tool, preserving the document's own section numbering, titles, and field/column labels as closely as possible. Distinguish sections that are a fixed set of one-off fields (kind='fields') from sections that are repeating tables the person filling the form adds rows to (kind='table') — e.g. 'Employee & Plan Details' is fields, 'Weekly Coaching Log' or a list of numbered objectives is a table. Don't invent content that isn't grounded in the document, and don't skip sections near the end (signatures, HR-use-only fields) even if they look purely administrative. Set audience='hr' on any section the document labels as HR-use-only, HR review, or confidential to HR; supervisors filling the live PIP must not see those sections.\n\nImportant — identity/placement fields are locked, not typed by HR: any field whose value is really the employee's own tracked record (their name, employee ID, position/job title, department/unit & farm site, direct supervisor, the HR facilitator running the PIP, or the appraisal period/rating that triggered this PIP) must be emitted as type='system' with the matching systemSource (${SYSTEM_SOURCE_GUIDE}), not as a plain text/textarea field — these will be auto-filled from the real record once a PIP is actually created for someone, so they should never be editable HR-authored content. This typically covers most or all of 'Employee & Plan Details'. Fields that are genuinely choices HR makes when setting the PIP up — e.g. PIP duration (30/60/90 days), start/end date, review dates — are NOT system fields; keep those as normal select/date fields.`;

export async function POST(req: NextRequest) {
  try {
    const caller = await requireAppraisalGradeTemplateAccess(req, "add");
    if (!caller) {
      return NextResponse.json(
        { error: "Recruitment add access is required." },
        { status: 403 },
      );
    }

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
      tool_choice: { type: "tool", name: "record_extracted_pip_form" },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const extracted = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};

    const schema = normalizePipFormSchema(extracted);
    if (!schema) {
      return NextResponse.json(
        { error: "Couldn't find any usable PIP form structure in that document." },
        { status: 422 },
      );
    }

    return NextResponse.json({ data: { schema } });
  } catch (err: unknown) {
    console.error("[POST /api/appraisal/pip-templates/extract]", err);
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
