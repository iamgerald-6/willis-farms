/** Per-option rules stored in system_options.rules (JSONB). */
export interface SystemOptionRules {
  requires_document?: boolean;
  requires_reason?: boolean;
}

/** Row shape for public.system_options */
export interface SystemOption {
  id: string;
  module_id: string;
  option_list: string;
  label: string;
  legacy_value: string | null;
  sort_order: number;
  is_active: boolean;
  rules: SystemOptionRules;
  created_at?: string;
  updated_at?: string;
}

export type SystemOptionInput = {
  module_id: string;
  option_list: string;
  label: string;
  legacy_value: string;
  sort_order?: number;
  rules?: SystemOptionRules;
};

export type SystemOptionUpdate = Partial<
  Pick<SystemOption, "label" | "legacy_value" | "sort_order" | "is_active" | "rules">
>;
