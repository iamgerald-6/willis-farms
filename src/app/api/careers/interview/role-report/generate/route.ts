import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import {
  isAiFlagged,
  normalizeInterviewFormData,
  type JobApplication,
  type RoleInterviewReport,
} from "@/lib/careers/types";
import { stageMembers, combinedAreaScores } from "@/lib/careers/panelInterview";
import { resolveInterviewGuideKey } from "@/lib/careers/jobPostingOptions";
import { getInterviewGuide } from "@/lib/careers/interviewFormConfigs";
import { getAppBaseUrl, recruitmentInterviewUrl } from "@/lib/appUrl";

// Generates the consolidated per-role hiring summary report for a role. Can
// be run more than once — each run overwrites the AI-generated `report` with
// a fresh one built from the applicants' current state, and clears out any
// HR edit (report_edit/report_edit_log) so the edit history doesn't linger
// against a report it no longer describes. Between generations, HR can edit
// freely — see the PATCH handler in ../route.ts for the "edit always writes
// to report_edit, never overwrites report" model.
//
// This report exists to make the final hire decision, so everything that
// drives that decision (ranking, competency/observation tables, final
// recommendation) only ever considers candidates currently in Evaluation
// status — anyone already Hold/Rejected/Hired has a decision already and
// isn't part of "who do we hire now". The funnel and full applicant roster
// are the exception: those cover every applicant for the role, at any
// status, as pipeline-wide context.
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ROLE_REPORT_TOOL = {
  name: "record_role_interview_report",
  description:
    "Records a consolidated hiring summary report for HR, synthesising every candidate currently awaiting a decision for one role.",
  input_schema: {
    type: "object" as const,
    properties: {
      executive_summary: {
        type: "string",
        description:
          "A 4-7 sentence overview the head of the business could read on its own and know everything that matters about this hiring round without attending a single interview: how many candidates are in the running, how competitive the field is, who the standout candidate is and the single biggest reason why, and where things currently stand. Write it as a briefing on what happened in the interviews, not as a decision already made.",
      },
      core_competencies_summary: {
        type: "string",
        description:
          "2-4 sentences synthesising how the candidates still in the running compare on core competencies overall — where the field was strong, where it was weak or inconsistent, and any area that clearly separated the leader from the rest.",
      },
      key_observations_summary: {
        type: "string",
        description:
          "2-4 sentences synthesising the strengths and weaknesses across all candidates still in the running — recurring themes, and what most differentiates the leading candidate(s) from the others.",
      },
      constraints: {
        type: "array",
        description:
          "Concrete constraints or concerns raised in HR notes across the candidates still awaiting a decision — availability dates, salary expectations, disqualifiers, logistical issues, anything that could affect a hiring decision. Empty array if genuinely nothing was flagged.",
        items: { type: "string" },
      },
      recommendation_rationale: {
        type: "string",
        description:
          "3-6 sentences making the explicit case for why the recommended candidate is the best choice — name their specific standout strengths, then directly contrast them against the next 1-2 highest-ranked candidates' specific weaknesses or gaps by name, so a reader who never sat in on the interviews understands exactly why this candidate won out. If no candidate is currently recommendable (e.g. none are still awaiting a decision), explain why not instead.",
      },
    },
    required: [
      "executive_summary",
      "core_competencies_summary",
      "key_observations_summary",
      "constraints",
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
    const { role_slug } = await req.json();
    if (!role_slug) {
      return NextResponse.json({ error: "role_slug is required." }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("role_interview_reports")
      .select("id")
      .eq("role_slug", role_slug)
      .maybeSingle();

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

    const guideKey = await resolveInterviewGuideKey(supabaseAdmin, role_slug);
    const guide = guideKey ? getInterviewGuide(guideKey) : null;

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

    // --- 2. Applicant funnel + 4. full roster — every applicant, any status ---
    let neverShortlisted = 0;
    let neverStartedInterview = 0;
    let reachedStage1Only = 0;
    let completedFull = 0;

    const COMPLETED_STAGE_LABEL: Record<string, string> = {
      evaluation: "Completed — Evaluation",
      hold: "Completed — Hold",
      rejected: "Completed — Rejected",
      onboarding: "Completed — Hired",
      offer: "Completed — Hired",
    };

    const applicantRoster: RoleInterviewReport["applicant_roster"] = [];
    const candidateLinks: RoleInterviewReport["candidate_links"] = [];

    for (const a of apps) {
      const formData = normalizeInterviewFormData(a.interview_form_data);
      const everShortlisted = wasEverShortlisted(a);
      const stage1Names = stageMembers(formData, 1).map((m) => m.name).filter(Boolean);
      const stage2Names = stageMembers(formData, 2).map((m) => m.name).filter(Boolean);
      const panelNames = Array.from(new Set([...stage1Names, ...stage2Names]));
      const location = formData.setup?.stage2_location ?? formData.setup?.location ?? null;
      const interviewDate = formData.setup?.stage2_scheduled_at ?? formData.setup?.interview_start_at ?? null;

      let stageReached: string;
      if (!everShortlisted) {
        neverShortlisted++;
        stageReached = "Never shortlisted";
      } else if (a.interview_submitted_at) {
        completedFull++;
        stageReached = COMPLETED_STAGE_LABEL[a.status] ?? `Completed — ${a.status}`;
      } else if (formData.setup?.stage1_invites_sent_at) {
        reachedStage1Only++;
        stageReached = "Reached Stage 1";
      } else {
        neverStartedInterview++;
        stageReached = "Shortlisted — interview not started";
      }

      applicantRoster.push({
        application_id: a.id,
        name: a.full_name,
        role_title: a.role_title,
        stage_reached: stageReached,
        panel_names: panelNames,
        interview_date: interviewDate,
        location,
        stage1_rating: formData.summary?.stage1_average ?? null,
        stage2_rating: formData.summary?.stage2_average ?? null,
      });

      // Appendix links — only meaningful once at least one interview stage happened.
      if (formData.setup?.stage1_invites_sent_at) {
        const individualReport = formData.summary?.interview_report_edit ?? formData.summary?.interview_report;
        candidateLinks.push({
          application_id: a.id,
          name: a.full_name,
          reference_number: a.reference_number,
          panel_forms_url: recruitmentInterviewUrl(a.id),
          individual_report_url: individualReport
            ? `${getAppBaseUrl()}/api/careers/interview/report/pdf?application_id=${a.id}`
            : null,
        });
      }
    }
    const shortlistedTotal = neverStartedInterview + reachedStage1Only + completedFull;

    // --- 3. Candidate ranking — Evaluation status only (who's still in the running) ---
    const evaluationApplicants = apps.filter((a) => a.status === "evaluation");

    const rankings = evaluationApplicants
      .map((a) => ({
        application_id: a.id,
        name: a.full_name,
        reference_number: a.reference_number,
        combined_score: a.interview_form_data?.summary?.total_weighted ?? null,
      }))
      .sort((x, y) => {
        if (x.combined_score == null && y.combined_score == null) return 0;
        if (x.combined_score == null) return 1;
        if (y.combined_score == null) return -1;
        return y.combined_score - x.combined_score;
      })
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const topCandidate = rankings[0] ?? null;

    // --- 5 & 6. Core competencies + key observations tables — Evaluation status only ---
    const coreCompetenciesTable = evaluationApplicants.map((a) => {
      const formData = normalizeInterviewFormData(a.interview_form_data);
      const report = formData.summary?.interview_report_edit ?? formData.summary?.interview_report;
      const competencies = report
        ? report.core_competencies
        : guide
          ? guide.weights.map((w) => ({
              area: w.area,
              score: combinedAreaScores(formData, guide)[w.area] ?? null,
              assessment: "",
            }))
          : [];
      return { application_id: a.id, name: a.full_name, competencies };
    });

    const keyObservationsTable = evaluationApplicants.map((a) => {
      const formData = normalizeInterviewFormData(a.interview_form_data);
      const report = formData.summary?.interview_report_edit ?? formData.summary?.interview_report;
      return {
        application_id: a.id,
        name: a.full_name,
        strengths: report?.key_observations.strengths ?? [],
        weaknesses: report?.key_observations.weaknesses ?? [],
      };
    });

    // --- Source material for the AI (HR notes + each still-deciding candidate's own report) ---
    const candidateBlocks = evaluationApplicants.map((a) => {
      const formData = normalizeInterviewFormData(a.interview_form_data);
      const report = formData.summary?.interview_report_edit ?? formData.summary?.interview_report;
      const roster = applicantRoster.find((r) => r.application_id === a.id);
      const lines = [
        `— ${a.full_name} (Ref ${a.reference_number}), combined score: ${
          formData.summary?.total_weighted?.toFixed(2) ?? "—"
        }/5`,
        `  Panel: ${roster?.panel_names.length ? roster.panel_names.join(", ") : "—"}. Location: ${roster?.location ?? "—"}.`,
      ];
      if (a.hr_notes?.trim()) lines.push(`  HR notes: ${a.hr_notes.trim()}`);
      if (report) {
        lines.push(`  Executive summary: ${report.executive_summary}`);
        if (report.core_competencies.length) {
          lines.push(
            `  Core competencies: ${report.core_competencies
              .map((c) => `${c.area} ${c.score?.toFixed(2) ?? "—"}/5 — ${c.assessment}`)
              .join("; ")}`,
          );
        }
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
      `You are writing a hiring summary for the head of the business at Wills Farms, covering the interviews conducted so far for the role "${roleTitle}". No hiring decision has been made yet for these candidates — this report exists to inform that decision, not to record one, so write it as an account of what happened during the interviews, not as an announcement of an outcome. It only concerns candidates who have finished their interview and are still waiting to hear whether they've got the role. The reader will not have attended any interviews — your job is to make sure they understand everything that matters from this report alone, so they can decide who to hire and who not to hire.`,
      `${evaluationApplicants.length} candidate(s) are awaiting a decision for this role. Combined-score ranking (highest first):`,
      rankings.length
        ? rankings
            .map((r) => `${r.rank}. ${r.name} (Ref ${r.reference_number}) — score ${r.combined_score?.toFixed(2) ?? "—"}/5`)
            .join("\n")
        : "(none)",
      topCandidate
        ? `The highest-ranked candidate is ${topCandidate.name} (Ref ${topCandidate.reference_number}), score ${topCandidate.combined_score?.toFixed(2) ?? "—"}/5. Your recommendation should generally back this candidate unless the notes below give clear reason not to — in that case say so plainly.`
        : "No candidate for this role is currently awaiting a decision — say plainly that there is no one to recommend right now.",
      "Per-candidate detail (panel, location, HR notes, and their own interview report, where one exists):",
      ...candidateBlocks,
      "Using the record_role_interview_report tool: write the executive summary so it names the standout candidate and why; synthesise the core-competencies and key-observations summaries across these candidates; list any constraints flagged in the notes above; and in the recommendation rationale, explicitly compare the top candidate's specific strengths against the specific weaknesses or gaps of the next 1-2 highest-ranked candidates, by name, so the case for the recommendation is unambiguous.",
    ].join("\n\n");

    const message = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 2500,
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
      executive_summary: executiveSummary,
      funnel: {
        total_applicants: apps.length,
        never_shortlisted: neverShortlisted,
        shortlisted_total: shortlistedTotal,
        never_started_interview: neverStartedInterview,
        reached_stage1_only: reachedStage1Only,
        completed_full_interview: completedFull,
      },
      candidate_rankings: rankings,
      applicant_roster: applicantRoster,
      core_competencies_summary:
        typeof result.core_competencies_summary === "string" ? result.core_competencies_summary : "",
      core_competencies_table: coreCompetenciesTable,
      key_observations_summary:
        typeof result.key_observations_summary === "string" ? result.key_observations_summary : "",
      key_observations_table: keyObservationsTable,
      constraints: Array.isArray(result.constraints)
        ? (result.constraints as unknown[]).filter((c): c is string => typeof c === "string")
        : [],
      final_recommendation: {
        application_id: topCandidate?.application_id ?? null,
        candidate_name: topCandidate?.name ?? null,
        reference_number: topCandidate?.reference_number ?? null,
        rationale:
          typeof result.recommendation_rationale === "string" ? result.recommendation_rationale : "",
      },
      candidate_links: candidateLinks,
    };

    const { data: saved, error: saveError } = existing
      ? await supabaseAdmin
          .from("role_interview_reports")
          .update({
            role_title: roleTitle,
            report,
            report_edit: null,
            report_edit_log: [],
            updated_at: new Date().toISOString(),
          })
          .eq("role_slug", role_slug)
          .select()
          .single()
      : await supabaseAdmin
          .from("role_interview_reports")
          .insert({
            role_slug,
            role_title: roleTitle,
            report,
          })
          .select()
          .single();

    if (saveError) {
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: saved });
  } catch (err) {
    console.error("[POST /api/careers/interview/role-report/generate]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
