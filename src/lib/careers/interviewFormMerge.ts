import type {
  InterviewFormData,
  InterviewSetup,
  PanelMember,
  PanelSubmission,
  StageSubmissionData,
} from "@/lib/careers/types";
import { normalizeInterviewFormData } from "@/lib/careers/types";
import { generatePanelAccessToken } from "@/lib/careers/panelInterview";
import { randomBytes } from "crypto";

const SETUP_IMMUTABLE_KEYS: (keyof InterviewSetup)[] = [
  "invites_sent_at",
  "stage1_invites_sent_at",
  "stage2_invites_sent_at",
  "candidate_invite_sent_at",
  "stage1_forms_opened_at",
  "stage2_forms_opened_at",
];

function isSubmittedStage(stage?: StageSubmissionData): boolean {
  return !!stage?.submitted_at;
}

function memberLookupKey(member: PanelMember): string {
  return `${member.email.trim().toLowerCase()}|${member.stage}`;
}

/** Keep panel invite links valid when setup is edited — preserve id + access_token from server. */
function preservePanelMemberTokens(
  serverMembers: PanelMember[] | undefined,
  clientMembers: PanelMember[] | undefined,
): PanelMember[] | undefined {
  if (!clientMembers) return clientMembers;
  const byId = new Map((serverMembers ?? []).map((m) => [m.id, m]));
  const byEmailStage = new Map(
    (serverMembers ?? []).map((m) => [memberLookupKey(m), m]),
  );

  return clientMembers.map((clientMember) => {
    const serverMember =
      (clientMember.id ? byId.get(clientMember.id) : undefined) ??
      byEmailStage.get(memberLookupKey(clientMember));
    return {
      ...clientMember,
      id: clientMember.id || serverMember?.id || randomBytes(8).toString("hex"),
      access_token:
        clientMember.access_token ||
        serverMember?.access_token ||
        generatePanelAccessToken(),
    };
  });
}

function mergeSetupDraft(
  server: InterviewSetup,
  client: InterviewSetup,
): InterviewSetup {
  const merged: InterviewSetup = { ...server, ...client };
  for (const key of SETUP_IMMUTABLE_KEYS) {
    const serverVal = server[key];
    if (serverVal != null && serverVal !== "") {
      (merged as Record<string, unknown>)[key] = serverVal;
    }
  }
  merged.stage1_members = preservePanelMemberTokens(
    server.stage1_members,
    merged.stage1_members,
  );
  merged.stage2_members = preservePanelMemberTokens(
    server.stage2_members,
    merged.stage2_members,
  );
  return merged;
}

function mergeStageDraft(
  server?: StageSubmissionData,
  client?: StageSubmissionData,
): StageSubmissionData | undefined {
  if (isSubmittedStage(server)) return server;
  if (!client) return server;
  if (!server) return client;
  return { ...server, ...client };
}

function mergeHrSubmissionDraft(
  server: NonNullable<InterviewFormData["hr_submission"]>,
  client: NonNullable<InterviewFormData["hr_submission"]>,
): NonNullable<InterviewFormData["hr_submission"]> {
  return {
    ...server,
    ...client,
    stage1: mergeStageDraft(server.stage1, client.stage1),
    stage2: mergeStageDraft(server.stage2, client.stage2),
  };
}

function submissionKey(submission: PanelSubmission): string {
  return `${submission.member_id}:${submission.stage}`;
}

