/** Combine HR-entered notice period number + unit for offer letter text. */
export function formatNoticePeriodForOfferLetter(
  period?: string | null,
  frequency?: string | null,
): string | undefined {
  const n = period?.trim();
  const unit = frequency?.trim();
  if (n && unit) return `${n} ${unit}`;
  if (n) return n;
  return undefined;
}
