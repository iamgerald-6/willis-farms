import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import { resolveInterviewGuideKey } from "@/lib/careers/jobPostingOptions";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { fetchResolvedInterviewGuide } from "@/lib/careers/fetchResolvedInterviewGuide";
import { normalizeInterviewFormData } from "@/lib/careers/types";
import {
  gradersForStage,
  stageAverage,
  stage1ReadyForReview,
  stageMembers,
  getSubmission,
} from "@/lib/careers/panelInterview";

// HR asked for a quick AI read of everyone's Stage 1 scores and notes —
// one paragraph, advisory only — to help decide whether to advance the
// candidate to Stage 2 or reject at Stage 1. Reads take a few seconds of
// model time; give it more headroom than the default function timeout.
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_TOOL = {
  name: "record_stage1_recommendation",
  description:
    "Records a one-paragraph analysis and a recommendation on whether this candidate should advance to Stage 2 or be rejected at Stage 1.",
  input_schema: {
    type: "object" as const,
    properties: {
      analysis: {
        type: "string",
        description:
          "One paragraph (roughly 80-150 words) summarising what the panel and HR observed: where graders agreed, any notable disagreement or outliers, standout strengths, and any red flags from the notes (especially on mandatory screening items or honesty/biosecurity questions). End with a clear rationale for the recommendation.",
      },
      recommendation: {
        type: "string",
        enum: ["advance_to_stage2", "reject"],
        description:
          "advance_to_stage2 if the panel's scores and notes support moving forward to the Stage 2 practical; reject if they don't.",
      },
    },
    required: ["analysis", "recommendation"],
  },
};

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server" },
      { status: 500 },
    );
  }

  try {
    const { application_id } = await req.json();
    if (!application_id) {
      return NextResponse.json({ error: "application_id is required." }, { status: 400 });
    }

    const { data: application, error: fetchError } = await supabaseAdmin
      .from("job_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (fetchError || !application) {
      return NextResponse.json(
        { error: fetchError?.message ?? "Application not found." },
        { status: 404 },
      );
    }

    const guideKey = await resolveInterviewGuideKey(supabaseAdmin, application.role_slug);
    if (!guideKey) {
      return NextResponse.json({ error: "Unknown role on application." }, { status: 400 });
    }
    const guide = await fetchResolvedInterviewGuide(supabaseAdmin, guideKey);
    if (!guide) {
      return NextResponse.json(
        { error: "Interview guide not configured for this role." },
        { status: 400 },
      );
    }
    const formData = normalizeInterviewFormData(application.interview_form_data);

    if (!stage1ReadyForReview(formData)) {
      return NextResponse.json(
        { error: "Stage 1 isn't fully submitted yet — every panel member and HR must submit first." },
        { status: 400 },
      );
    }

    const graders = gradersForStage(formData, guide, 1);
    const average = stageAverage(formData, guide, 1);

    // Build a per-grader breakdown: screening pass/fail + every question
    // rating and note, so the model has the same detail a human reviewer
    // would read.
    const members = stageMembers(formData, 1);
    const sections: string[] = [];

    for (const member of members) {
      const sub = getSubmission(formData, member.id, 1);
      if (!sub) continue;
      sections.push(formatGraderSection(member.name, "Panel member", guide, sub));
    }
    const hrSub = formData.hr_submission?.stage1;
    if (hrSub) {
      sections.push(formatGraderSection("HR", "HR", guide, hrSub));
    }

    const scoreSummary = graders
      .map((g) => `${g.label} (${g.role}): ${g.total?.toFixed(2) ?? "—"}/5`)
      .join(", ");

    const prompt = [
      `You are assisting Wills Farms' Human Capital team in reviewing a Stage 1 interview panel for the role "${guide.title}".`,
      `Candidate: ${application.full_name}. Reference: ${application.reference_number}.`,
      `Interpretation guide for this role: ${guide.interpretation}`,
      `Known disqualifiers to watch for in the notes: ${guide.disqualifiers.join("; ")}`,
      `Grader scores (weighted 1-5): ${scoreSummary}. Average across all graders: ${average?.toFixed(2) ?? "—"}/5.`,
      "Detailed per-grader screening and question notes follow:",
      ...sections,
      "Using the record_stage1_recommendation tool, give HR a one-paragraph analysis and a clear recommendation: advance_to_stage2 or reject.",
    ].join("\n\n");

    const message = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 700,
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: "record_stage1_recommendation" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const result =
      (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};
    const analysis = typeof result.analysis === "string" ? result.analysis : "";
    const recommendation =
      result.recommendation === "reject" ? "reject" : "advance_to_stage2";

    if (!analysis) {
      return NextResponse.json({ error: "AI did not return an analysis." }, { status: 502 });
    }

    const updatedFormData = {
      ...formData,
      stage1_review: {
        ...formData.stage1_review,
        ai_analysis: analysis,
        ai_recommendation: recommendation as "advance_to_stage2" | "reject",
        ai_generated_at: new Date().toISOString(),
      },
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("job_applications")
      .update({ interview_form_data: updatedFormData })
      .eq("id", application_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        interview_form_data: normalizeInterviewFormData(updated.interview_form_data),
      },
    });
  } catch (err) {
    console.error("[POST /api/careers/interview/stage1-analysis]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function formatGraderSection(
  name: string,
  role: string,
  guide: InterviewGuideConfig,
  sub: { screening?: Record<string, { pass: string; notes: string }>; question_ratings?: Record<string, { rating: number | null; notes: string }> },
): string {
  const lines: string[] = [`— ${name} (${role}):`];

  const screeningLines = guide.screening
    .filter((item) => item.mandatory)
    .map((item) => {
      const entry = sub.screening?.[item.id];
      const pass = entry?.pass || "not answered";
      const notes = entry?.notes ? ` — ${entry.notes}` : "";
      return `  ${item.id} (${item.requirement}): ${pass}${notes}`;
    });
  if (screeningLines.length) {
    lines.push("  Mandatory screening:");
    lines.push(...screeningLines);
  }

  const questionLines = guide.questions.map((q) => {
    const entry = sub.question_ratings?.[q.id];
    const rating = entry?.rating != null ? `${entry.rating}/5` : "not rated";
    const notes = entry?.notes ? ` — ${entry.notes}` : "";
    return `  ${q.id} [${q.section}] ${rating}${notes}`;
  });
  lines.push("  Questions:");
  lines.push(...questionLines);

  return lines.join("\n");
}
