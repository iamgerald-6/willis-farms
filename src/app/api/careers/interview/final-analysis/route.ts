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
  combinedInterviewAverage,
  stage2ReadyForEvaluation,
  stageMembers,
  getSubmission,
} from "@/lib/careers/panelInterview";
import { canConfirmHire } from "@/lib/careers/panelDecision";

// Same idea as the Stage 1 analysis route, but for the final evaluation:
// once Stage 2 is fully submitted, read the ENTIRE Stage 1 + Stage 2
// record (every grader's screening/question/scenario notes) and give HR
// a one-paragraph analysis plus a hire / hold / do_not_hire recommendation.
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_TOOL = {
  name: "record_final_recommendation",
  description:
    "Records a one-paragraph analysis and a final hire/hold/do_not_hire recommendation, weighing the combined score, grader notes, AND HR's critical-concern checklist together as factors — not any single one in isolation.",
  input_schema: {
    type: "object" as const,
    properties: {
      analysis: {
        type: "string",
        description:
          "One paragraph (roughly 100-160 words) summarising the full Stage 1 + Stage 2 record: consistency across graders, standout strengths, any red flags or disagreement in the notes (especially on mandatory screening items or honesty/biosecurity questions), and how the practical assessment compared to the interview. For any critical-concern checklist item marked 'Yes — observed', don't just note that it was checked — explain what it implies about the candidate's suitability, how serious it is given the notes/context, and how much weight it carries in your overall judgment (a minor, well-explained concern may matter less than a serious, unexplained one). Then tie all of this — score, notes, and checklist findings — together into a clear rationale for the recommendation.",
      },
      recommendation: {
        type: "string",
        enum: ["hire", "hold", "do_not_hire"],
        description:
          "Your overall judgment, weighing three factors together: the combined score (HR can only confirm 'hire' when it's at least 3.3/5 — below that, don't recommend hire), the consistency/quality of grader notes, and the critical-concern checklist. A checklist item marked 'Yes — observed' is a real negative factor that should pull the recommendation toward hold or do_not_hire, proportional to how serious it is in context — it isn't an automatic veto on its own, but it also isn't just background information; weigh it the same way you'd weigh a serious concern raised in a grader's notes.",
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

    if (!stage2ReadyForEvaluation(formData)) {
      return NextResponse.json(
        { error: "Stage 2 isn't fully submitted yet — every panel member and HR must submit first." },
        { status: 400 },
      );
    }

    const stage1Graders = gradersForStage(formData, guide, 1);
    const stage2Graders = gradersForStage(formData, guide, 2);
    const stage1Avg = stageAverage(formData, guide, 1);
    const stage2Avg = stageAverage(formData, guide, 2);
    const combined = combinedInterviewAverage(formData, guide);

    const sections: string[] = [];

    sections.push("STAGE 1 — Interview (screening + structured questions):");
    for (const member of stageMembers(formData, 1)) {
      const sub = getSubmission(formData, member.id, 1);
      if (!sub) continue;
      sections.push(formatStage1Section(member.name, "Panel member", guide, sub));
    }
    if (formData.hr_submission?.stage1) {
      sections.push(formatStage1Section("HR", "HR", guide, formData.hr_submission.stage1));
    }

    sections.push("\nSTAGE 2 — Practical assessment:");
    for (const member of stageMembers(formData, 2)) {
      const sub = getSubmission(formData, member.id, 2);
      if (!sub) continue;
      sections.push(formatStage2Section(member.name, "Panel member", guide, sub));
    }
    if (formData.hr_submission?.stage2) {
      sections.push(formatStage2Section("HR", "HR", guide, formData.hr_submission.stage2));
    }

    // Every item HR was asked to check, not just the ones flagged "yes" —
    // an explicit "No" is itself useful signal (a concern was actively
    // ruled out), and "Generate" is only enabled once every item has an
    // answer, so this always reflects a complete checklist.
    const disqualifierRows =
      guide.disqualifierItems ??
      guide.disqualifiers.map((label, i) => ({ id: `dq_${i}`, label }));
    const checklistText = disqualifierRows
      .map((item) => {
        const entry = formData.disqualifiers?.[item.id];
        const status =
          entry?.observed === "yes"
            ? "Yes — observed"
            : entry?.observed === "no"
              ? "No — not observed"
              : "Not answered";
        const notes = entry?.notes?.trim() ? ` (notes: ${entry.notes.trim()})` : "";
        return `- ${item.label}: ${status}${notes}`;
      })
      .join("\n");

    const stage1ScoreSummary = stage1Graders
      .map((g) => `${g.label} (${g.role}): ${g.total?.toFixed(2) ?? "—"}/5`)
      .join(", ");
    const stage2ScoreSummary = stage2Graders
      .map((g) => `${g.label} (${g.role}): ${g.total?.toFixed(2) ?? "—"}/5`)
      .join(", ");

    const prompt = [
      `You are assisting Wills Farms' Human Capital team with a final hire decision for the role "${guide.title}".`,
      `Candidate: ${application.full_name}. Reference: ${application.reference_number}.`,
      `Interpretation guide for this role: ${guide.interpretation}`,
      `Known disqualifiers to watch for: ${guide.disqualifiers.join("; ")}`,
      `HR's critical-concern checklist for this candidate — every item, as answered by HR:\n${checklistText}`,
      `Stage 1 grader scores: ${stage1ScoreSummary}. Stage 1 average: ${stage1Avg?.toFixed(2) ?? "—"}/5.`,
      `Stage 2 grader scores: ${stage2ScoreSummary}. Stage 2 average: ${stage2Avg?.toFixed(2) ?? "—"}/5.`,
      `Combined weighted score: ${combined?.toFixed(2) ?? "—"}/5. Note: HR can only confirm "hire" when this combined score is at least 3.3/5 (currently ${canConfirmHire(combined) ? "meets" : "does NOT meet"} that bar).`,
      "Detailed per-grader notes follow:",
      ...sections,
      "Using the record_final_recommendation tool, give HR a one-paragraph analysis and a clear final recommendation: hire, hold, or do_not_hire. Treat the combined score, the grader notes, and the critical-concern checklist above as three factors to weigh together — don't just restate the checklist, reason about what any flagged item means for the candidate and let that genuinely inform whether you recommend hire, hold, or do_not_hire.",
    ].join("\n\n");

    const message = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 800,
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: "record_final_recommendation" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const result =
      (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};
    const analysis = typeof result.analysis === "string" ? result.analysis : "";
    const recommendation =
      result.recommendation === "hire" || result.recommendation === "do_not_hire"
        ? result.recommendation
        : "hold";

    if (!analysis) {
      return NextResponse.json({ error: "AI did not return an analysis." }, { status: 502 });
    }

    const updatedFormData = {
      ...formData,
      summary: {
        ...formData.summary,
        ai_analysis: analysis,
        ai_recommendation: recommendation as "hire" | "hold" | "do_not_hire",
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
    console.error("[POST /api/careers/interview/final-analysis]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function formatStage1Section(
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

function formatStage2Section(
  name: string,
  role: string,
  guide: InterviewGuideConfig,
  sub: { scenario_ratings?: Record<string, { rating: number | null; notes: string }> },
): string {
  const lines: string[] = [`— ${name} (${role}):`];
  const scenarioLines = guide.scenarios.map((s) => {
    const entry = sub.scenario_ratings?.[s.id];
    const rating = entry?.rating != null ? `${entry.rating}/5` : "not rated";
    const notes = entry?.notes ? ` — ${entry.notes}` : "";
    return `  ${s.id} [${s.title}] ${rating}${notes}`;
  });
  lines.push(...scenarioLines);
  return lines.join("\n");
}
