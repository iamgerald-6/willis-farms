import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAVE_ANNUAL_CAP_DAYS } from "@/lib/moduleRegistry/taxonomy/leave";
import { fetchModuleConfig } from "@/lib/systemDefinitions";

export const LEAVE_MODULE_ID = "mod:leave";

export const DEFAULT_ANNUAL_LEAVE_CAP_DAYS = LEAVE_ANNUAL_CAP_DAYS;

/** Clamp and validate annual leave allowance (working days per year). */
export function normalizeAnnualLeaveCapDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ANNUAL_LEAVE_CAP_DAYS;
  const rounded = Math.round(n);
  if (rounded < 1) return 1;
  if (rounded > 365) return 365;
  return rounded;
}

export function resolveAnnualLeaveCapDays(
  businessLogic: { annualLeaveCapDays?: number } | null | undefined,
): number {
  if (
    businessLogic?.annualLeaveCapDays != null &&
    Number.isFinite(businessLogic.annualLeaveCapDays)
  ) {
    return normalizeAnnualLeaveCapDays(businessLogic.annualLeaveCapDays);
  }
  return DEFAULT_ANNUAL_LEAVE_CAP_DAYS;
}

export async function fetchLeaveAnnualCapDays(
  supabase: SupabaseClient,
): Promise<number> {
  const config = await fetchModuleConfig(supabase, LEAVE_MODULE_ID);
  return resolveAnnualLeaveCapDays(config.businessLogic);
}
