import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ONBOARDING_LINK_DAYS = 7;

export function onboardingTokenExpiry(from = new Date()): Date {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + ONBOARDING_LINK_DAYS);
  return expires;
}

export function generateOnboardingTokenValue(): string {
  return randomBytes(32).toString("hex");
}

export async function revokeActiveTokens(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<void> {
  await supabase
    .from("onboarding_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("application_id", applicationId)
    .is("revoked_at", null);
}

export async function createOnboardingToken(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<{ token: string; expiresAt: string; id: string }> {
  await revokeActiveTokens(supabase, applicationId);

  const token = generateOnboardingTokenValue();
  const expiresAt = onboardingTokenExpiry().toISOString();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("onboarding_tokens")
    .insert({
      application_id: applicationId,
      token,
      expires_at: expiresAt,
      last_sent_at: now,
    })
    .select("id, token, expires_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create onboarding token");
  }

  return {
    id: data.id,
    token: data.token,
    expiresAt: data.expires_at,
  };
}

export type TokenValidation =
  | { ok: true; applicationId: string; tokenId: string; expiresAt: string }
  | { ok: false; reason: "not_found" | "revoked" | "expired" };

export async function validateOnboardingToken(
  supabase: SupabaseClient,
  token: string,
): Promise<TokenValidation> {
  const { data, error } = await supabase
    .from("onboarding_tokens")
    .select("id, application_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "not_found" };
  if (data.revoked_at) return { ok: false, reason: "revoked" };
  if (new Date(data.expires_at) < new Date()) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    applicationId: data.application_id,
    tokenId: data.id,
    expiresAt: data.expires_at,
  };
}
