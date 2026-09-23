/** BMI from height (cm) and weight (kg). Returns empty string if inputs invalid. */
export function calculateBmi(heightCm: string | number | null | undefined, weightKg: string | number | null | undefined): string {
  const h = typeof heightCm === "number" ? heightCm : parseFloat(String(heightCm ?? "").trim());
  const w = typeof weightKg === "number" ? weightKg : parseFloat(String(weightKg ?? "").trim());
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return "";
  const metres = h / 100;
  const bmi = w / (metres * metres);
  return bmi.toFixed(1);
}

export const VISUAL_ACUITY_RESULT_OPTIONS = ["Pass", "Fail"] as const;

export const VISUAL_ACUITY_FAIL_NOTE_KEYS = {
  visual_acuity_right: "visual_acuity_right_fail_note",
  visual_acuity_left: "visual_acuity_left_fail_note",
} as const;

export const HEARING_RESULT_OPTIONS = ["Pass", "Fail", "Not tested"] as const;

export const HEARING_FAIL_NOTE_KEYS = {
  hearing_left: "hearing_left_fail_note",
  hearing_right: "hearing_right_fail_note",
} as const;

export const CLINICAL_VITAL_FIELD_KEYS = {
  height_cm: "height_cm",
  weight_kg: "weight_kg",
  bmi: "bmi",
  bp_systolic: "bp_systolic",
  bp_diastolic: "bp_diastolic",
  pulse: "pulse",
  visual_acuity_right: "visual_acuity_right",
  visual_acuity_left: "visual_acuity_left",
  hearing_left: "hearing_left",
  hearing_right: "hearing_right",
} as const;
