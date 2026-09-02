/** Shared medical report extraction + comparison against candidate self-declaration. */

export const INVALID_MEDICAL_REPORT_MESSAGE =
  "This doesn't look like a valid medical report. Please upload a clear PDF or photo of the pre-employment medical certificate.";

export type ExtractedMedicalReport = {
  isMedicalReport: boolean;
  bloodGroup: string;
  allergiesNoted: string;
  conditionsNoted: string;
  summary: string;
};

export type DeclaredMedicalInfo = {
  blood_group?: string;
  allergies?: string;
  conditions?: string;
};

export type MedicalReportMatchResult = {
  ok: boolean;
  message: string;
  warnings: string[];
  extracted: ExtractedMedicalReport;
};

function normalizeBloodGroup(raw: string | undefined | null): string {
  return (raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/POSITIVE/g, "+")
    .replace(/NEGATIVE/g, "-")
    .replace(/[^ABO+-]/g, "");
}

function bloodGroupsCompatible(declared: string, extracted: string): boolean {
  const a = normalizeBloodGroup(declared);
  const b = normalizeBloodGroup(extracted);
  if (!a || !b) return true;
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return false;
}

function normalizeText(raw: string | undefined | null): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textTokens(raw: string | undefined | null): string[] {
  const stop = new Set(["the", "and", "or", "no", "none", "nil", "na", "n/a", "not", "any"]);
  return normalizeText(raw)
    .split(" ")
    .filter((t) => t.length >= 3 && !stop.has(t));
}

/** True when declared free-text overlaps document text (for allergies / conditions). */
function freeTextConsistent(declared: string | undefined, extracted: string | undefined): {
  ok: boolean;
  warning?: string;
} {
  const dec = normalizeText(declared);
  const ext = normalizeText(extracted);
  if (!dec || dec === "none" || dec === "nil" || dec === "n/a") return { ok: true };
  if (!ext) {
    return {
      ok: true,
      warning:
        "The candidate declared medical information, but the uploaded report did not clearly mention it — please review manually.",
    };
  }

  const decTokens = textTokens(declared);
  if (decTokens.length === 0) return { ok: true };

  const overlap = decTokens.some((token) => ext.includes(token));
  if (overlap) return { ok: true };

  return {
    ok: false,
    warning:
      "The medical report does not clearly reflect what the candidate declared — please review allergies/conditions manually.",
  };
}

export function evaluateMedicalReportMatch(
  declared: DeclaredMedicalInfo,
  extracted: ExtractedMedicalReport,
): MedicalReportMatchResult {
  const warnings: string[] = [];

  if (!extracted.isMedicalReport) {
    return {
      ok: false,
      message: INVALID_MEDICAL_REPORT_MESSAGE,
      warnings: [],
      extracted,
    };
  }

  const declaredBg = declared.blood_group?.trim() ?? "";
  const extractedBg = extracted.bloodGroup?.trim() ?? "";

  if (declaredBg && extractedBg && !bloodGroupsCompatible(declaredBg, extractedBg)) {
    return {
      ok: false,
      message: `Blood group on the report (${extractedBg}) does not match what the candidate declared (${declaredBg}).`,
      warnings: [],
      extracted,
    };
  }

  if (declaredBg && !extractedBg) {
    warnings.push(
      "Could not read blood group on the report — confirm it matches the candidate's declaration.",
    );
  }

  const allergyCheck = freeTextConsistent(declared.allergies, extracted.allergiesNoted);
  if (allergyCheck.warning) warnings.push(allergyCheck.warning);
  if (!allergyCheck.ok) {
    return {
      ok: false,
      message: allergyCheck.warning ?? "Medical report does not match declared allergies.",
      warnings,
      extracted,
    };
  }

  const conditionCheck = freeTextConsistent(declared.conditions, extracted.conditionsNoted);
  if (conditionCheck.warning) warnings.push(conditionCheck.warning);
  if (!conditionCheck.ok) {
    return {
      ok: false,
      message: conditionCheck.warning ?? "Medical report does not match declared conditions.",
      warnings,
      extracted,
    };
  }

  return {
    ok: true,
    message: warnings.length
      ? "Report uploaded — review the notes below before saving."
      : "Medical report matches the candidate's self-declaration.",
    warnings,
    extracted,
  };
}

export function isUnprocessableMedicalImageError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err ?? "");
  return (
    /could not process image/i.test(text) ||
    (/invalid_request_error/i.test(text) && /image/i.test(text))
  );
}
