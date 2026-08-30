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
