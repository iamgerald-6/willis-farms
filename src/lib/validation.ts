// Shared, tiny format-validation helpers reused across the various form
// schemas in the app (job application, onboarding, referee references,
// ...) instead of each one hand-rolling its own copy of the same regex.

/** A conservative but broadly correct "looks like an email" check —
 * intentionally not RFC 5322-exhaustive, matching the pattern this
 * codebase already used inline in a couple of places before this file
 * existed. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

// Letters (including accented ones), spaces, hyphens, and apostrophes —
// covers real names like "Mary-Jane", "O'Brien", "Kwame Nkrumah" while
// still rejecting digits, symbols, and emoji.
const NAME_PATTERN = /^[\p{L}][\p{L}\s'-]*$/u;

export function isValidName(value: string): boolean {
  return NAME_PATTERN.test(value.trim());
}

/** Strips out anything that isn't a letter, space, hyphen, or apostrophe —
 * used to filter keystrokes as the applicant types into a name field. */
export function sanitizeNameInput(value: string): string {
  return value.replace(/[^\p{L}\s'-]/gu, "");
}

/** Strips non-digit characters — for account numbers, SSNIT, etc. */
export function sanitizeDigitsInput(value: string): string {
  return value.replace(/\D/g, "");
}

// --- Password strength -----------------------------------------------------
// Shared rules for every "set/change password" form in the app (invite
// setup, reset, and the settings-page change-password form) so the
// requirement is consistent and only defined once.

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRequirement = {
  key: "length" | "uppercase" | "lowercase" | "number" | "symbol";
  label: string;
  met: boolean;
};

/** Live checklist of password rules — used to render a requirements list as the user types. */
export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      key: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    { key: "uppercase", label: "One uppercase letter (A–Z)", met: /[A-Z]/.test(password) },
    { key: "lowercase", label: "One lowercase letter (a–z)", met: /[a-z]/.test(password) },
    { key: "number", label: "One number (0–9)", met: /[0-9]/.test(password) },
    {
      key: "symbol",
      label: "One symbol (e.g. ! @ # $ %)",
      met: /[^A-Za-z0-9]/.test(password),
    },
  ];
}

export function isStrongPassword(password: string): boolean {
  return getPasswordRequirements(password).every((r) => r.met);
}

/** First unmet requirement, phrased as a toast-friendly error — or null if the password is strong. */
export function passwordStrengthError(password: string): string | null {
  const unmet = getPasswordRequirements(password).find((r) => !r.met);
  return unmet ? `Password needs: ${unmet.label.toLowerCase()}.` : null;
}