/** Union panel rows — never drop a server-side submitted entry. */
export function mergePanelSubmissions(
  server: PanelSubmission[],
  client: PanelSubmission[],
): PanelSubmission[] {
  const byKey = new Map<string, PanelSubmission>();
  for (const row of server) {
    byKey.set(submissionKey(row), row);
  }
  for (const row of client) {
    const key = submissionKey(row);
    const existing = byKey.get(key);
    if (existing?.submitted_at && !row.submitted_at) continue;
    byKey.set(key, existing ? { ...existing, ...row } : row);
  }
  return Array.from(byKey.values());
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Safe merge for interview saves. Only fields present on the raw client
 * payload are applied — normalizeInterviewFormData fills defaults like an
 * empty setup / panel_submissions array that must not overwrite server
 * data (that was invalidating panel invite links after HR Stage 1 autosave).
 */
export function mergeInterviewFormDraft(
  serverRaw: InterviewFormData | null | undefined,
  clientRaw: InterviewFormData | null | undefined,
): InterviewFormData {
  const server = normalizeInterviewFormData(serverRaw);
  const partial = clientRaw ?? {};
  const merged: InterviewFormData = { ...server };

  if (hasOwn(partial, "setup") && partial.setup != null) {
    merged.setup = mergeSetupDraft(server.setup ?? {}, partial.setup);
  }

  if (hasOwn(partial, "hr_submission") && partial.hr_submission != null) {
    merged.hr_submission = mergeHrSubmissionDraft(
      server.hr_submission ?? {},
      partial.hr_submission,
    );
  }

  if (hasOwn(partial, "panel_submissions") && partial.panel_submissions != null) {
    merged.panel_submissions = mergePanelSubmissions(
      server.panel_submissions ?? [],
      partial.panel_submissions,
    );
  }

  if (hasOwn(partial, "stage1_review") && partial.stage1_review != null) {
    if (server.stage1_review?.reviewed_at) {
      merged.stage1_review = {
        ...server.stage1_review,
        ...partial.stage1_review,
        reviewed_at: server.stage1_review.reviewed_at,
        passed: partial.stage1_review.passed ?? server.stage1_review.passed,
        reviewed_by:
          partial.stage1_review.reviewed_by ?? server.stage1_review.reviewed_by,
      };
    } else {
      merged.stage1_review = {
        ...server.stage1_review,
        ...partial.stage1_review,
      };
    }
  }

  if (hasOwn(partial, "stage1_completed_at")) {
    merged.stage1_completed_at =
      partial.stage1_completed_at ?? server.stage1_completed_at;
  }
  if (hasOwn(partial, "stage2_completed_at")) {
    merged.stage2_completed_at =
      partial.stage2_completed_at ?? server.stage2_completed_at;
  }
  if (hasOwn(partial, "stage2_scheduled_at") && partial.stage2_scheduled_at) {
    merged.stage2_scheduled_at = partial.stage2_scheduled_at;
  }
  if (
    hasOwn(partial, "stage2_schedule_sent_at") &&
    partial.stage2_schedule_sent_at
  ) {
    merged.stage2_schedule_sent_at = partial.stage2_schedule_sent_at;
  }

  if (hasOwn(partial, "summary") && partial.summary != null) {
    merged.summary = {
      ...server.summary,
      ...partial.summary,
      stage1_average:
        partial.summary.stage1_average ?? server.summary?.stage1_average,
      stage2_average:
        partial.summary.stage2_average ?? server.summary?.stage2_average,
      total_weighted:
        partial.summary.total_weighted ?? server.summary?.total_weighted,
    };
  }

  if (
    hasOwn(partial, "screening") &&
    partial.screening &&
    Object.keys(partial.screening).length > 0 &&
    !isSubmittedStage(server.hr_submission?.stage1)
  ) {
    merged.screening = { ...server.screening, ...partial.screening };
  }

  if (
    hasOwn(partial, "question_ratings") &&
    partial.question_ratings &&
    Object.keys(partial.question_ratings).length > 0 &&
    !isSubmittedStage(server.hr_submission?.stage1)
  ) {
    merged.question_ratings = {
      ...server.question_ratings,
      ...partial.question_ratings,
    };
  }

  if (
    hasOwn(partial, "scenario_ratings") &&
    partial.scenario_ratings &&
    Object.keys(partial.scenario_ratings).length > 0 &&
    !isSubmittedStage(server.hr_submission?.stage2)
  ) {
    merged.scenario_ratings = {
      ...server.scenario_ratings,
      ...partial.scenario_ratings,
    };
  }

  if (
    hasOwn(partial, "current_stage") &&
    (partial.current_stage ?? 0) > (server.current_stage ?? 1)
  ) {
    merged.current_stage = partial.current_stage;
  }

  return normalizeInterviewFormData(merged);
}
