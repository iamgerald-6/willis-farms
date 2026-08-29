import { randomBytes } from "crypto";
import {
  computeStage1Score,
  computeStage2Score,
  type InterviewGuideConfig,
} from "@/lib/careers/interviewFormConfigs";
import type {
  InterviewFormData,
  InterviewLocationType,
  PanelMember,
  PanelSubmission,
  StageSubmissionData,
} from "@/lib/careers/types";

/** "Onsite interview date" / "Online interview date" — falls back to plain
 * "Interview date" for records saved before onsite/online was tracked. */
export function stageDateLabel(locationType?: InterviewLocationType | null): string {
  if (locationType === "online") return "Online interview date";
  if (locationType === "onsite") return "Onsite interview date";
  return "Interview date";
}

export function generatePanelAccessToken(): string {
  return randomBytes(24).toString("hex");
}

export function createPanelMember(
  name: string,
  email: string,
  stage: 1 | 2,
): PanelMember {
  return {
    id: randomBytes(8).toString("hex"),
    name: name.trim(),
    email: email.trim(),
    stage,
    access_token: generatePanelAccessToken(),
  };
}

export function allPanelMembers(data: InterviewFormData): PanelMember[] {
  const setup = data.setup;
  return [
    ...(setup?.stage1_members ?? setup?.members ?? []),
    ...(setup?.stage2_members ?? []),
  ];
}

export function stageMembers(
  data: InterviewFormData,
  stage: 1 | 2,
): PanelMember[] {
  const setup = data.setup;
  if (stage === 1) {
    return setup?.stage1_members?.length
      ? setup.stage1_members
      : setup?.members ?? [];
  }
  return setup?.stage2_members ?? [];
}

export function findMemberByToken(
  data: InterviewFormData,
  token: string,
): PanelMember | null {
  return allPanelMembers(data).find((m) => m.access_token === token) ?? null;
}

export function getSubmission(
  data: InterviewFormData,
  memberId: string,
  stage: 1 | 2,
): PanelSubmission | undefined {
  return data.panel_submissions?.find(
    (s) => s.member_id === memberId && s.stage === stage,
  );
}

export function isSubmissionComplete(sub?: StageSubmissionData): boolean {
  return !!sub?.submitted_at;
}

export function allStage1PanelComplete(data: InterviewFormData): boolean {
  const members = stageMembers(data, 1).filter((m) => !m.unavailable);
  if (members.length === 0) return false;
  return members.every((m) =>
    isSubmissionComplete(getSubmission(data, m.id, 1)),
  );
}

export function allStage2PanelComplete(data: InterviewFormData): boolean {
  const members = stageMembers(data, 2).filter((m) => !m.unavailable);
  if (members.length === 0) return false;
  return members.every((m) =>
    isSubmissionComplete(getSubmission(data, m.id, 2)),
  );
}

export function hrStage1Complete(data: InterviewFormData): boolean {
  return isSubmissionComplete(data.hr_submission?.stage1);
}

export function hrStage2Complete(data: InterviewFormData): boolean {
  return isSubmissionComplete(data.hr_submission?.stage2);
}

export function scoreSubmission(
  guide: InterviewGuideConfig,
  submission: StageSubmissionData,
  stage: 1 | 2,
) {
  if (stage === 1) {
    return computeStage1Score(guide, submission.question_ratings ?? {});
  }
  return computeStage2Score(guide, submission.scenario_ratings ?? {});
}

export type GraderResult = {
  id: string;
  label: string;
  role: "panel" | "hr";
  stage: 1 | 2;
  total: number | null;
  submitted_at?: string;
  /** Marked unable to attend this round — excluded from the completion check, shown as such instead of "Pending". */
  unavailable?: boolean;
};

export function gradersForStage(
  data: InterviewFormData,
  guide: InterviewGuideConfig,
  stage: 1 | 2,
): GraderResult[] {
  const results: GraderResult[] = [];

  for (const member of stageMembers(data, stage)) {
    const sub = getSubmission(data, member.id, stage);
    const scored = sub ? scoreSubmission(guide, sub, stage) : { total: null };
    results.push({
      id: member.id,
      label: member.name,
      role: "panel",
      stage,
      total: scored.total,
      submitted_at: sub?.submitted_at,
      unavailable: member.unavailable,
    });
  }

  const hrSub = stage === 1 ? data.hr_submission?.stage1 : data.hr_submission?.stage2;
  if (hrSub) {
    const scored = scoreSubmission(guide, hrSub, stage);
    results.push({
      id: "hr",
      label: "HR",
      role: "hr",
      stage,
      total: scored.total,
      submitted_at: hrSub.submitted_at,
    });
  }

  return results;
}

