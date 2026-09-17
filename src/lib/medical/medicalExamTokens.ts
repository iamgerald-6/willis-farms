import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MEDICAL_LINK_DAYS = 30;

export function medicalTokenExpiry(from = new Date()): Date {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + MEDICAL_LINK_DAYS);
  return expires;
}

export function generateMedicalTokenValue(): string {
  return randomBytes(32).toString("hex");
}

export async function revokeMedicalExamTokens(
  supabase: SupabaseClient,
  examinationId: string,
): Promise<void> {
  await supabase
    .from("medical_examination_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("examination_id", examinationId)
    .is("revoked_at", null);
}

export async function createMedicalExamToken(
  supabase: SupabaseClient,
  examinationId: string,
): Promise<{ token: string; expiresAt: string; id: string }> {
  await revokeMedicalExamTokens(supabase, examinationId);

  const token = generateMedicalTokenValue();
  const expiresAt = medicalTokenExpiry().toISOString();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("medical_examination_tokens")
    .insert({
      examination_id: examinationId,
      token,
      expires_at: expiresAt,
      last_sent_at: now,
    })
    .select("id, token, expires_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create medical examination token");
  }

  return { id: data.id, token: data.token, expiresAt: data.expires_at };
}

export type MedicalTokenValidation =
  | { ok: true; examinationId: string; tokenId: string; expiresAt: string }
  | { ok: false; reason: "not_found" | "revoked" | "expired" };

export async function validateMedicalExamToken(
  supabase: SupabaseClient,
  token: string,
): Promise<MedicalTokenValidation> {
  const { data, error } = await supabase
    .from("medical_examination_tokens")
    .select("id, examination_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "not_found" };
  if (data.revoked_at) return { ok: false, reason: "revoked" };
  if (new Date(data.expires_at) < new Date()) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    examinationId: data.examination_id,
    tokenId: data.id,
    expiresAt: data.expires_at,
  };
}
