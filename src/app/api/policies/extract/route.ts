import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import { POLICY_DESCRIPTION_MAX_CHARS } from "@/lib/moduleRegistry";

// Same reasoning as every other extraction route in this app — downloading,
// base64-encoding, and having Claude read a document can exceed the
// platform's default function timeout.
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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_TOOL = {
  name: "record_extracted_policy_details",
  description:
    "Records a suggested title and description for a Wills Farms company policy document, based on what the document actually says.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description:
          "A short, clear title for this policy — use the document's own title/heading if it has one, otherwise summarize what the policy governs in a few words.",
      },
      description: {
        type: "string",
        description: `A concise, plain-language summary of what this policy covers and who it applies to — no more than ${POLICY_DESCRIPTION_MAX_CHARS} characters.`,
      },
    },
    required: ["title", "description"],
  },
};

const INSTRUCTIONS =
  "This is a company policy document used internally at Wills Farms, a farm operation in Ghana. Read it and call the record_extracted_policy_details tool with a short, accurate title and a concise description of what the policy covers and who it applies to. Base both only on what the document actually says — don't invent details it doesn't contain.";

export async function POST(req: NextRequest) {
  try {
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
          error: `"${fileName}" is ${(buffer.byteLength / (1024 * 1024)).toFixed(1)}MB, which is too large to read reliably.`,
        },
        { status: 400 },
      );
    }

    const wordDoc = isWordDoc(fileName, contentType);

    // Same "document" content-block type gap as the other extraction routes
    // — the installed SDK version's types don't include it.
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
    } else {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      });
    }

    const message = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 1024,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "record_extracted_policy_details" },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const raw = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};

    const title = String(raw.title ?? "").trim();
    const description = String(raw.description ?? "")
      .trim()
      .slice(0, POLICY_DESCRIPTION_MAX_CHARS);

    if (!title && !description) {
      return NextResponse.json(
        { error: "Couldn't extract a title or description from that document." },
        { status: 422 },
      );
    }

    return NextResponse.json({ data: { title, description } });
  } catch (err: unknown) {
    console.error("[POST /api/policies/extract]", err);
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
