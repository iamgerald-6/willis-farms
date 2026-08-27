import type { SupabaseClient } from "@supabase/supabase-js";
import type { SystemOption } from "./types";
import {
  ONBOARDING_MEDICAL_REPORTS_LIST,
  RECRUITMENT_MODULE_ID,
  getDefaultOnboardingMedicalReports,
} from "./onboardingDefaults";
import { optionListLabelsFromOptions } from "@/lib/careers/onboardingFormSchema";

export { ONBOARDING_MEDICAL_REPORTS_LIST };

export function resolveRequiredMedicalReports(
  labels: string[] | undefined | null,
): string[] {
  const trimmed = (labels ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (trimmed.length > 0) return trimmed;
  return optionListLabelsFromOptions(getDefaultOnboardingMedicalReports());
}

export async function fetchRequiredMedicalReports(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("system_options")
    .select("*")
    .eq("module_id", RECRUITMENT_MODULE_ID)
    .eq("option_list", ONBOARDING_MEDICAL_REPORTS_LIST)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data?.length) {
    return resolveRequiredMedicalReports(
      optionListLabelsFromOptions(getDefaultOnboardingMedicalReports()),
    );
  }

  return resolveRequiredMedicalReports(
    optionListLabelsFromOptions(data as SystemOption[]),
  );
}

export function gitFallbackRequiredMedicalReports(): string[] {
  return resolveRequiredMedicalReports(
    optionListLabelsFromOptions(getDefaultOnboardingMedicalReports()),
  );
}

export function formatMedicalReportsPlainText(reports: string[]): string {
  if (reports.length === 0) return "";
  const lines = reports.map((item) => `• ${item}`);
  return [
    "Please obtain the following medical reports and upload proof on the medical step of onboarding:",
    ...lines,
  ].join("\n");
}

export function formatMedicalReportsHtml(reports: string[]): string {
  if (reports.length === 0) return "";
  const items = reports
    .map(
      (item) =>
        `<li style="margin:0 0 6px;font-size:14px;color:#374151;">${escapeHtml(item)}</li>`,
    )
    .join("");
  return `
    <p style="margin:16px 0 8px;font-size:14px;font-weight:600;color:#111827;">Required medical reports</p>
    <p style="margin:0 0 8px;font-size:14px;color:#374151;">
      Please obtain the following and upload proof on the medical step of onboarding:
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
