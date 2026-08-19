import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import { INSTITUTION_TYPES } from "@/lib/careers/applicationFormSchema";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/careers/phoneCountryCodes";
import { COUNTRY_NAMES } from "@/lib/careers/countryNames";

// Same reasoning as the job posting extraction route — downloading,
// base64-encoding, and having Claude read a CV can take longer than the
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

const WORK_ENTRY_SCHEMA = {
  type: "object" as const,
  properties: {
    company: { type: "string", description: "Employer / place of work." },
    title: { type: "string", description: "Job title held there." },
    start: {
      type: "string",
      description: "Start date as YYYY-MM. If only a year is shown, use 01 for the month.",
    },
    end: {
      type: "string",
      description: "End date as YYYY-MM. Leave empty if current is true.",
    },
    current: { type: "boolean", description: "True if this is their current/ongoing role." },
  },
  required: ["company", "title"],
};

const EDUCATION_ENTRY_SCHEMA = {
  type: "object" as const,
  properties: {
    institutionType: {
      type: "string",
      description: `The closest match among: ${INSTITUTION_TYPES.join(", ")}.`,
    },
    institutionName: { type: "string" },
    yearStarted: { type: "string", description: "YYYY" },
    yearCompleted: { type: "string", description: "YYYY" },
    degree: {
      type: "string",
      description: "Degree/qualification obtained, if applicable (leave empty for e.g. high school).",
    },
  },
  required: ["institutionName"],
};

const EXTRACTION_TOOL = {
  name: "record_extracted_application",
  description:
    "Records applicant details found in an uploaded CV/resume, structured to match Wills Farms' job application form fields.",
  input_schema: {
    type: "object" as const,
    properties: {
      first_name: { type: "string", description: "Applicant's first name, if stated." },
      last_name: { type: "string", description: "Applicant's last name/surname, if stated." },
      email: { type: "string", description: "Email address, if present." },
      phone: {
        type: "string",
        description:
          "Phone number exactly as it appears, including any country code prefix (e.g. +233) if shown.",
      },
      date_of_birth: {
        type: "string",
        description:
          "Date of birth as YYYY-MM-DD, only if explicitly stated on the document. CVs rarely include this — leave empty rather than estimating from age or graduation dates.",
      },
      gender: {
        type: "string",
        description: '"Male" or "Female", only if explicitly stated. Never infer from the name.',
      },
      nationality: {
        type: "string",
        description: "Nationality/citizenship as a country name, only if explicitly stated.",
      },
      work_experience: { type: "array", items: WORK_ENTRY_SCHEMA },
      education: { type: "array", items: EDUCATION_ENTRY_SCHEMA },
    },
    required: [],
  },
};

const INSTRUCTIONS =
  "This is a CV/resume uploaded by someone applying for a job at Wills Farms, a farm operation in Ghana. Extract whatever matches the fields defined by the record_extracted_application tool. Only fill in what's explicitly present in the document — leave a field empty (or an array empty) rather than guessing, inferring, or estimating. In particular: don't infer gender from the applicant's name, don't infer date of birth from age or from graduation years, and don't invent a nationality if it isn't stated anywhere.";

function normalizePhone(raw: string | undefined): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    const matched = COUNTRY_CODES.filter((c) => cleaned.startsWith(c.code)).sort(
      (a, b) => b.code.length - a.code.length,
    )[0];
    if (matched) {
      const digits = cleaned.slice(matched.code.length).replace(/\D/g, "").slice(0, 9);
      if (digits.length === 9) return `${matched.code}${digits}`;
    }
  }
  // No recognizable country code — assume Ghana (the vast majority of
  // applicants) and use the last 9 digits, stripping a leading trunk 0.
  const digitsOnly = cleaned.replace(/\D/g, "").replace(/^0+/, "");
  const last9 = digitsOnly.slice(-9);
  return last9.length === 9 ? `${DEFAULT_COUNTRY_CODE}${last9}` : "";
}

function matchFromList(raw: string | undefined, options: string[]): string {
  if (!raw) return "";
  const found = options.find((o) => o.toLowerCase() === raw.trim().toLowerCase());
  return found ?? "";
}

function isValidIsoDate(raw: string | undefined): boolean {
  return !!raw && /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

type RawWorkEntry = { company?: string; title?: string; start?: string; end?: string; current?: boolean };
type RawEducationEntry = {
  institutionType?: string;
  institutionName?: string;
  yearStarted?: string;
  yearCompleted?: string;
  degree?: string;
};

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
    const imgMediaType = imageMediaType(fileName, contentType);

    // Same "document" content-block type gap as the job posting extraction
    // route — the installed SDK version's types don't include it.
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
      tool_choice: { type: "tool", name: "record_extracted_application" },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const raw = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};

    const workExperience = (Array.isArray(raw.work_experience) ? raw.work_experience : [])
      .map((e: RawWorkEntry) => ({
        company: String(e?.company ?? "").trim(),
        title: String(e?.title ?? "").trim(),
        start: String(e?.start ?? "").trim(),
        end: String(e?.end ?? "").trim(),
        current: Boolean(e?.current),
      }))
      .filter((e) => e.company || e.title);

    const education = (Array.isArray(raw.education) ? raw.education : [])
      .map((e: RawEducationEntry) => ({
        institutionType: matchFromList(e?.institutionType, INSTITUTION_TYPES),
        institutionName: String(e?.institutionName ?? "").trim(),
        yearStarted: String(e?.yearStarted ?? "").trim(),
        yearCompleted: String(e?.yearCompleted ?? "").trim(),
        degree: String(e?.degree ?? "").trim(),
      }))
      .filter((e) => e.institutionName);

    const fields = {
      first_name: String(raw.first_name ?? "").trim(),
      last_name: String(raw.last_name ?? "").trim(),
      email: String(raw.email ?? "").trim().toLowerCase(),
      phone: normalizePhone(typeof raw.phone === "string" ? raw.phone : undefined),
      date_of_birth: isValidIsoDate(raw.date_of_birth as string | undefined)
        ? (raw.date_of_birth as string)
        : "",
      gender: matchFromList(raw.gender as string | undefined, ["Male", "Female"]),
      nationality: matchFromList(raw.nationality as string | undefined, COUNTRY_NAMES),
      work_experience: workExperience,
      education: education,
    };

    const hasContent =
      fields.first_name ||
      fields.last_name ||
      fields.email ||
      fields.phone ||
      fields.date_of_birth ||
      fields.gender ||
      fields.nationality ||
      workExperience.length > 0 ||
      education.length > 0;

    if (!hasContent) {
      return NextResponse.json(
        { error: "Couldn't find any matching information in that CV." },
        { status: 422 },
      );
    }

    return NextResponse.json({ data: fields });
  } catch (err: unknown) {
    console.error("[POST /api/careers/applications/extract-cv]", err);
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
