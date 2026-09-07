function formatGhsAmount(value: string): string {
  const cleaned = value.replace(/,/g, "").trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return value.trim();
  return num.toLocaleString("en-GH");
}

export function parseGhsAmount(value: string | undefined | null): number | null {
  if (!value?.trim()) return null;
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function formatGrossSalaryAmount(
  salaryGhs: string | null | undefined,
): string | null {
  const amount = salaryGhs?.trim();
  if (!amount) return null;
  const n = parseGhsAmount(amount);
  if (n == null) return `GHS ${amount}`;
  const formatted = n.toLocaleString("en-GH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `GHS ${formatted}`;
}

/**
 * Validates a gross salary against a numeric band resolved straight from
 * the job posting's own Salary field (see resolveOfferTermsFromPosting).
 * min/max being undefined means the posting's Salary value wasn't a
 * parseable numeric range (e.g. a plain label with no numbers) — nothing
 * to check against, so this passes.
 */
export function validateGrossSalaryAgainstBand(
  salaryGhs: string | undefined | null,
  minInput: string | undefined | null,
  maxInput: string | undefined | null,
): { valid: boolean; message: string | null } {
  const amount = parseGhsAmount(salaryGhs);
  if (amount == null) {
    return { valid: false, message: "Enter a valid gross salary amount." };
  }
  const min = parseGhsAmount(minInput);
  const max = parseGhsAmount(maxInput);
  if (min == null && max == null) {
    return { valid: true, message: null };
  }
  if (min != null && amount < min) {
    return {
      valid: false,
      message: `Gross salary cannot be below GHS ${formatGhsAmount(String(min))} for this role.`,
    };
  }
  if (max != null && amount > max) {
    return {
      valid: false,
      message: `Gross salary cannot exceed GHS ${formatGhsAmount(String(max))} for this role.`,
    };
  }
  return { valid: true, message: null };
}
