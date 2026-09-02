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
  /** Normalized to Male | Female when legible. */
  gender: string;
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

/** Map MRZ / passport sex codes to form gender options. */
export function normalizePassportGender(raw: string | undefined | null): string {
  const token = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (token === "M" || token === "MALE") return "Male";
  if (token === "F" || token === "FEMALE") return "Female";
  return "";
}

export function gendersMatch(
  formGender: string | undefined | null,
  extractedGender: string | undefined | null,
): boolean {
  const form = String(formGender ?? "").trim();
  const extracted = normalizePassportGender(extractedGender) || String(extractedGender ?? "").trim();
  if (!form || !extracted) return false;
  return form.toLowerCase() === extracted.toLowerCase();
}

function normalizeNationalityToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Passport demonyms / codes mapped to form country names (e.g. Ghana, not Ghanaian). */
const NATIONALITY_ALIASES: Record<string, string[]> = {
  Ghana: ["ghana", "ghanaian", "gha"],
  "United Kingdom": ["british", "united kingdom", "uk", "gbr", "great britain"],
  "United States": ["american", "united states", "usa", "us", "u s a"],
  Nigeria: ["nigeria", "nigerian", "nga"],
  France: ["france", "french", "fra"],
  Germany: ["germany", "german", "deu", "deutsch"],
};

/** True when the nationality printed on the passport matches the form country name. */
export function nationalitiesMatch(
  formCountry: string | undefined | null,
  extractedRaw: string | undefined | null,
): boolean {
  const form = String(formCountry ?? "").trim();
  const extracted = String(extractedRaw ?? "").trim();
  if (!form || !extracted) return false;

  const formNorm = normalizeNationalityToken(form);
  const extNorm = normalizeNationalityToken(extracted);

  if (formNorm === extNorm) return true;
  if (extNorm.includes(formNorm) || formNorm.includes(extNorm)) return true;

  const aliases = NATIONALITY_ALIASES[form] ?? [];
  if (aliases.some((alias) => extNorm === alias || extNorm.includes(alias) || alias.includes(extNorm))) {
    return true;
  }

  const formWords = formNorm.split(/\s+/).filter((w) => w.length >= 3);
  if (formWords.length > 0 && formWords.every((word) => extNorm.includes(word))) {
    return true;
  }

  return false;
}

export type PassportBioMatchResult = {
  matches: boolean;
  identityMatches: boolean;
  nameMatches: boolean;
  dobMatches: boolean;
  nationalityMatches: boolean;
  genderMatches: boolean;
  passportNumberMatches: boolean;
  message: string | null;
};

function joinFieldNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function baseExtractedChecks(extracted: ExtractedPassportBio): PassportBioMatchResult | null {
  if (!extracted.isPassportBioPage) {
    return {
      matches: false,
      identityMatches: false,
      nameMatches: false,
      dobMatches: false,
      nationalityMatches: false,
      genderMatches: false,
      passportNumberMatches: false,
      message: INVALID_PASSPORT_BIO_PAGE_MESSAGE,
    };
  }

  if (
    !extracted.fullName.trim() &&
    !extracted.dateOfBirth.trim() &&
    !extracted.nationality.trim() &&
    !extracted.gender.trim()
  ) {
    return {
      matches: false,
      identityMatches: false,
      nameMatches: false,
      dobMatches: false,
      nationalityMatches: false,
      genderMatches: false,
      passportNumberMatches: false,
      message:
        "We couldn't read anything clearly enough on that photo — please upload a clearer, well-lit photo of your passport bio page.",
    };
  }

  return null;
}

/** Name, DOB, nationality, and gender vs the form — passport number is filled from the photo, not compared with the applicant. */
export function evaluatePassportIdentityMatch(
  applicant: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    gender: string;
  },
  extracted: ExtractedPassportBio,
): PassportBioMatchResult {
  const baseFail = baseExtractedChecks(extracted);
  if (baseFail) return baseFail;

  const nameMatches = namesLikelyMatch(
    applicant.firstName,
    applicant.lastName,
    extracted.fullName,
  );
  const dobMatches = datesOfBirthMatch(applicant.dateOfBirth, extracted.dateOfBirth);
  const nationalityMatches = nationalitiesMatch(applicant.nationality, extracted.nationality);
  const genderMatches = gendersMatch(applicant.gender, extracted.gender);

  const identityMatches = nameMatches && dobMatches && nationalityMatches && genderMatches;

  if (identityMatches) {
    return {
      matches: true,
      identityMatches: true,
      nameMatches,
      dobMatches,
      nationalityMatches,
      genderMatches,
      passportNumberMatches: false,
      message: null,
    };
  }

  const failedFields: string[] = [];
  if (!nameMatches) failedFields.push("name");
  if (!dobMatches) failedFields.push("date of birth");
  if (!genderMatches) {
    failedFields.push(
      extracted.gender.trim()
        ? "gender"
        : "gender (we couldn't read it clearly on the passport)",
    );
  }
  if (!nationalityMatches) {
    failedFields.push(
      extracted.nationality.trim()
        ? "nationality"
        : "nationality (we couldn't read it clearly on the passport)",
    );
  }

  const message = `The ${joinFieldNames(failedFields)} on this photo ${
    failedFields.length === 1 ? "doesn't" : "don't"
  } match what you entered — please check your details or upload a clearer photo of your passport bio page.`;

  return {
    matches: false,
    identityMatches: false,
    nameMatches,
    dobMatches,
    nationalityMatches,
    genderMatches,
    passportNumberMatches: false,
    message,
  };
}

/** Full check including passport number — used internally after identity matches. */
export function evaluatePassportBioMatch(
  applicant: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    gender: string;
    passportNumber: string;
  },
  extracted: ExtractedPassportBio,
): PassportBioMatchResult {
  const identity = evaluatePassportIdentityMatch(applicant, extracted);
  if (!identity.identityMatches) {
    return identity;
  }

  const passportNumberMatches = passportNumbersMatch(
    applicant.passportNumber,
    extracted.passportNumber,
  );

  return {
    matches: passportNumberMatches,
    identityMatches: true,
    nameMatches: identity.nameMatches,
    dobMatches: identity.dobMatches,
    nationalityMatches: identity.nationalityMatches,
    genderMatches: identity.genderMatches,
    passportNumberMatches,
    message: null,
  };
}
