import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import {
  isAiFlagged,
  normalizeInterviewFormData,
  STATUS_LABELS,
  type JobApplication,
  type RoleInterviewReport,
} from "@/lib/careers/types";
import { stageMembers, combinedAreaScores } from "@/lib/careers/panelInterview";
import { resolveInterviewGuideKey } from "@/lib/careers/jobPostingOptions";
import { fetchResolvedInterviewGuide } from "@/lib/careers/fetchResolvedInterviewGuide";
import { getAppBaseUrl, recruitmentInterviewUrl } from "@/lib/appUrl";

// Generates the consolidated hiring summary report for one specific hiring
// round (job_posting_id) — not the role as a whole. A role can be posted
// more than once over time (filled, then reopened months later); each
// posting is its own round with its own applicants, and reports must not
// mix rounds together. Can be run more than once for the same round — each
// run overwrites that round's AI-generated `report` with a fresh one built
// from the applicants' current state, and clears out any HR edit
// (report_edit/report_edit_log) so the edit history doesn't linger against
// a report it no longer describes. Reopening the role for a new round
// creates a brand-new report row instead, keyed to the new job_posting_id —
// it never touches the previous round's saved report. Between generations,
// HR can edit freely — see the PATCH handler in ../route.ts for the "edit
// always writes to report_edit, never overwrites report" model.
//
// This report exists to make the final hire decision, so everything that
// drives that decision (ranking, competency/observation tables, final
// recommendation) only ever considers candidates currently in Evaluation
// status — anyone already Hold/Rejected/Hired has a decision already and
// isn't part of "who do we hire now". The funnel and full applicant roster
// are the exception: those cover every applicant for this round, at any
// status, as pipeline-wide context — still scoped to this one round only.
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
      decision_histories: {
        type: "array",
        description:
          "One entry per candidate listed under 'Decision history' below — do not add entries for any candidate not listed there, and do not skip any that are. For each, write a 2-4 sentence narrative telling the story of that candidate's status changes using the specific HR notes given — e.g. how AI screening flagged them, what management or HR intervened to request and why, and how that led to their eventual outcome. Write it as an account of what happened, not a bare list of status changes.",
        items: {
          type: "object",
          properties: {
            application_id: { type: "string" },
            summary: { type: "string" },
          },
          required: ["application_id", "summary"],
        },
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
    const { job_posting_id } = await req.json();
    if (!job_posting_id) {
      return NextResponse.json({ error: "job_posting_id is required." }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("role_interview_reports")
      .select("id")
      .eq("job_posting_id", job_posting_id)
      .maybeSingle();

    // Scoped to this specific hiring round only — not every applicant who
    // ever applied under this role name. See docs/careers/role_interview_reports.sql.
    const { data: applications, error: fetchError } = await supabaseAdmin
      .from("job_applications")
      .select("*")
      .eq("job_posting_id", job_posting_id);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!applications || applications.length === 0) {
      return NextResponse.json(
        { error: "No applicants found for this hiring round." },
        { status: 404 },
      );
    }

    const roleTitle = applications[0].role_title as string;
    const role_slug = applications[0].role_slug as string;
    const apps = applications as JobApplication[];

    const guideKey = await resolveInterviewGuideKey(supabaseAdmin, role_slug);
    const guide = await fetchResolvedInterviewGuide(supabaseAdmin, guideKey);

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

    const applicantRoster: RoleInterviewReport["applicant_roster"] = [];
    const candidateLinks: RoleInterviewReport["candidate_links"] = [];
    // Combined (both stages) panel/location per applicant — used only as
    // context fed to the AI prompt below, independent of the per-stage
    // roster breakdown.
    const combinedPanelInfo = new Map<string, { panelNames: string[]; location: string | null }>();

    for (const a of apps) {
      const formData = normalizeInterviewFormData(a.interview_form_data);
      const everShortlisted = wasEverShortlisted(a);
      const stage1Members = stageMembers(formData, 1);
      const stage2Members = stageMembers(formData, 2);
      const stage1Names = stage1Members.map((m) => m.name).filter(Boolean);
      const stage2Names = stage2Members.map((m) => m.name).filter(Boolean);
      const stage1Unavailable = stage1Members.filter((m) => m.unavailable && m.name.trim()).map((m) => m.name);
      const stage2Unavailable = stage2Members.filter((m) => m.unavailable && m.name.trim()).map((m) => m.name);
      const stage1Location =
        formData.setup?.location_type === "onsite"
          ? formData.setup?.location ?? null
          : formData.setup?.location_type === "online"
            ? "Online"
            : null;
      const stage2Location =
        formData.setup?.stage2_location_type === "onsite"
          ? formData.setup?.stage2_location ?? null
          : formData.setup?.stage2_location_type === "online"
            ? "Online"
            : null;

      combinedPanelInfo.set(a.id, {
        panelNames: Array.from(new Set([...stage1Names, ...stage2Names])),
        location: formData.setup?.stage2_location ?? formData.setup?.location ?? null,
      });

      const stage1InvitesSent = !!formData.setup?.stage1_invites_sent_at;
      const stage2InvitesSent = !!formData.setup?.stage2_invites_sent_at;
      const finalized = !!a.interview_submitted_at;

      // Funnel counters — unchanged definitions from before this breakdown existed.
      if (!everShortlisted) {
        neverShortlisted++;
      } else if (finalized) {
        completedFull++;
      } else if (stage1InvitesSent) {
        reachedStage1Only++;
      } else {
        neverStartedInterview++;
      }

      // Most recent "rejected" status change, if any. By the time this report
      // is generated, interviews for the round are done and management is
      // deliberating — so anyone still sitting in Application/Screening/
      // Stage 1/Stage 2 (rather than Evaluation) has effectively been passed
      // over, and that table's date column shows when they were rejected
      // rather than when they merely reached that stage. Falls back to the
      // original "reached this stage" date for the rare case a candidate
      // ended up in one of these buckets without a formal rejection entry.
      const rejectedAt = [...(a.status_history ?? [])]
        .reverse()
        .find((h) => h.status === "rejected")?.changed_at;

      // Furthest-stage-reached bucket for the "All Applicants" breakdown —
      // a separate classification from the funnel counters above. Stage 2
      // covers anyone who reached Stage 2 and either hasn't finished yet or
      // was rejected there; Evaluation covers anyone who finished the full
      // interview without being rejected (Evaluation, Hold, Offer, Onboarding).
      let stage: RoleInterviewReport["applicant_roster"][number]["stage"];
      let date: string | null;
      let panelNames: string[] = [];
      let unavailableNames: string[] = [];
      let location: string | null = null;

      if (!everShortlisted) {
        stage = "application";
        date = rejectedAt ?? a.created_at ?? null;
      } else if (!stage1InvitesSent) {
        stage = "screening";
        date =
          rejectedAt ??
          (a.status_history ?? []).find((h) => h.status === "shortlisted")?.changed_at ??
          a.created_at ??
          null;
      } else if (finalized && a.status !== "rejected") {
        stage = "evaluation";
        date = a.interview_submitted_at ?? null;
      } else if (stage2InvitesSent) {
        stage = "interview_stage2";
        panelNames = stage2Names;
        unavailableNames = stage2Unavailable;
        location = stage2Location;
        date = rejectedAt ?? formData.setup?.stage2_scheduled_at ?? null;
      } else {
        stage = "interview_stage1";
        panelNames = stage1Names;
        unavailableNames = stage1Unavailable;
        location = stage1Location;
        date = rejectedAt ?? formData.setup?.interview_start_at ?? null;
      }

      applicantRoster.push({
        application_id: a.id,
        name: a.full_name,
        stage,
        date,
        panel_names: panelNames,
        unavailable_panel_names: unavailableNames,
        location,
        rank: null, // filled in once candidate_rankings is computed, below
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

    // Join rank into the roster now that rankings are computed — only ever
    // set for applicants currently in Evaluation status.
    const rankByAppId = new Map(rankings.map((r) => [r.application_id, r.rank]));
    for (const r of applicantRoster) {
      r.rank = rankByAppId.get(r.application_id) ?? null;
    }

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
      const panelInfo = combinedPanelInfo.get(a.id);
      const lines = [
        `— ${a.full_name} (Ref ${a.reference_number}), combined score: ${
          formData.summary?.total_weighted?.toFixed(2) ?? "—"
        }/5`,
        `  Panel: ${panelInfo?.panelNames.length ? panelInfo.panelNames.join(", ") : "—"}. Location: ${panelInfo?.location ?? "—"}.`,
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

    // --- Decision history — every applicant for this round (any status,
    // not just Evaluation) who has at least one status change with an HR
    // note attached. Told as a narrative per candidate, not a raw list —
    // covers the whole pipeline since a note justifying a rejection or a
    // management-requested reinstatement is worth recording regardless of
    // where the candidate ended up.
    const decisionHistoryCandidates = apps.filter((a) =>
      (a.status_history ?? []).some((h) => h.note?.trim()),
    );
    const decisionHistoryBlocks = decisionHistoryCandidates.map((a) => {
      const historyLines = (a.status_history ?? []).map((h) => {
        const label = STATUS_LABELS[h.status] ?? h.status;
        const when = new Date(h.changed_at).toLocaleDateString();
        const noteText = h.note?.trim() ? ` — HR note: "${h.note.trim()}"` : "";
        return `    ${label} (${when})${noteText}`;
      });
      return [`— ${a.full_name} (Ref ${a.reference_number}), application_id ${a.id}:`, ...historyLines].join(
        "\n",
      );
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
      ...(decisionHistoryBlocks.length > 0
        ? [
            [
              "Decision history — for every candidate in this round (any status, not just those awaiting a decision) who has at least one status change with an HR note recorded, their status changes in chronological order:",
              ...decisionHistoryBlocks,
            ].join("\n\n"),
          ]
        : []),
      "Using the record_role_interview_report tool: write the executive summary so it names the standout candidate and why; synthesise the core-competencies and key-observations summaries across these candidates; list any constraints flagged in the notes above; and in the recommendation rationale, explicitly compare the top candidate's specific strengths against the specific weaknesses or gaps of the next 1-2 highest-ranked candidates, by name, so the case for the recommendation is unambiguous.",
    ].join("\n\n");

    const message = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 3500,
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

    const decisionHistoriesRaw = Array.isArray(result.decision_histories)
      ? (result.decision_histories as { application_id?: unknown; summary?: unknown }[])
      : [];
    const decisionHistoryByAppId = new Map(
      decisionHistoriesRaw
        .filter((h) => typeof h.application_id === "string" && typeof h.summary === "string")
        .map((h) => [h.application_id as string, h.summary as string]),
    );
    const decisionHistoryTable: NonNullable<RoleInterviewReport["decision_history_table"]> =
      decisionHistoryCandidates
        .map((a) => ({
          application_id: a.id,
          name: a.full_name,
          summary: decisionHistoryByAppId.get(a.id) ?? "",
        }))
        .filter((entry) => entry.summary);

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
      decision_history_table: decisionHistoryTable,
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
          .eq("job_posting_id", job_posting_id)
          .select()
          .single()
      : await supabaseAdmin
          .from("role_interview_reports")
          .insert({
            role_slug,
            role_title: roleTitle,
            job_posting_id,
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
