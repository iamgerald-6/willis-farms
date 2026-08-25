import type { SupabaseClient } from "@supabase/supabase-js";

export type SystemConfigAuditScope = "business_logic" | "form_definition" | "option";
export type SystemConfigAuditAction =
  | "created"
  | "updated"
  | "deactivated"
  | "reactivated";

export type SystemConfigAuditEntry = {
  id: string;
  module_id: string;
  config_scope: SystemConfigAuditScope;
  entity_key: string | null;
  entity_label: string | null;
  action: SystemConfigAuditAction;
  changed_fields: string[] | null;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  performed_by: string;
  performed_by_name: string;
  performed_at: string;
};

/**
 * Writes one row to system_config_audit_log (see
 * docs/system-definitions/audit-log.sql). Mirrors writeSopAuditLog /
 * writeAuditLog — fire-and-forget: an audit-log failure is logged but never
 * blocks the actual System Definitions save that triggered it.
 */
export async function writeSystemConfigAuditLog(
  supabase: SupabaseClient,
  params: {
    module_id: string;
    config_scope: SystemConfigAuditScope;
    entity_key?: string | null;
    entity_label?: string | null;
    action: SystemConfigAuditAction;
    changed_fields?: string[] | null;
    previous_values?: Record<string, unknown> | null;
    new_values?: Record<string, unknown> | null;
    performed_by?: string | null;
    performed_by_name?: string | null;
  },
) {
  if (!params.performed_by || !params.performed_by_name) {
    console.warn(
      "[writeSystemConfigAuditLog] Skipped — missing performer info",
      {
        module_id: params.module_id,
        action: params.action,
        performed_by: params.performed_by,
      },
    );
    return;
  }

  const { error } = await supabase.from("system_config_audit_log").insert([
    {
      module_id: params.module_id,
      config_scope: params.config_scope,
      entity_key: params.entity_key ?? null,
      entity_label: params.entity_label ?? null,
      action: params.action,
      changed_fields: params.changed_fields ?? null,
      previous_values: params.previous_values ?? null,
      new_values: params.new_values ?? null,
      performed_by: params.performed_by,
      performed_by_name: params.performed_by_name,
      performed_at: new Date().toISOString(),
    },
  ]);
  if (error) {
    console.error("[writeSystemConfigAuditLog] Insert failed:", error);
  }
}

/** Shallow diff of two plain-object "field bags" — used for both
 * business_logic (top-level keys) and system_options rows (label,
 * legacy_value, sort_order, is_active, rules). Deep-equality is done via
 * JSON.stringify since every value here is JSON-serializable config. */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  keys: string[],
): {
  changedFields: string[];
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
} {
  const changedFields: string[] = [];
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const key of keys) {
    const beforeVal = before?.[key];
    const afterVal = after?.[key];
    if (JSON.stringify(beforeVal ?? null) === JSON.stringify(afterVal ?? null)) {
      continue;
    }
    changedFields.push(key);
    previousValues[key] = beforeVal ?? null;
    newValues[key] = afterVal ?? null;
  }

  return { changedFields, previousValues, newValues };
}
