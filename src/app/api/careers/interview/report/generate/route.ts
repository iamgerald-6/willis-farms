import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import { resolveInterviewGuideKey } from "@/lib/careers/jobPostingOptions";
import { getInterviewGuide } from "@/lib/careers/interviewFormConfigs";
import { normalizeInterviewFormData, type InterviewReport } from "@/lib/careers/types";
import {
  gradersForStage,
  combinedInterviewAverage,
  combinedAreaScores,
  stageMembers,
  getSubmission,
} from "@/lib/careers/panelInterview";
import { observedDisqualifiers } from "@/lib/careers/panelDecision";

// Generates the comprehensive interview report once per applicant (HR can
// edit freely afterward, but the AI original recorded here is never
// regenerated or overwritten — see interview_report_edit for HR's copy).
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REPORT_TOOL = {
  name: "record_interview_report",
  description:
    "Records a comprehensive interview report for HR based on the complete Stage 1 and Stage 2 interview panel record.",
  input_schema: {
    type: "object" as const,
    properties: {
      executive_summary: {
        type: "string",
        description:
          "A tight 3-5 sentence executive summary of the candidate's overall interview performance and suitability for the role — the kind of overview a board or senior manager would want to read first.",
      },
      core_competencies: {
        type: "array",
        description:
          "One entry per assessment area listed below, in the same order. Each assessment is 1-2 sentences on how the candidate performed in that specific area, grounded in the panel's actual notes.",
        items: {
          type: "object",
          properties: {
            area: { type: "string" },
            assessment: { type: "string" },
          },
          required: ["area", "assessment"],
        },
      },
      strengths: {
        type: "array",
        description: "3-6 short bullet points, each a specific, concrete strength observed by the panel.",
        items: { type: "string" },
      },
      weaknesses: {
        type: "array",
        description: "2-5 short bullet points, each a specific, concrete weakness or concern observed by the panel. Empty array only if genuinely none were noted.",
        items: { type: "string" },
      },
      observations_summary: {
        type: "string",
        description: "2-4 sentences synthesising the strengths and weaknesses into an overall read of the candidate's fit, consistency across graders, and any disagreement worth flagging.",
      },
      recommendation_decision: {
        type: "string",
        enum: ["hire", "hold", "do_not_hire"],
        description:
          "hire only if the record clearly supports it (HR can only confirm 'hire' when the combined weighted score is at least 3.3/5). hold if promising but reservations remain. do_not_hire if the record does not support appointment.",
      },
      recommendation_rationale: {
        type: "string",
        description: "2-3 sentences explaining the rationale behind the final recommendation.",
      },
    },
    required: [
      "executive_summary",
      "core_competencies",
      "strengths",
      "weaknesses",
      "observations_summary",
      "recommendation_decision",
      "recommendation_rationale",
    ],
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

    if (application.status !== "evaluation") {
      return NextResponse.json(
        { error: "The interview report can only be generated once the applicant is in Evaluation status." },
        { status: 400 },
      );
    }

    const formData = normalizeInterviewFormData(application.interview_form_data);

    if (formData.summary?.interview_report) {
      return NextResponse.json(
        { error: "A report has already been generated for this applicant." },
        { status: 400 },
      );
    }

    const guideKey = await resolveInterviewGuideKey(supabaseAdmin, application.role_slug);
    if (!guideKey) {
      return NextResponse.json({ error: "Unknown role on application." }, { status: 400 });
    }
    const guide = getInterviewGuide(guideKey);

    const stage1Members = stageMembers(formData, 1);
    const stage2Members = stageMembers(formData, 2);
    const panelNames = Array.from(
      new Set([...stage1Members, ...stage2Members].map((m) => m.name).filter(Boolean)),
    );

    const combined = combinedInterviewAverage(formData, guide);
    const areaScores = combinedAreaScores(formData, guide);

    const stage1Graders = gradersForStage(formData, guide, 1);
    const stage2Graders = gradersForStage(formData, guide, 2);

    const sections: string[] = [];
    sections.push("STAGE 1 — Interview (screening + structured questions):");
    for (const member of stage1Members) {
      const sub = getSubmission(formData, member.id, 1);
      if (!sub) continue;
      sections.push(formatStage1Section(member.name, "Panel member", guide, sub));
    }
    if (formData.hr_submission?.stage1) {
      sections.push(formatStage1Section("HR", "HR", guide, formData.hr_submission.stage1));
    }

    sections.push("\nSTAGE 2 — Practical assessment:");
    for (const member of stage2Members) {
      const sub = getSubmission(formData, member.id, 2);
      if (!sub) continue;
      sections.push(formatStage2Section(member.name, "Panel member", guide, sub));
    }
    if (formData.hr_submission?.stage2) {
      sections.push(formatStage2Section("HR", "HR", guide, formData.hr_submission.stage2));
    }

    const flaggedConcerns = observedDisqualifiers(formData, guide.disqualifiers);
    const concernsText = flaggedConcerns.length
      ? flaggedConcerns.map((c) => `${c.label}${c.notes ? ` — ${c.notes}` : ""}`).join("; ")
      : "None flagged by HR.";

    const stage1ScoreSummary = stage1Graders
      .map((g) => `${g.label} (${g.role}): ${g.total?.toFixed(2) ?? "—"}/5`)
      .join(", ");
    const stage2ScoreSummary = stage2Graders
      .map((g) => `${g.label} (${g.role}): ${g.total?.toFixed(2) ?? "—"}/5`)
      .join(", ");
    const areaScoreSummary = guide.weights
      .map((w) => `${w.area}: ${areaScores[w.area]?.toFixed(2) ?? "—"}/5`)
      .join(", ");

    const prompt = [
      `You are writing a comprehensive interview report for Wills Farms' Human Capital team for the role "${guide.title}".`,
      `Candidate: ${application.full_name}. Reference: ${application.reference_number}.`,
      `Interpretation guide for this role: ${guide.interpretation}`,
      `Known disqualifiers to watch for: ${guide.disqualifiers.join("; ")}`,
      `HR's own critical-concern checklist for this candidate: ${concernsText}`,
      `Assessment areas for this role, in order: ${guide.weights.map((w) => w.area).join(", ")}.`,
      `Combined score per assessment area: ${areaScoreSummary}.`,
      `Stage 1 grader scores: ${stage1ScoreSummary}. Stage 2 grader scores: ${stage2ScoreSummary}.`,
      `Combined weighted score: ${combined?.toFixed(2) ?? "—"}/5. Note: HR can only confirm "hire" when this combined score is at least 3.3/5.`,
      "Detailed per-grader notes follow:",
      ...sections,
      "Using the record_interview_report tool, produce the full report. For core_competencies, give exactly one entry per assessment area listed above, in the same order, using the exact area name given.",
    ].join("\n\n");

    const message = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 2000,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "record_interview_report" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const result = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};

    const executiveSummary = typeof result.executive_summary === "string" ? result.executive_summary : "";
    if (!executiveSummary) {
      return NextResponse.json({ error: "AI did not return a report." }, { status: 502 });
    }

    const aiCompetencies = Array.isArray(result.core_competencies)
      ? (result.core_competencies as { area?: unknown; assessment?: unknown }[])
      : [];
    const competenciesByArea = new Map(
      aiCompetencies
        .filter((c) => typeof c.area === "string")
        .map((c) => [c.area as string, typeof c.assessment === "string" ? c.assessment : ""]),
    );

    const decision =
      result.recommendation_decision === "hire" || result.recommendation_decision === "do_not_hire"
        ? result.recommendation_decision
        : "hold";

    const report: InterviewReport = {
      generated_at: new Date().toISOString(),
      executive_summary: executiveSummary,
      applicant_details: {
        name: application.full_name,
        role: application.role_title,
        reference_number: application.reference_number,
        panel_names: panelNames,
        interview_date:
          formData.setup?.stage2_scheduled_at ?? formData.setup?.interview_start_at ?? null,
        location: formData.setup?.stage2_location ?? formData.setup?.location ?? null,
        overall_rating: combined,
      },
      core_competencies: guide.weights.map((w) => ({
        area: w.area,
        score: areaScores[w.area] ?? null,
        assessment: competenciesByArea.get(w.area) ?? "",
      })),
      key_observations: {
        strengths: Array.isArray(result.strengths)
          ? (result.strengths as unknown[]).filter((s): s is string => typeof s === "string")
          : [],
        weaknesses: Array.isArray(result.weaknesses)
          ? (result.weaknesses as unknown[]).filter((s): s is string => typeof s === "string")
          : [],
        summary: typeof result.observations_summary === "string" ? result.observations_summary : "",
      },
      final_recommendation: {
        decision: decision as InterviewReport["final_recommendation"]["decision"],
        rationale:
          typeof result.recommendation_rationale === "string" ? result.recommendation_rationale : "",
      },
    };

    const updatedFormData = {
      ...formData,
      summary: {
        ...formData.summary,
        interview_report: report,
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
    console.error("[POST /api/careers/interview/report/generate]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function formatStage1Section(
  name: string,
  role: string,
  guide: ReturnType<typeof getInterviewGuide>,
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
  guide: ReturnType<typeof getInterviewGuide>,
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
