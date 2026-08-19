import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { requireAuth } from "@/lib/apiRequestAuth";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import { JOB_POSTING_CONTENT_SECTIONS } from "@/lib/careers/jobPostings";

// Same reasoning as Task Manager's document extraction (extract/route.ts) —
// downloading, base64-encoding, and having Claude read a JD document can
// take longer than the platform's default function timeout.
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

// Every section's shorthand needs to line up exactly with how
// src/components/SectionText.tsx parses it, or the extracted content will
// render as one flat paragraph instead of the structure that was actually
// in the document.
const SECTION_SYNTAX_HINT =
  "Plain text only, no markdown headings syntax beyond what's described here. Structure it using: a line starting with \"- \" for a bullet point, a line starting with \"1. \" (increment the number for each item) for a numbered point, a line starting with \"# \" for a sub-heading (use this when the source document has its own sub-headings within this section, e.g. a numbered sub-section like \"6.1 Daily Animal Care\" — turn that into \"# Daily Animal Care\" followed by its own bullet list). Wrap words in *asterisks* for bold or _underscores_ for italic where the source document emphasizes them. Leave as an empty string if the document has no content for this section — don't invent content that isn't there.";

const EXTRACTION_TOOL = {
  name: "record_extracted_job_posting",
  description:
    "Records the job description content extracted from an uploaded document, structured to match Wills Farms' job posting fields.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description:
          "A short 1-3 sentence overview of the role, suitable as a careers-page card preview. Base it on the document's job purpose/summary if it has one, or write a concise one from the overall content if not.",
      },
      role_scope: {
        type: "string",
        description: `The role's scope — which areas/operations it covers. ${SECTION_SYNTAX_HINT}`,
      },
      key_responsibilities: {
        type: "string",
        description: `The detailed day-to-day responsibilities. ${SECTION_SYNTAX_HINT}`,
      },
      minimum_qualifications: {
        type: "string",
        description: `The minimum required qualifications/education/certifications. ${SECTION_SYNTAX_HINT}`,
      },
      preferred_qualifications: {
        type: "string",
        description: `Preferred (not required) qualifications or experience. ${SECTION_SYNTAX_HINT}`,
      },
      experience: {
        type: "string",
        description: `Relevant work experience expectations. ${SECTION_SYNTAX_HINT}`,
      },
      required_skills_attributes: {
        type: "string",
        description: `Required skills, traits, and attributes. ${SECTION_SYNTAX_HINT}`,
      },
      non_negotiable_standards: {
        type: "string",
        description: `Non-negotiable standards/compliance requirements the role-holder must meet. ${SECTION_SYNTAX_HINT}`,
      },
    },
    required: [],
  },
};

const INSTRUCTIONS =
  "This is a job description document for a role at Wills Farms, a farm operation in Ghana. Read it and extract its content into the fields defined by the record_extracted_job_posting tool. Map the document's own sections onto the closest matching field by meaning, not by exact heading wording — for example a \"Role Scope\" or \"Coverage\" section maps to role_scope, a \"Key Responsibilities\" or \"Duties\" section (including any of its own numbered sub-headings) maps to key_responsibilities, \"Minimum Qualifications\" or \"Required Education\" maps to minimum_qualifications, \"Preferred\" or \"Preferred Qualifications\" maps to preferred_qualifications, \"Experience\" maps to experience, \"Required Skills and Attributes\" or similar maps to required_skills_attributes, and \"Non-Negotiable Standards\" or similar compliance/standards section maps to non_negotiable_standards. Sections that don't clearly correspond to any of these fields (e.g. job title, department, reporting line, authority limits, performance measures, career progression) can be left out — don't force unrelated content into a field it doesn't belong in. Leave any field empty if the document has nothing that maps to it.";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
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

    // The installed @anthropic-ai/sdk version's MessageParam types don't
    // include the "document" content block (PDF support) even though the
    // API accepts it — same reason Task Manager's extract/route.ts uses
    // `any[]` here instead of a strict SDK type.
    const content: any[] = [{ type: "text", text: INSTRUCTIONS }];

    if (wordDoc) {
      const { value: text } = await mammoth.extractRawText({ buffer });
      if (!text.trim()) {
        return NextResponse.json(
          { error: `Couldn't read any text out of "${fileName}".` },
          { status: 422 },
        );
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
      tool_choice: { type: "tool", name: "record_extracted_job_posting" },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const extracted = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};

    const fields: Record<string, string> = { summary: "" };
    for (const section of JOB_POSTING_CONTENT_SECTIONS) {
      fields[section.key] = typeof extracted[section.key] === "string" ? (extracted[section.key] as string) : "";
    }
    fields.summary = typeof extracted.summary === "string" ? (extracted.summary as string) : "";

    const hasContent = Object.values(fields).some((v) => v.trim());
    if (!hasContent) {
      return NextResponse.json(
        { error: "Couldn't find any matching job description content in that document." },
        { status: 422 },
      );
    }

    return NextResponse.json({ data: fields });
  } catch (err: unknown) {
    console.error("[POST /api/careers/postings/extract]", err);
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
