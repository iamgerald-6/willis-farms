import { isSystemField } from "@/lib/appraisal/pipFormSchema";
import type {
  MedicalFormResponses,
  MedicalFormSchema,
  MedicalReferralData,
} from "@/lib/medical/medicalFormSchema";
import { getInvestigationDefs, medicalFieldLabel } from "@/lib/medical/medicalFormSchema";
import {
  HEARING_FAIL_NOTE_KEYS,
  VISUAL_ACUITY_FAIL_NOTE_KEYS,
} from "@/lib/medical/medicalClinicalVitals";
import type { InvestigationDef, InvestigationEntry } from "@/lib/medical/medicalInvestigationDefs";

function formatInvestigation(def: InvestigationDef, entry: InvestigationEntry): string | null {
  if (def.kind === "select" || def.kind === "text") {
    if (!entry.value?.trim() && !entry.comment?.trim()) return null;
    const parts = [entry.value?.trim(), entry.comment?.trim()].filter(Boolean);
    return `${def.label}: ${parts.join(" — ")}`;
  }
  if (def.kind === "findings_flag") {
    if (!entry.findings?.trim() && !entry.flag?.trim()) return null;
    const parts = [entry.findings?.trim(), entry.flag?.trim()].filter(Boolean);
    return `${def.label}: ${parts.join(" | Flag: ")}`;
  }
  if (def.kind === "result_flag") {
    if (!entry.value?.trim() && !entry.flag?.trim()) return null;
    const parts = [entry.value?.trim(), entry.flag?.trim() ? `Flag: ${entry.flag.trim()}` : ""].filter(Boolean);
    return `${def.label}: ${parts.join(" | ")}`;
  }
  if (def.kind === "panel") {
    if (entry.value?.trim() || entry.flag?.trim()) {
      const parts = [entry.value?.trim(), entry.flag?.trim() ? `Flag: ${entry.flag.trim()}` : ""].filter(Boolean);
      return `${def.label}: ${parts.join(" | ")}`;
    }
    const params = def.parameters
      .map((p) => {
        const pv = entry.parameters?.[p.key];
        if (!pv?.value?.trim()) return null;
        return `  ${p.label}: ${pv.value}${pv.flag ? ` [${pv.flag}]` : ""}`;
      })
      .filter(Boolean);
    if (params.length === 0) return null;
    return `${def.label}:\n${params.join("\n")}`;
  }
  return null;
}

