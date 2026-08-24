import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import { fetchAndAppendStatusHistory } from "@/lib/careers/statusHistory";

export const SHORTLIST_THRESHOLD = 60;

const MAX_BYTES = 20 * 1024 * 1024;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCREENING_TOOL = {
  name: "record_application_screening",
  description:
    "Records how well an applicant's CV matches a job's requirements, for automatic shortlisting.",
  input_schema: {
    type: "object" as const,
    properties: {
      score: {
        type: "number",
        description:
          "Overall match score from 0 to 100 reflecting how well the CV matches the job's key responsibilities, minimum qualifications, experience requirements, and required skills/attributes. Be realistic and discriminating — most CVs are not a perfect match.",
      },
      summary: {
        type: "string",
        description:
          "A brief 1-3 sentence rationale for the score: the strongest matches and the clearest gaps, so a human reviewer can quickly sanity-check the call.",
      },
    },
    required: ["score", "summary"],
  },
};

type JobPostingSnippet = {
  title: string | null;
  key_responsibilities: string | null;
  minimum_qualifications: string | null;
  experience: string | null;
  required_skills_attributes: string | null;
};

export type ScreenApplicationInput = {
  id: string;
  role_title: string | null;
  job_posting_id: string | null;
  cv_url: string | null;
};

export type ScreenApplicationResult =
  | {
      ok: true;
      status: "shortlisted" | "under_review";
      score: number;
      summary: string;
    }
  | { ok: false; error: string };

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

function buildInstructions(posting: JobPostingSnippet | null, roleTitle: string): string {
  const sections = posting
    ? [
        posting.key_responsibilities?.trim() &&
          `Key responsibilities:\n${posting.key_responsibilities.trim()}`,
        posting.minimum_qualifications?.trim() &&
          `Minimum qualifications:\n${posting.minimum_qualifications.trim()}`,
        posting.experience?.trim() && `Experience required:\n${posting.experience.trim()}`,
        posting.required_skills_attributes?.trim() &&
          `Required skills & attributes:\n${posting.required_skills_attributes.trim()}`,
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  return [
    `You are screening a CV against a job at Wills Farms, a farm operation in Ghana. The role is "${roleTitle}".`,
    sections
      ? `Here are the role's requirements:\n\n${sections}`
      : "No detailed job description is on file for this role — use the role title alone as the basis for judgment.",
    "Read the attached CV and record a match score using the record_application_screening tool. Score realistically: a CV that clearly meets the minimum qualifications, has relevant experience, and shows the required skills should score highly; a CV missing several of these should score low. Don't be generous by default.",
  ].join("\n\n");
}

/** Grade one submitted application against its job posting CV requirements. */
export async function screenApplication(
  supabaseAdmin: SupabaseClient,
  application: ScreenApplicationInput,
): Promise<ScreenApplicationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server" };
  }

  if (!application.cv_url) {
    return { ok: false, error: "No CV on file for this application." };
  }

  let posting: JobPostingSnippet | null = null;
  if (application.job_posting_id) {
    const { data: postingRow } = await supabaseAdmin
      .from("job_postings")
      .select(
        "title, key_responsibilities, minimum_qualifications, experience, required_skills_attributes",
      )
      .eq("id", application.job_posting_id)
      .maybeSingle();
    posting = postingRow ?? null;
  }

  const fileUrl = application.cv_url;
  const fileName = decodeURIComponent(fileUrl.split("/").pop() ?? "cv");

  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    return { ok: false, error: `Could not download CV (HTTP ${fileRes.status})` };
  }
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    return { ok: false, error: "CV too large to read" };
  }
  const contentType = fileRes.headers.get("content-type");
  const wordDoc = isWordDoc(fileName, contentType);
  const imgMediaType = imageMediaType(fileName, contentType);

  const instructions = buildInstructions(posting, application.role_title ?? "this role");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: instructions }];

  if (wordDoc) {
    const { value: text } = await mammoth.extractRawText({ buffer });
    if (!text.trim()) {
      return { ok: false, error: "Couldn't read text from CV" };
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
    max_tokens: 1024,
    tools: [SCREENING_TOOL],
    tool_choice: { type: "tool", name: "record_application_screening" },
    messages: [{ role: "user", content: content as never }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  const result = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};
  const rawScore = Number(result.score);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;
  const scoreSummary = typeof result.summary === "string" ? result.summary : "";

  const newStatus: "shortlisted" | "under_review" =
    score >= SHORTLIST_THRESHOLD ? "shortlisted" : "under_review";

  const statusHistory = await fetchAndAppendStatusHistory(supabaseAdmin, application.id, newStatus, null);

  const { error: updateErr } = await supabaseAdmin
    .from("job_applications")
    .update({
      status: newStatus,
      status_history: statusHistory,
      ai_screening: {
        score,
        summary: scoreSummary,
        model: TASK_MANAGER_AI_MODEL,
        screened_at: new Date().toISOString(),
      },
    })
    .eq("id", application.id);

  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true, status: newStatus, score, summary: scoreSummary };
}
