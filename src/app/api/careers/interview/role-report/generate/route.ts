import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import {
  isAiFlagged,
  normalizeInterviewFormData,
  type ApplicationStatus,
  type JobApplication,
  type RoleInterviewReport,
} from "@/lib/careers/types";

// Generates the consolidated per-role hiring summary report once per role
// (HR can edit freely afterward — see the PATCH handler in ../route.ts for
// the "edit always writes to report_edit, never overwrites report" model).
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ROLE_REPORT_TOOL = {
  name: "record_role_interview_report",
  description:
    "Records a consolidated hiring summary report for HR, synthesising every candidate who completed the full interview process for one role.",
  input_schema: {
    type: "object" as const,
    properties: {
      executive_summary: {
        type: "string",
        description:
          "A tight 3-6 sentence overview of the hiring round for this role: how many candidates were considered, how competitive the field was, and where things landed — the kind of overview a senior manager would want first.",
      },
      constraints: {
        type: "array",
        description:
          "Concrete constraints or concerns raised in HR notes or panel/interview notes across the candidates who completed the interview — availability dates, salary expectations, disqualifiers, logistical issues, anything that could affect a hiring decision. Empty array if genuinely nothing was flagged.",
        items: { type: "string" },
      },
      recommendation_rationale: {
        type: "string",
        description:
          "2-4 sentences explaining the final hire recommendation, referencing the recommended candidate's ranking and standout points versus the others. If no candidate is currently recommendable (e.g. none are still awaiting a decision, or the field is empty), explain why not instead.",
      },
    },
    required: ["executive_summary", "constraints", "recommendation_rationale"],
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
    const { role_slug } = await req.json();
    if (!role_slug) {
      return NextResponse.json({ error: "role_slug is required." }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("role_interview_reports")
      .select("id")
      .eq("role_slug", role_slug)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "A report has already been generated for this role." },
        { status: 400 },
      );
    }

    const { data: applications, error: fetchError } = await supabaseAdmin
      .from("job_applications")
      .select("*")
      .eq("role_slug", role_slug);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!applications || applications.length === 0) {
      return NextResponse.json(
        { error: "No applicants found for this role." },
        { status: 404 },
      );
    }

    const roleTitle = applications[0].role_title as string;
    const apps = applications as JobApplication[];

    // Reliable now that status_history is logged on every status change —
    // "shortlisted" appearing anywhere in it means they passed the gate,
    // regardless of where they ended up after. Falls back to the current
    // status for rows whose history was only ever seeded with their status
    // at migration time (pre-existing rows, before this log existed) and
    // therefore doesn't capture an earlier "shortlisted" step.
    function wasEverShortlisted(a: JobApplication): boolean {
      if ((a.status_history ?? []).some((h) => h.status === "shortlisted")) return true;
      if (a.status === "applied" || a.status === "under_review") return false;
      if (a.status === "rejected" && isAiFlagged(a)) return false;
      return true;
    }

    // --- Funnel classification -------------------------------------------------
    // "Ever shortlisted" now comes from status_history (see wasEverShortlisted
    // above); the remaining stage-1-vs-completed split still uses the interview
    // setup fields (stage1_invites_sent_at / interview_submitted_at), which were
    // already reliable structured fields rather than heuristics.
    let neverShortlisted = 0;
    let neverStartedInterview = 0;
    let reachedStage1Only = 0;
    let completedFull = 0;
    const completedBreakdown = { still_deciding: 0, hold: 0, rejected: 0, hired: 0 };

    const completedApplicants: JobApplication[] = [];

    for (const a of apps) {
      if (!wasEverShortlisted(a)) {
        neverShortlisted++;
        continue;
      }
      const formData = normalizeInterviewFormData(a.interview_form_data);
      if (a.interview_submitted_at) {
        completedFull++;
        completedApplicants.push(a);
        if (a.status === "evaluation") completedBreakdown.still_deciding++;
        else if (a.status === "hold") completedBreakdown.hold++;
        else if (a.status === "rejected") completedBreakdown.rejected++;
        else if (a.status === "onboarding" || a.status === "offer") completedBreakdown.hired++;
      } else if (formData.setup?.stage1_invites_sent_at) {
        reachedStage1Only++;
      } else {
        neverStartedInterview++;
      }
    }
    const shortlistedTotal = neverStartedInterview + reachedStage1Only + completedFull;

    // --- Ranking (same combined-score ranking used on the Approvals tab) -------
    const rankings = completedApplicants
      .map((a) => ({
        application_id: a.id,
        name: a.full_name,
        reference_number: a.reference_number,
        combined_score: a.interview_form_data?.summary?.total_weighted ?? null,
        status: a.status,
      }))
      .sort((x, y) => {
        if (x.combined_score == null && y.combined_score == null) return 0;
        if (x.combined_score == null) return 1;
        if (y.combined_score == null) return -1;
        return y.combined_score - x.combined_score;
      })
      .map((r, i) => ({ ...r, rank: i + 1 }));

    // Only a candidate still actively awaiting a decision (Evaluation status)
    // can be recommended — Hold/Rejected have already been decided, Hired
    // ones don't need a recommendation.
    const topUndecided = rankings.find((r) => r.status === "evaluation") ?? null;

    // --- Embedded individual reports (this role report = the individual
    // reports plus the role-level information above) ---------------------------
    const candidateReports = completedApplicants.map((a) => {
      const formData = normalizeInterviewFormData(a.interview_form_data);
      return {
        application_id: a.id,
        name: a.full_name,
        reference_number: a.reference_number,
        report: formData.summary?.interview_report_edit ?? formData.summary?.interview_report ?? null,
      };
    });

    // --- Source material for the AI (HR notes + each candidate's own report) ---
    const candidateBlocks = completedApplicants.map((a) => {
      const formData = normalizeInterviewFormData(a.interview_form_data);
      const report = formData.summary?.interview_report_edit ?? formData.summary?.interview_report;
      const lines = [
        `— ${a.full_name} (Ref ${a.reference_number}), status: ${a.status}, combined score: ${
          formData.summary?.total_weighted?.toFixed(2) ?? "—"
        }/5`,
      ];
      if (a.hr_notes?.trim()) lines.push(`  HR notes: ${a.hr_notes.trim()}`);
      if (report) {
        lines.push(`  Executive summary: ${report.executive_summary}`);
        if (report.key_observations.strengths.length) {
          lines.push(`  Strengths: ${report.key_observations.strengths.join("; ")}`);
        }
        if (report.key_observations.weaknesses.length) {
          lines.push(`  Weaknesses: ${report.key_observations.weaknesses.join("; ")}`);
        }
        lines.push(`  Panel observations: ${report.key_observations.summary}`);
      } else {
        lines.push("  (No individual comprehensive report was generated for this candidate.)");
      }
      return lines.join("\n");
    });

    const prompt = [
      `You are writing a consolidated hiring summary for Wills Farms' Human Capital team, for the role "${roleTitle}".`,
      `${completedFull} candidate(s) completed the full interview process for this role. Combined-score ranking (highest first):`,
      rankings
        .map((r) => `${r.rank}. ${r.name} (Ref ${r.reference_number}) — ${r.status}, score ${r.combined_score?.toFixed(2) ?? "—"}/5`)
        .join("\n"),
      topUndecided
        ? `The highest-ranked candidate still awaiting a decision (Evaluation status) is ${topUndecided.name} (Ref ${topUndecided.reference_number}), score ${topUndecided.combined_score?.toFixed(2) ?? "—"}/5. Your recommendation should generally back this candidate unless the notes below give clear reason not to — in that case say so plainly.`
        : "No candidate for this role is currently awaiting a decision (Evaluation status) — say plainly that there is no one to recommend right now.",
      "Per-candidate detail (HR notes and their own interview report, where one exists):",
      ...candidateBlocks,
      "Using the record_role_interview_report tool, produce the executive summary, any constraints flagged in the notes above, and the recommendation rationale.",
    ].join("\n\n");

    const message = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 2000,
      tools: [ROLE_REPORT_TOOL],
      tool_choice: { type: "tool", name: "record_role_interview_report" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const result = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};

    const executiveSummary = typeof result.executive_summary === "string" ? result.executive_summary : "";
    if (!executiveSummary) {
      return NextResponse.json({ error: "AI did not return a report." }, { status: 502 });
    }

    const report: RoleInterviewReport = {
      generated_at: new Date().toISOString(),
      role_slug,
      role_title: roleTitle,
      funnel: {
        total_applicants: apps.length,
        never_shortlisted: neverShortlisted,
        shortlisted_total: shortlistedTotal,
        never_started_interview: neverStartedInterview,
        reached_stage1_only: reachedStage1Only,
        completed_full_interview: completedFull,
        completed_breakdown: completedBreakdown,
      },
      executive_summary: executiveSummary,
      constraints: Array.isArray(result.constraints)
        ? (result.constraints as unknown[]).filter((c): c is string => typeof c === "string")
        : [],
      candidate_rankings: rankings.map((r) => ({
        application_id: r.application_id,
        name: r.name,
        reference_number: r.reference_number,
        rank: r.rank,
        combined_score: r.combined_score,
        status: r.status as ApplicationStatus,
      })),
      candidate_reports: candidateReports,
      final_recommendation: {
        application_id: topUndecided?.application_id ?? null,
        candidate_name: topUndecided?.name ?? null,
        reference_number: topUndecided?.reference_number ?? null,
        rationale:
          typeof result.recommendation_rationale === "string" ? result.recommendation_rationale : "",
      },
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("role_interview_reports")
      .insert({
        role_slug,
        role_title: roleTitle,
        report,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: inserted });
  } catch (err) {
    console.error("[POST /api/careers/interview/role-report/generate]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
