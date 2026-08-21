import {
  STATUS_LABELS,
  type ApplicationStatus,
  type JobApplication,
} from "@/lib/careers/types";

/** Statuses only set by the system or AI — HR cannot pick these manually. */
export const SYSTEM_ONLY_STATUSES: ApplicationStatus[] = ["applied", "under_review", "offer"];

export function isAwaitingAiScreening(
  application: Pick<JobApplication, "status" | "ai_screening">,
): boolean {
  return application.status === "applied" && !application.ai_screening;
}

/** Allowed status values HR may select for this application (includes current status). */
export function getAllowedHrStatusOptions(
  application: Pick<JobApplication, "status" | "ai_screening">,
): ApplicationStatus[] | null {
  if (application.status === "offer") return null;

  if (isAwaitingAiScreening(application)) return [];

  const { status, ai_screening } = application;

  if (status === "under_review" && ai_screening) {
    return ["under_review", "shortlisted", "rejected"];
  }

  if (status === "shortlisted") {
    return ["shortlisted", "interview", "rejected", "hold"];
  }

  if (status === "interview") {
    return ["interview", "hold", "rejected", "onboarding"];
  }

  if (status === "hold") {
    return ["hold", "interview", "rejected", "shortlisted"];
  }

  if (status === "onboarding") {
    return ["onboarding", "hold", "rejected"];
  }

  if (status === "rejected" && ai_screening) {
    return ["rejected", "shortlisted"];
  }

  if (status === "rejected") {
    return ["rejected"];
  }

  return [status];
}

export function canHrChangeStatus(
  application: Pick<JobApplication, "status" | "ai_screening">,
): boolean {
  const options = getAllowedHrStatusOptions(application);
  if (!options || options.length === 0) return false;
  return options.length > 1;
}

export function validateHrStatusChange(
  application: Pick<JobApplication, "status" | "ai_screening">,
  nextStatus: ApplicationStatus,
): string | null {
  if (nextStatus === application.status) return null;

  if (SYSTEM_ONLY_STATUSES.includes(nextStatus)) {
    return `${STATUS_LABELS[nextStatus]} is set by the system only.`;
  }

  const allowed = getAllowedHrStatusOptions(application);
  if (allowed === null) {
    return "This application status cannot be changed manually.";
  }
  if (allowed.length === 0) {
    return "Run AI shortlisting before changing status.";
  }
  if (!allowed.includes(nextStatus)) {
    return `Cannot change status from ${STATUS_LABELS[application.status]} to ${STATUS_LABELS[nextStatus]}.`;
  }
  return null;
}
