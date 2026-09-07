import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchModuleBusinessLogic } from "@/lib/systemDefinitions/getModuleConfig";
import { resolveInterviewGuideFromConfig } from "@/lib/systemDefinitions/interviewGuidesConfig";
import { resolveInterviewEvaluationLabels } from "@/lib/systemDefinitions/interviewEvaluationConfig";
import { resolveInterviewBenchmarks } from "@/lib/systemDefinitions/interviewBenchmarksConfig";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

/**
 * One-time (safely re-runnable) migration: copies each currently-open job
 * posting's existing shared, grade-keyed interview guide (resolved via its
 * own `interview_guide_key` column, defaulting to "L1" — same key every
 * posting has carried since creation, previously unused at runtime) into
 * that posting's own Interview setup (interview_description/
 * interview_panel_members/interview_duration_minutes/interview_setup).
 * This runs once, triggered from a button on Create job posting, so
 * postings already in flight keep working once real interviews start
 * reading from their own Interview setup instead of the shared guide
 * (see fetchPostingInterviewContext.ts).
 *
 * Idempotent: a posting is skipped once it already has ANY Interview setup
 * content of its own (from this backfill or from HR filling it in
 * manually), so this is safe to click more than once.
 */
export async function POST() {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const { data: postings, error } = await supabaseAdmin
      .from("job_postings")
      .select(
        "id, interview_guide_key, interview_description, interview_panel_members, interview_duration_minutes, interview_setup",
      )
      .is("archived_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const businessLogic = await fetchModuleBusinessLogic(supabaseAdmin, RECRUITMENT_MODULE_ID);
    const guidesConfig = businessLogic.interviewGuidesConfig;
    const evaluationLabels = resolveInterviewEvaluationLabels(
      businessLogic.interviewEvaluationConfig,
    );
    const benchmarks = resolveInterviewBenchmarks(businessLogic.interviewBenchmarksConfig);

    let updated = 0;
    let skipped = 0;

    for (const posting of postings ?? []) {
      const alreadyHasSetup =
        !!posting.interview_description?.trim() ||
        !!posting.interview_panel_members?.trim() ||
        posting.interview_duration_minutes != null ||
        hasAnyContent(posting.interview_setup);

      if (alreadyHasSetup) {
        skipped += 1;
        continue;
      }

      const guideKey = posting.interview_guide_key?.trim() || "L1";
      const guide = resolveInterviewGuideFromConfig(guideKey, guidesConfig);
      if (!guide) {
        skipped += 1;
        continue;
      }

      const durationMinutes = parseApproximateDurationMinutes(guide.duration);
      const disqualifiers =
        guide.disqualifierItems ??
        (guide.disqualifiers ?? []).map((label, i) => ({ id: `dq_${i}`, label }));

      // The old shared guide's hand-curated area weights (e.g. "B1 Motivation
      // & trainability" 20%, "Practical assessment" 15%) carry over here so
      // a backfilled posting scores exactly as it used to, rather than
      // falling back to an equal split across sections. Each weight row's
      // ids are either all scenario ids or all question ids (never mixed),
      // so which map it belongs in is decided by checking against the
      // guide's own scenario id set.
      const scenarioIds = new Set((guide.scenarios ?? []).map((s) => s.id));
      const questionSections: Record<string, number> = {};
      const scenarioSections: Record<string, number> = {};
      for (const row of guide.weights ?? []) {
        const isScenarioRow =
          row.questionIds.length > 0 && row.questionIds.every((id) => scenarioIds.has(id));
        if (isScenarioRow) {
          scenarioSections[row.area] = row.weight;
        } else {
          questionSections[row.area] = row.weight;
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from("job_postings")
        .update({
          interview_description: guide.briefing || null,
          interview_panel_members: guide.recommendedPanel || null,
          interview_duration_minutes: durationMinutes,
          interview_setup: {
            screening: guide.screening ?? [],
            questions: guide.questions ?? [],
            scenarios: guide.scenarios ?? [],
            disqualifiers,
            ratingLabels: guide.ratingLabels ?? {},
            evaluationLabels: {
              observedLabel: evaluationLabels.observed,
              notObservedLabel: evaluationLabels.notObserved,
            },
            benchmarks,
            extraStages: guidesConfig?.extraStages ?? [],
            weights: { questionSections, scenarioSections },
          },
        })
        .eq("id", posting.id);

      if (updateError) {
        console.error(
          "[POST /api/careers/postings/backfill-interview-setup]",
          posting.id,
          updateError,
        );
        skipped += 1;
        continue;
      }

      updated += 1;
    }

    return NextResponse.json({
      success: true,
      data: { total: postings?.length ?? 0, updated, skipped },
    });
  } catch (err) {
    console.error("[POST /api/careers/postings/backfill-interview-setup]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function hasAnyContent(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  return (
    (Array.isArray(obj.screening) && obj.screening.length > 0) ||
    (Array.isArray(obj.questions) && obj.questions.length > 0) ||
    (Array.isArray(obj.scenarios) && obj.scenarios.length > 0) ||
    (Array.isArray(obj.disqualifiers) && obj.disqualifiers.length > 0) ||
    (Array.isArray(obj.extraStages) && obj.extraStages.length > 0)
  );
}

/** Best-effort: pulls the first number out of a free-text duration like "45–60 min interview + 45–60 min practical" and clamps/rounds it to the 30-60, 5-minute-step range the new Approximate duration field uses. Falls back to null (HR fills it in) when nothing parses. */
function parseApproximateDurationMinutes(duration: string | undefined): number | null {
  if (!duration) return null;
  const match = duration.match(/\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(60, Math.max(30, n));
  return Math.round(clamped / 5) * 5;
}
