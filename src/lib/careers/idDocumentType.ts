/** Values stored on the job application form for Ghanaian ID type selection. */
export const ID_DOCUMENT_GHANA_CARD = "Ghana Card";
export const ID_DOCUMENT_PASSPORT = "Passport";

export const ID_DOCUMENT_TYPE_OPTIONS = [
  ID_DOCUMENT_GHANA_CARD,
  ID_DOCUMENT_PASSPORT,
] as const;

export function usesPassportIdDocument(
  values: Record<string, unknown> | null | undefined,
): boolean {
  return String(values?.id_document_type ?? "") === ID_DOCUMENT_PASSPORT;
}

export function usesGhanaCardIdDocument(
  values: Record<string, unknown> | null | undefined,
): boolean {
  return String(values?.id_document_type ?? "") === ID_DOCUMENT_GHANA_CARD;
}
