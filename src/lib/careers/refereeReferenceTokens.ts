import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const REFEREE_LINK_DAYS = 14;

export function refereeTokenExpiry(from = new Date()): Date {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + REFEREE_LINK_DAYS);
  return expires;
}

export function generateRefereeTokenValue(): string {
  return randomBytes(32).toString("hex");
}

export async function revokeRefereeTokensForSlot(
  supabase: SupabaseClient,
  applicationId: string,
  refereeIndex: number,
): Promise<void> {
  await supabase
    .from("referee_reference_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("application_id", applicationId)
    .eq("referee_index", refereeIndex)
    .is("revoked_at", null);
}

export async function createRefereeReferenceToken(
  supabase: SupabaseClient,
  params: {
    applicationId: string;
    refereeIndex: number;
    refereeName: string;
    refereeEmail: string;
  },
): Promise<{ token: string; expiresAt: string; id: string }> {
  await revokeRefereeTokensForSlot(supabase, params.applicationId, params.refereeIndex);

  const token = generateRefereeTokenValue();
  const expiresAt = refereeTokenExpiry().toISOString();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("referee_reference_tokens")
    .insert({
      application_id: params.applicationId,
      referee_index: params.refereeIndex,
      referee_name: params.refereeName,
      referee_email: params.refereeEmail.toLowerCase(),
      token,
      expires_at: expiresAt,
      last_sent_at: now,
    })
    .select("id, token, expires_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create referee reference token");
  }

  return {
    id: data.id,
    token: data.token,
    expiresAt: data.expires_at,
  };
}

export type RefereeTokenValidation =
  | {
      ok: true;
      applicationId: string;
      tokenId: string;
      expiresAt: string;
      refereeIndex: number;
      refereeName: string;
      refereeEmail: string;
    }
  | { ok: false; reason: "not_found" | "revoked" | "expired" };

export async function validateRefereeReferenceToken(
  supabase: SupabaseClient,
  token: string,
): Promise<RefereeTokenValidation> {
  const { data, error } = await supabase
    .from("referee_reference_tokens")
    .select("id, application_id, expires_at, revoked_at, referee_index, referee_name, referee_email")
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
    refereeIndex: data.referee_index as number,
    refereeName: data.referee_name,
    refereeEmail: data.referee_email,
  };
}