/** Flatten a submitted examination into plain text for WillsOne Intel. */
export function serializeMedicalExamForPrompt(params: {
  schema: MedicalFormSchema;
  responses: MedicalFormResponses;
  referral: MedicalReferralData;
  candidateDeclared?: { blood_group?: string; allergies?: string };
}): string {
  const { schema, responses, referral, candidateDeclared } = params;
  const lines: string[] = [];

  lines.push("=== REFERRAL (Part 1) ===");
  for (const [label, value] of [
    ["Candidate", referral.full_name],
    ["Reference", referral.reference_number],
    ["Position", referral.position_offered],
    ["Department/site", referral.department_site],
    ["Examination type", referral.examination_type],
    ["Job category", referral.job_category],
    ["Facility", referral.designated_facility],
    ["Appointment date", referral.appointment_date],
  ] as const) {
    if (value?.trim()) lines.push(`${label}: ${value.trim()}`);
  }

  if (candidateDeclared?.blood_group?.trim() || candidateDeclared?.allergies?.trim()) {
    lines.push("\n=== CANDIDATE SELF-DECLARATION (onboarding) ===");
    if (candidateDeclared.blood_group?.trim()) {
      lines.push(`Declared blood group: ${candidateDeclared.blood_group.trim()}`);
    }
    if (candidateDeclared.allergies?.trim()) {
      lines.push(`Declared allergies: ${candidateDeclared.allergies.trim()}`);
    }
  }

  const investigationDefs = getInvestigationDefs(schema);

  for (const section of schema.sections) {
    lines.push(`\n=== ${section.title.toUpperCase()} ===`);

    if (section.kind === "fields" && section.key === "investigations") {
      const inv = responses.investigations ?? { tests: {}, other: [] };
      for (const def of investigationDefs) {
        const block = formatInvestigation(def, inv.tests[def.id] ?? {});
        if (block) lines.push(block);
      }
      for (const o of inv.other ?? []) {
        if (!o.name?.trim() && !o.result?.trim()) continue;
        lines.push(
          `Other — ${o.name || "—"}: ${o.result || "—"}${o.flag ? ` [${o.flag}]` : ""}`,
        );
      }
      const docs = [
        ...(responses.attachments ?? []),
        ...(responses.investigations?.lab_reports ?? []),
      ];
      if (docs.length > 0) {
        lines.push("Uploaded test results & imaging:");
        for (const doc of docs) {
          lines.push(`- ${doc.original_name ?? "Document"}`);
        }
      }
      continue;
    }

    if (section.kind === "fields" && section.key === "supporting_documents") {
      continue;
    }

    if (section.kind === "fields") {
      for (const field of section.fields.filter((f) => !isSystemField(f))) {
        const value = responses.fields?.[field.key]?.toString()?.trim();
        if (value) lines.push(`${medicalFieldLabel(field)}: ${value}`);
        const visualFailNoteKey =
          VISUAL_ACUITY_FAIL_NOTE_KEYS[field.key as keyof typeof VISUAL_ACUITY_FAIL_NOTE_KEYS];
        if (visualFailNoteKey) {
          const note = responses.fields?.[visualFailNoteKey]?.toString()?.trim();
          if (note) {
            lines.push(
              `  Fail reason (${field.key.includes("right") ? "right" : "left"} eye): ${note}`,
            );
          }
        }
        const hearingFailNoteKey =
          HEARING_FAIL_NOTE_KEYS[field.key as keyof typeof HEARING_FAIL_NOTE_KEYS];
        if (hearingFailNoteKey) {
          const note = responses.fields?.[hearingFailNoteKey]?.toString()?.trim();
          if (note) {
            lines.push(
              `  Fail reason (${field.key.includes("right") ? "right" : "left"} ear): ${note}`,
            );
          }
        }
      }
      continue;
    }

    const rows = responses.tables?.[section.key] ?? [];
    for (const row of rows) {
      const cells = section.columns
        .map((col) => {
          const v = row[col.key]?.toString()?.trim();
          return v ? `${col.label}: ${v}` : null;
        })
        .filter(Boolean);
      if (cells.length) lines.push(cells.join(" | "));
    }
  }

  return lines.join("\n");
}

export type MedicalExamIntelSummary = {
  executive_summary: string;
  fitness_overview: string;
  key_findings: string[];
  clinical_highlights: string[];
  investigation_notes: string;
  hr_recommendations: string[];
  fitness_determination: string;
  restrictions_or_accommodations?: string;
};

export function formatMedicalExamSummaryForEmail(summary: MedicalExamIntelSummary): string {
  const sections: string[] = [
    summary.executive_summary.trim(),
    "",
    "FITNESS OVERVIEW",
    summary.fitness_overview.trim(),
    "",
    `FITNESS DETERMINATION: ${summary.fitness_determination.trim()}`,
  ];

  if (summary.restrictions_or_accommodations?.trim()) {
    sections.push(`Restrictions / accommodations: ${summary.restrictions_or_accommodations.trim()}`);
  }

  if (summary.key_findings.length) {
    sections.push("", "KEY FINDINGS", ...summary.key_findings.map((f) => `• ${f}`));
  }

  if (summary.clinical_highlights.length) {
    sections.push("", "CLINICAL HIGHLIGHTS", ...summary.clinical_highlights.map((f) => `• ${f}`));
  }

  if (summary.investigation_notes.trim()) {
    sections.push("", "INVESTIGATIONS", summary.investigation_notes.trim());
  }

  if (summary.hr_recommendations.length) {
    sections.push("", "RECOMMENDATIONS FOR HR", ...summary.hr_recommendations.map((f) => `• ${f}`));
  }

  return sections.join("\n");
}
