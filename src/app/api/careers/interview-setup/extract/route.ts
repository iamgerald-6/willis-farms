import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { requireAuth } from "@/lib/apiRequestAuth";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import { RATING_LABELS } from "@/lib/careers/interviewFormConfigs";
import { DEFAULT_INTERVIEW_BENCHMARKS } from "@/lib/systemDefinitions/interviewBenchmarksConfig";

// Reading a full interview guide document (often several pages) can take
// longer than the platform's default function timeout — same reasoning as
// postings/extract/route.ts.
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

// Field names deliberately match ScreeningItem/InterviewQuestion/ScenarioItem
// /DisqualifierDef (src/lib/careers/interviewFormConfigs.ts,
// interviewGuidesConfig.ts) so the extracted tool_use input can be used
// directly as a posting's interview_setup with no relabeling.
const EXTRACTION_TOOL = {
  name: "record_extracted_interview_setup",
  description:
    "Records interview content extracted from an uploaded interview guide document, structured to match Wills Farms' per-posting Interview setup.",
  input_schema: {
    type: "object" as const,
    properties: {
      description: {
        type: "string",
        description:
          "A short description of what this interview covers and how to approach it — usually drawn from an interviewer briefing, introduction, or philosophy section near the top of the document. Plain text, 1-4 sentences.",
      },
      recommendedPanel: {
        type: "string",
        description:
          "Who should sit on the interview panel (roles/titles), as stated in the document — e.g. \"Herd Supervisor as chair, plus the Farm Manager and Veterinarian.\" Leave empty if not stated.",
      },
      durationMinutes: {
        type: "integer",
        description:
          "One overall approximate duration for the whole interview, in minutes, rounded to the nearest 5, and clamped between 30 and 60. If the document gives separate interview and practical/assessment durations, pick a single representative figure (e.g. the interview portion, or the larger of the two) rather than adding them together. Default to 45 if the document doesn't state a duration.",
      },
      screening: {
        type: "array",
        description:
          "Pass/fail screening or qualification checklist items (often a table near the start, e.g. \"Section A\"). Skip this entirely if the document has no such checklist.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Short id from the document, e.g. \"A1\" — or A1, A2... if none given." },
            requirement: { type: "string", description: "The requirement/criterion text." },
            mandatory: {
              type: "boolean",
              description: "True if failing this item disqualifies the candidate (the document usually says so explicitly).",
            },
          },
          required: ["id", "requirement"],
        },
      },
      questions: {
        type: "array",
        description:
          "Structured interview questions (the main body of the interview, often grouped into lettered/numbered sub-sections). Skip warm-up/unscored questions if the document marks one as such.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Short id, e.g. \"Q1\"." },
            section: {
              type: "string",
              description: "The sub-section heading this question belongs to, e.g. \"B1 Motivation and Trainability\". Use \"General\" if the document has no sub-sections.",
            },
            question: { type: "string", description: "The question text, verbatim or lightly cleaned up." },
            lookFor: {
              type: "string",
              description: "What a good answer looks like / what to watch for, if the document states it. Empty string if not stated.",
            },
          },
          required: ["id", "section", "question"],
        },
      },
      scenarios: {
        type: "array",
        description:
          "Practical/scenario assessment items (a hands-on or situational exercise section, often after the main questions). Skip if the document has no practical component.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Short id, e.g. \"P1\"." },
            section: { type: "string", description: "Section label, e.g. \"Section C\". Use \"Practical\" if unlabeled." },
            title: { type: "string", description: "Short title of the exercise." },
            observe: { type: "string", description: "What to observe or score during the exercise." },
          },
          required: ["id", "section", "title"],
        },
      },
      disqualifiers: {
        type: "array",
        description:
          "Automatic disqualifiers / critical red flags (a checklist near the evaluation/decision section, e.g. \"any one = Do Not Hire\"). Skip if the document has none.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Short slug id, e.g. \"dq_1\"." },
            label: { type: "string", description: "The disqualifying condition, e.g. \"Dishonesty at any point in the interview.\"" },
          },
          required: ["id", "label"],
        },
      },
      ratingLabels: {
        type: "object",
        description:
          "Only include this if the document defines its own 1-5 rating scale labels (e.g. \"1 = Unsatisfactory... 5 = Excellent\"); omit entirely if it just says \"rate 1-5\" with no labels or uses the standard farm scale.",
        properties: {
          "1": { type: "string" },
          "2": { type: "string" },
          "3": { type: "string" },
          "4": { type: "string" },
          "5": { type: "string" },
        },
      },
      benchmarks: {
        type: "object",
        description:
          "Score thresholds from an interpretation guide (e.g. \"4.0+ strong hire, 3.3-3.9 hire, 2.8-3.2 hold, below 2.8 do not hire\"). Omit entirely if the document has no such interpretation guide.",
        properties: {
          strongHireMin: { type: "number", description: "Minimum score for 'strong hire'." },
          hireMin: { type: "number", description: "Minimum score for 'hire'." },
          holdMin: { type: "number", description: "Minimum score for 'hold/reserve' (below this is do-not-hire)." },
        },
      },
    },
    required: [],
  },
};

