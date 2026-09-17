import type {
  InvestigationDef,
  InvestigationEntry,
  InvestigationsData,
  PanelParameterValue,
} from "./medicalInvestigationDefs";

function str(extracted: Record<string, unknown>, key: string): string | undefined {
  const v = extracted[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Case-insensitive match against a def's option list, so AI output like
 * "positive" lines up with the exact-cased option ("Positive") admins set. */
function matchOption(value: string, options: string[]): string {
  const found = options.find((o) => o.toLowerCase() === value.toLowerCase());
  return found ?? value;
}

/**
 * Map AI-extracted lab results onto investigation entries (review required
 * before submission — see MedicalInvestigationsSection). Built dynamically
 * from the exam's own configured investigation list, so it stays correct
 * however HR has customized Part 4 in System Definitions.
 */
export function mergeExtractedLabResults(
  current: InvestigationsData,
  extracted: Record<string, unknown>,
  defs: InvestigationDef[],
): { data: InvestigationsData; prefilledCount: number } {
  const tests = { ...current.tests };
  let prefilledCount = 0;

  for (const def of defs) {
    if (def.kind === "select") {
      const raw = str(extracted, def.id);
      if (!raw) continue;
      tests[def.id] = { ...(tests[def.id] ?? {}), value: matchOption(raw, def.options), prefilled: true };
      prefilledCount += 1;
    } else if (def.kind === "text") {
      const value = str(extracted, def.id);
      const comment = def.allowComment ? str(extracted, `${def.id}_comment`) : undefined;
      if (!value && !comment) continue;
      tests[def.id] = {
        ...(tests[def.id] ?? {}),
        ...(value ? { value } : {}),
        ...(comment ? { comment } : {}),
        prefilled: true,
      };
      prefilledCount += 1;
    } else if (def.kind === "findings_flag") {
      const findings = str(extracted, `${def.id}_findings`);
      const flag = str(extracted, `${def.id}_flag`);
      if (!findings && !flag) continue;
      tests[def.id] = {
        ...(tests[def.id] ?? {}),
        expanded: true,
        ...(findings ? { findings } : {}),
        ...(flag ? { flag } : {}),
        prefilled: true,
      };
      prefilledCount += 1;
    } else if (def.kind === "panel") {
      const parameters: Record<string, PanelParameterValue> = { ...(tests[def.id]?.parameters ?? {}) };
      let any = false;
      for (const param of def.parameters) {
        const base = `${def.id}_${param.key}`;
        const value = str(extracted, base);
        if (!value) continue;
        const unit = str(extracted, `${base}_unit`);
        const ref = str(extracted, `${base}_ref`);
        const flag = str(extracted, `${base}_flag`);
        parameters[param.key] = {
          value,
          ...(unit ? { unit } : {}),
          ...(ref ? { reference_range: ref } : {}),
          ...(flag ? { flag } : {}),
        };
        any = true;
      }
      if (!any) continue;
      const prev: InvestigationEntry = tests[def.id] ?? {};
      tests[def.id] = { ...prev, expanded: true, parameters, prefilled: true };
      prefilledCount += 1;
    }
  }

  return { data: { ...current, tests }, prefilledCount };
}

/** Anthropic tool schema for lab report extraction — built from the exam's
 * own configured investigation list (Part 4 as HR set it up), not a fixed
 * hardcoded set, so extraction always matches what the form actually asks for. */
export function labReportExtractToolSchema(defs: InvestigationDef[]) {
  const props: Record<string, { type: "string" | "boolean"; description: string }> = {
    is_lab_report: {
      type: "boolean",
      description: "True if this is a laboratory or medical investigation report.",
    },
  };

  for (const def of defs) {
    if (def.kind === "select") {
      props[def.id] = {
        type: "string",
        description: `${def.label} result. One of: ${def.options.join(" / ")}. Empty if not found.`,
      };
    } else if (def.kind === "text") {
      props[def.id] = { type: "string", description: `${def.label} result. Empty if not found.` };
      if (def.allowComment) {
        props[`${def.id}_comment`] = {
          type: "string",
          description: `Short comment on the ${def.label} result, if any. Empty if not found.`,
        };
      }
    } else if (def.kind === "findings_flag") {
      props[`${def.id}_findings`] = {
        type: "string",
        description: `${def.label} findings/report summary. Empty if not found.`,
      };
      props[`${def.id}_flag`] = {
        type: "string",
        description: `Normal or Abnormal for ${def.label}. Empty if not found.`,
      };
    } else if (def.kind === "panel") {
      for (const param of def.parameters) {
        const base = `${def.id}_${param.key}`;
        props[base] = { type: "string", description: `${def.label} — ${param.label}. Empty if not found.` };
        props[`${base}_unit`] = {
          type: "string",
          description: `Unit for ${def.label} — ${param.label} (e.g. g/dL), as printed on the report. Empty if not found.`,
        };
        props[`${base}_ref`] = {
          type: "string",
          description: `Reference range for ${def.label} — ${param.label}, as printed on the report. Empty if not found.`,
        };
        props[`${base}_flag`] = {
          type: "string",
          description: `Normal/Low/High flag for ${def.label} — ${param.label}. Empty if not found.`,
        };
      }
    }
  }

  return {
    name: "record_lab_investigation_results",
    description:
      "Extract key laboratory investigation results from a medical lab report for an occupational medical examination. " +
      "Only extract the specific parameters listed — do not invent extra ones. Leave fields empty rather than guessing.",
    input_schema: {
      type: "object" as const,
      properties: props,
      required: ["is_lab_report"],
    },
  };
}
