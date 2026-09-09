/**
 * SSNIT (social security) and PAYE (income tax) settings used to
 * auto-calculate "Social security contribution", "Income tax", and "Net
 * payable" on the Offer Terms form from the "Basic salary (GHS)" HR enters
 * — see OfferTermsPanel.tsx. Editable under System Definitions > Offer
 * letter > Payroll tax settings, since the Ghana Revenue Authority revises
 * PAYE bands (and, less often, the SSNIT rate) periodically and this
 * shouldn't require a code change to update.
 */

export type PayrollTaxBand = {
  /** Monthly chargeable income up to and including this amount is taxed at
   * ratePercent. null marks the top band ("and above" — no upper limit). */
  uptoMonthly: number | null;
  ratePercent: number;
};

export type PayrollTaxConfig = {
  /** Employee's SSNIT contribution, as a percentage of basic salary. */
  ssnitEmployeeRatePercent: number;
  /** Progressive monthly PAYE bands, applied to (basic salary - SSNIT). */
  payeBands: PayrollTaxBand[];
  /** Optional — employer's Tier 2 pension contribution, as a percentage of
   * basic salary. Paid entirely by the employer, never deducted from the
   * employee, so it's informational only (total cost to the company) and
   * never subtracted from Net payable. Undefined/0 means not configured —
   * no Employer Tier 2 figure is shown at all. */
  employerTier2RatePercent?: number;
};

/** Ghana Revenue Authority 2026 monthly PAYE bands + SSNIT employee rate. */
export const DEFAULT_PAYROLL_TAX_CONFIG: PayrollTaxConfig = {
  ssnitEmployeeRatePercent: 5.5,
  payeBands: [
    { uptoMonthly: 490, ratePercent: 0 },
    { uptoMonthly: 600, ratePercent: 5 },
    { uptoMonthly: 730, ratePercent: 10 },
    { uptoMonthly: 3897, ratePercent: 17.5 },
    { uptoMonthly: 19897, ratePercent: 25 },
    { uptoMonthly: 50417, ratePercent: 30 },
    { uptoMonthly: null, ratePercent: 35 },
  ],
};

function normalizeBand(raw: unknown): PayrollTaxBand | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const ratePercent = Number(obj.ratePercent);
  if (!Number.isFinite(ratePercent) || ratePercent < 0) return null;
  const uptoMonthly =
    obj.uptoMonthly === null || obj.uptoMonthly === undefined
      ? null
      : Number(obj.uptoMonthly);
  if (uptoMonthly !== null && (!Number.isFinite(uptoMonthly) || uptoMonthly <= 0)) {
    return null;
  }
  return { uptoMonthly, ratePercent };
}

/** Sorts bands ascending by threshold, with the open-ended (null) band last. */
function sortBands(bands: PayrollTaxBand[]): PayrollTaxBand[] {
  return [...bands].sort((a, b) => {
    if (a.uptoMonthly === null) return 1;
    if (b.uptoMonthly === null) return -1;
    return a.uptoMonthly - b.uptoMonthly;
  });
}

export function normalizePayrollTaxConfig(raw: unknown): PayrollTaxConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_PAYROLL_TAX_CONFIG;
  const obj = raw as Record<string, unknown>;

  const ssnitRate = Number(obj.ssnitEmployeeRatePercent);
  const ssnitEmployeeRatePercent =
    Number.isFinite(ssnitRate) && ssnitRate >= 0
      ? ssnitRate
      : DEFAULT_PAYROLL_TAX_CONFIG.ssnitEmployeeRatePercent;

  const rawBands = Array.isArray(obj.payeBands) ? obj.payeBands : [];
  const bands = rawBands
    .map(normalizeBand)
    .filter((b): b is PayrollTaxBand => b !== null);

  const tier2Rate = Number(obj.employerTier2RatePercent);
  const employerTier2RatePercent =
    Number.isFinite(tier2Rate) && tier2Rate > 0 ? tier2Rate : undefined;

  return {
    ssnitEmployeeRatePercent,
    payeBands: bands.length > 0 ? sortBands(bands) : DEFAULT_PAYROLL_TAX_CONFIG.payeBands,
    employerTier2RatePercent,
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Strips currency symbols/commas/whitespace from a free-text salary field. */
export function parseSalaryAmount(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export type PayrollDeductions = {
  ssnit: number;
  incomeTax: number;
  netPayable: number;
  /** Employer's Tier 2 contribution — informational only, 0 when the rate
   * isn't configured. Never subtracted from netPayable. */
  employerTier2Contribution: number;
};

/**
 * SSNIT is deducted first (as a flat percentage of basic salary), then PAYE
 * is applied progressively to what's left (basic salary - SSNIT) — this
 * "deduct SSNIT first, tax the remainder" order matches how GRA computes
 * chargeable income, not a flat percentage of the full basic salary. SSNIT
 * and PAYE are both based on basic salary alone; otherAllowances (housing,
 * medical, etc.) are added on top only for netPayable, since those amounts
 * aren't taxed or SSNIT-deducted here — they're added in full to what the
 * employee actually takes home.
 */
export function computePayrollDeductions(
  basicSalaryMonthly: number,
  config: PayrollTaxConfig = DEFAULT_PAYROLL_TAX_CONFIG,
  otherAllowancesMonthly = 0,
): PayrollDeductions {
  if (!Number.isFinite(basicSalaryMonthly) || basicSalaryMonthly <= 0) {
    return { ssnit: 0, incomeTax: 0, netPayable: 0, employerTier2Contribution: 0 };
  }

  const ssnit = round2(basicSalaryMonthly * (config.ssnitEmployeeRatePercent / 100));
  const chargeable = Math.max(0, basicSalaryMonthly - ssnit);

  const bands = sortBands(config.payeBands);
  let tax = 0;
  let lowerBound = 0;
  for (const band of bands) {
    if (chargeable <= lowerBound) break;
    const upper = band.uptoMonthly ?? Infinity;
    const amountInBand = Math.min(chargeable, upper) - lowerBound;
    if (amountInBand > 0) {
      tax += amountInBand * (band.ratePercent / 100);
    }
    lowerBound = upper;
  }

  const incomeTax = round2(tax);
  const extraAllowances =
    Number.isFinite(otherAllowancesMonthly) && otherAllowancesMonthly > 0
      ? otherAllowancesMonthly
      : 0;
  const netPayable = round2(basicSalaryMonthly + extraAllowances - ssnit - incomeTax);
  const employerTier2Contribution = config.employerTier2RatePercent
    ? round2(basicSalaryMonthly * (config.employerTier2RatePercent / 100))
    : 0;
  return { ssnit, incomeTax, netPayable, employerTier2Contribution };
}
