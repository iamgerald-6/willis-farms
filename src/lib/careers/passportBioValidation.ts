/** Shared between the passport bio validation API route and (if ever needed) the client —
 * plain TS so it can be imported from a server route without pulling in React. */

/** Shown when the upload is not a passport bio page (wrong document, unreadable, etc.). */
export const INVALID_PASSPORT_BIO_PAGE_MESSAGE =
  "This doesn't look like a valid passport bio page. Please upload a clear photo of your passport bio page and try again.";

/** Anthropic sometimes rejects non-passport images (e.g. Ghana Card) before tool extraction. */
export function isUnprocessablePassportImageError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err ?? "");
  return (
    /could not process image/i.test(text) ||
    (/invalid_request_error/i.test(text) && /image/i.test(text))
  );
}

export type ExtractedPassportBio = {
  isPassportBioPage: boolean;
  fullName: string;
  dateOfBirth: string;
  nationality: string;
  passportNumber: string;
};

/** Lowercases, strips diacritics/punctuation, and splits into name tokens. */
export function normalizeNameTokens(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function namesLikelyMatch(
  firstName: string,
  lastName: string,
  extractedFullName: string,
): boolean {
  const appTokens = normalizeNameTokens(`${firstName} ${lastName}`);
  const extTokens = normalizeNameTokens(extractedFullName);
  if (appTokens.length === 0 || extTokens.length === 0) return false;

  return appTokens.every((appToken) =>
    extTokens.some(
      (extToken) =>
        appToken === extToken ||
        (appToken.length >= 3 &&
          extToken.length >= 3 &&
          (appToken.startsWith(extToken) || extToken.startsWith(appToken))),
    ),
  );
}

function normalizeIsoDate(raw: string | undefined | null): string {
  const trimmed = raw?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

export function datesOfBirthMatch(
  applicantDob: string | undefined | null,
  extractedDob: string | undefined | null,
): boolean {
  const a = normalizeIsoDate(applicantDob);
  const b = normalizeIsoDate(extractedDob);
  return Boolean(a && b && a === b);
}

function normalizePassportNumber(raw: string | undefined | null): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function passportNumbersMatch(
  applicantNumber: string | undefined | null,
  extractedNumber: string | undefined | null,
): boolean {
  const a = normalizePassportNumber(applicantNumber);
  const b = normalizePassportNumber(extractedNumber);
  return Boolean(a && b && a === b);
}

export type PassportBioMatchResult = {
  matches: boolean;
  nameMatches: boolean;
  dobMatches: boolean;
  passportNumberMatches: boolean;
  message: string | null;
};

function joinFieldNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function evaluatePassportBioMatch(
  applicant: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    passportNumber: string;
  },
  extracted: ExtractedPassportBio,
): PassportBioMatchResult {
  if (!extracted.isPassportBioPage) {
    return {
      matches: false,
      nameMatches: false,
      dobMatches: false,
      passportNumberMatches: false,
      message: INVALID_PASSPORT_BIO_PAGE_MESSAGE,
    };
  }

  if (
    !extracted.fullName.trim() &&
    !extracted.dateOfBirth.trim() &&
    !extracted.passportNumber.trim()
  ) {
    return {
      matches: false,
      nameMatches: false,
      dobMatches: false,
      passportNumberMatches: false,
      message:
        "We couldn't read anything clearly enough on that photo — please upload a clearer, well-lit photo of your passport bio page.",
    };
  }

  const nameMatches = namesLikelyMatch(
    applicant.firstName,
    applicant.lastName,
    extracted.fullName,
  );
  const dobMatches = datesOfBirthMatch(
    applicant.dateOfBirth,
    extracted.dateOfBirth,
  );
  const passportNumberMatches = passportNumbersMatch(
    applicant.passportNumber,
    extracted.passportNumber,
  );

  if (nameMatches && dobMatches && passportNumberMatches) {
    return {
      matches: true,
      nameMatches,
      dobMatches,
      passportNumberMatches,
      message: null,
    };
  }

  const failedFields: string[] = [];
  if (!nameMatches) failedFields.push("name");
  if (!dobMatches) failedFields.push("date of birth");
  if (!passportNumberMatches) failedFields.push("passport number");

  const message = `The ${joinFieldNames(failedFields)} on this photo ${
    failedFields.length === 1 ? "doesn't" : "don't"
  } match what you entered — please check your details or upload a clearer photo of your passport bio page.`;

  return {
    matches: false,
    nameMatches,
    dobMatches,
    passportNumberMatches,
    message,
  };
}