export function averageScore(totals: (number | null)[]): number | null {
  const valid = totals.filter((t): t is number => t != null);
  if (valid.length === 0) return null;
  return (
    Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100
  );
}

export function stageAverage(
  data: InterviewFormData,
  guide: InterviewGuideConfig,
  stage: 1 | 2,
): number | null {
  const graders = gradersForStage(data, guide, stage);
  return averageScore(graders.map((g) => g.total));
}

export function stage1ReadyForReview(data: InterviewFormData): boolean {
  return allStage1PanelComplete(data) && hrStage1Complete(data);
}

export function stage2ReadyForEvaluation(data: InterviewFormData): boolean {
  const hasStage2 = stageMembers(data, 2).length > 0;
  if (!hasStage2) return hrStage2Complete(data);
  return allStage2PanelComplete(data) && hrStage2Complete(data);
}

export type WorkflowStep =
  | "panel"
  | "stage1"
  | "stage1_review"
  | "stage2_setup"
  | "stage2"
  | "evaluation";

export function interviewWorkflowStepV2(
  data: InterviewFormData,
): WorkflowStep {
  const setup = data.setup;
  const stage1Sent = !!setup?.stage1_invites_sent_at || !!setup?.invites_sent_at;

  if (!stage1Sent) return "panel";

  if (!stage1ReadyForReview(data)) return "stage1";

  if (!data.stage1_review?.reviewed_at) return "stage1_review";

  if (data.stage1_review.passed === false) return "stage1_review";

  // Stay on setup until HR explicitly sends Stage 2 invites (date alone must not advance).
  if (!setup?.stage2_invites_sent_at) {
    return "stage2_setup";
  }

  if (!stage2ReadyForEvaluation(data)) return "stage2";

  return "evaluation";
}

export function ensureMemberTokens(members: PanelMember[]): PanelMember[] {
  return members.map((m) => ({
    ...m,
    id: m.id || randomBytes(8).toString("hex"),
    access_token: m.access_token || generatePanelAccessToken(),
  }));
}

export type PanelTokenLookup = {
  application: {
    id: string;
    full_name: string;
    role_title: string;
    reference_number: string;
    role_slug: string;
    status: string;
    interview_form_data: InterviewFormData;
  };
  member: PanelMember;
};

export function combinedInterviewAverage(
  data: InterviewFormData,
  guide: InterviewGuideConfig,
): number | null {
  const s1 = stageAverage(data, guide, 1);
  const s2 = stageAverage(data, guide, 2);
  if (s1 != null && s2 != null) return averageScore([s1, s2]);
  return s1 ?? s2;
}

/**
 * Per-area score for the "Combined scores" table on the Evaluation step.
 * For each assessment area (e.g. "B1 Motivation & trainability" — Q1-Q3),
 * each grader's (every panel member + HR) own score for that area is the
 * average of their ratings across just that area's questionIds. The value
 * shown here is the average of those per-grader area scores — same
 * "average across graders" approach combinedInterviewAverage already uses
 * for the overall total, just applied one area at a time instead of only
 * at the end.
 */
export function combinedAreaScores(
  data: InterviewFormData,
  guide: InterviewGuideConfig,
): Record<string, number | null> {
  const scenarioIds = new Set(guide.scenarios.map((s) => s.id));
  const result: Record<string, number | null> = {};

  for (const row of guide.weights) {
    const isStage2Area = row.questionIds.every((id) => scenarioIds.has(id));
    const stage: 1 | 2 = isStage2Area ? 2 : 1;

    const graderAreaAverages: number[] = [];
    for (const g of gradersForStage(data, guide, stage)) {
      const sub: StageSubmissionData | undefined =
        g.role === "hr"
          ? stage === 1
            ? data.hr_submission?.stage1
            : data.hr_submission?.stage2
          : getSubmission(data, g.id, stage);
      if (!sub) continue;

      const ratings = isStage2Area ? sub.scenario_ratings : sub.question_ratings;
      const vals = row.questionIds
        .map((id) => ratings?.[id]?.rating)
        .filter((r): r is number => r != null && r >= 1 && r <= 5);
      if (vals.length === 0) continue;

      graderAreaAverages.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    result[row.area] =
      graderAreaAverages.length > 0
        ? Math.round(
            (graderAreaAverages.reduce((a, b) => a + b, 0) / graderAreaAverages.length) * 100,
          ) / 100
        : null;
  }

  return result;
}

export function findPanelByToken(
  applications: PanelTokenLookup["application"][],
  token: string,
): PanelTokenLookup | null {
  for (const application of applications) {
    const data = application.interview_form_data;
    const member = findMemberByToken(data, token);
    if (member) return { application, member };
  }
  return null;
}