const INSTRUCTIONS =
  "This is a structured interview guide and evaluation sheet document for a role at Wills Farms, a farm operation in Ghana. Read it and extract its content into the fields defined by the record_extracted_interview_setup tool, mapping the document's own sections onto the closest matching field by meaning, not by exact heading wording. Leave a field out entirely if the document has nothing that maps to it — don't invent content, and don't fill in blank answer/rating fields meant for interviewers to complete during the actual interview.";

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      tool_choice: { type: "tool", name: "record_extracted_interview_setup" },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const extracted = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};

    const asString = (v: unknown): string => (typeof v === "string" ? v : "");
    const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

    const screening = asArray(extracted.screening).filter(
      (r): r is { id: string; requirement: string; mandatory?: boolean } =>
        !!r && typeof r === "object" && typeof (r as { requirement?: unknown }).requirement === "string",
    );
    const questions = asArray(extracted.questions).filter(
      (r): r is { id: string; section: string; question: string; lookFor?: string } =>
        !!r && typeof r === "object" && typeof (r as { question?: unknown }).question === "string",
    );
    const scenarios = asArray(extracted.scenarios).filter(
      (r): r is { id: string; section: string; title: string; observe?: string } =>
        !!r && typeof r === "object" && typeof (r as { title?: unknown }).title === "string",
    );
    const disqualifiers = asArray(extracted.disqualifiers).filter(
      (r): r is { id: string; label: string } =>
        !!r && typeof r === "object" && typeof (r as { label?: unknown }).label === "string",
    );

    const rawRatingLabels = extracted.ratingLabels;
    const ratingLabels: Record<number, string> = { ...RATING_LABELS };
    if (rawRatingLabels && typeof rawRatingLabels === "object") {
      for (const n of [1, 2, 3, 4, 5]) {
        const v = (rawRatingLabels as Record<string, unknown>)[String(n)];
        if (typeof v === "string" && v.trim()) ratingLabels[n] = v.trim();
      }
    }

    const rawBenchmarks = extracted.benchmarks;
    const benchmarks = { ...DEFAULT_INTERVIEW_BENCHMARKS };
    if (rawBenchmarks && typeof rawBenchmarks === "object") {
      const b = rawBenchmarks as Record<string, unknown>;
      if (typeof b.strongHireMin === "number") benchmarks.strongHireMin = b.strongHireMin;
      if (typeof b.hireMin === "number") benchmarks.hireMin = b.hireMin;
      if (typeof b.holdMin === "number") {
        benchmarks.holdMin = b.holdMin;
        benchmarks.stage1AdvanceMin = b.holdMin;
        benchmarks.stage2AdvanceMin = b.holdMin;
      }
    }

    const rawDuration = extracted.durationMinutes;
    const durationMinutes =
      typeof rawDuration === "number" && Number.isFinite(rawDuration)
        ? Math.round(Math.min(60, Math.max(30, rawDuration)) / 5) * 5
        : null;

    const data = {
      description: asString(extracted.description),
      panelMembers: asString(extracted.recommendedPanel),
      durationMinutes,
      setup: {
        screening: screening.map((s, i) => ({
          id: s.id || `A${i + 1}`,
          requirement: s.requirement,
          mandatory: s.mandatory === true,
        })),
        questions: questions.map((q, i) => ({
          id: q.id || `Q${i + 1}`,
          section: q.section || "General",
          question: q.question,
          lookFor: q.lookFor ?? "",
        })),
        scenarios: scenarios.map((s, i) => ({
          id: s.id || `P${i + 1}`,
          section: s.section || "Practical",
          title: s.title,
          observe: s.observe ?? "",
        })),
        disqualifiers: disqualifiers.map((d, i) => ({
          id: d.id || `dq_${i + 1}`,
          label: d.label,
        })),
        ratingLabels,
        evaluationLabels: {},
        benchmarks,
        extraStages: [],
      },
    };

    const hasContent =
      !!data.description.trim() ||
      !!data.panelMembers.trim() ||
      data.setup.screening.length > 0 ||
      data.setup.questions.length > 0 ||
      data.setup.scenarios.length > 0 ||
      data.setup.disqualifiers.length > 0;

    if (!hasContent) {
      return NextResponse.json(
        { error: "Couldn't find any matching interview content in that document." },
        { status: 422 },
      );
    }

    return NextResponse.json({ data });
  } catch (err: unknown) {
    console.error("[POST /api/careers/interview-setup/extract]", err);
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
