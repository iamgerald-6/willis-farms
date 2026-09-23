import Anthropic from "@anthropic-ai/sdk";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import type { OnboardingFormData } from "@/lib/careers/onboardingTypes";
import type {
  MedicalFormResponses,
  MedicalFormSchema,
  MedicalReferralData,
} from "@/lib/medical/medicalFormSchema";
import { normalizeMedicalFormSchema } from "@/lib/medical/medicalFormSchema";
import {
  formatMedicalExamSummaryForEmail,
  serializeMedicalExamForPrompt,
  type MedicalExamIntelSummary,
} from "@/lib/medical/serializeMedicalExamForPrompt";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUMMARY_TOOL = {
  name: "record_medical_exam_summary",
  description:
    "Records an HR-facing summary of a submitted occupational medical examination for Wills Farms.",
  input_schema: {
    type: "object" as const,
    properties: {
      executive_summary: {
        type: "string",
        description:
          "3-5 sentences for executives — overall medical outcome, fitness for role, and anything requiring immediate HR attention.",
      },
      fitness_overview: {
        type: "string",
        description:
          "2-4 sentences explaining fitness for the offered role and any swine-contact / barn environment considerations.",
      },
      key_findings: {
        type: "array",
        description: "4-8 concise bullet points of the most important findings across history, exam, and investigations.",
        items: { type: "string" },
      },
      clinical_highlights: {
        type: "array",
        description: "3-6 bullet points on vitals, clinical systems, and physician narrative highlights.",
        items: { type: "string" },
      },
      investigation_notes: {
        type: "string",
        description: "2-4 sentences summarising lab/investigation results and any flagged values.",
      },
      hr_recommendations: {
        type: "array",
        description:
          "2-5 actionable recommendations for HR (e.g. follow-up tests, restrictions to communicate, onboarding clearance).",
        items: { type: "string" },
      },
      fitness_determination: {
        type: "string",
        description:
          "The physician's fitness determination exactly as recorded (Fit / Fit with restrictions / Temporarily unfit / Not fit for this role), or best inference from the record.",
      },
      restrictions_or_accommodations: {
        type: "string",
        description: "Any restrictions or accommodations noted, or empty string if none.",
      },
    },
    required: [
      "executive_summary",
      "fitness_overview",
      "key_findings",
      "clinical_highlights",
      "investigation_notes",
      "hr_recommendations",
      "fitness_determination",
    ],
  },
};

function buildFallbackSummary(
  responses: MedicalFormResponses,
  referral: MedicalReferralData,
): MedicalExamIntelSummary {
  const fitness = responses.fields?.fitness?.toString()?.trim() ?? "Not recorded";
  const restrictions = responses.fields?.restrictions?.toString()?.trim();
  const narrative = responses.fields?.narrative?.toString()?.trim();

  return {
    executive_summary: `Occupational medical examination submitted for ${referral.full_name ?? "the candidate"}. Physician determination: ${fitness}. Review the attached full examination PDF for clinical detail.`,
    fitness_overview: narrative?.slice(0, 400) ?? "See attached examination form for clinical findings.",
    key_findings: narrative ? [narrative.slice(0, 280)] : ["Full examination attached — review PDF for details."],
    clinical_highlights: [],
    investigation_notes: "See attached examination form for investigation results.",
    hr_recommendations: [
      fitness === "Fit"
        ? "Proceed with onboarding clearance subject to HR review of the full report."
        : "Review fitness determination and any restrictions before confirming onboarding clearance.",
    ],
    fitness_determination: fitness,
    restrictions_or_accommodations: restrictions,
  };
}

export async function generateMedicalExamIntelSummary(params: {
  rawSchema: unknown;
  responses: MedicalFormResponses;
  referral: MedicalReferralData;
  formData?: OnboardingFormData;
  candidateName: string;
  roleTitle: string;
}): Promise<{ summary: MedicalExamIntelSummary; formatted: string; generated_by: "intel" | "fallback" }> {
  const schema = normalizeMedicalFormSchema(params.rawSchema);
  if (!schema) {
    throw new Error("Medical form schema is invalid.");
  }

  const examText = serializeMedicalExamForPrompt({
    schema,
    responses: params.responses,
    referral: params.referral,
    candidateDeclared: {
      blood_group: params.formData?.medical?.blood_group,
      allergies: params.formData?.medical?.allergies,
    },
  });

  if (!process.env.ANTHROPIC_API_KEY) {
    const summary = buildFallbackSummary(params.responses, params.referral);
    return {
      summary,
      formatted: formatMedicalExamSummaryForEmail(summary),
      generated_by: "fallback",
    };
  }

  try {
    const prompt =
      `You are preparing a confidential HR/executive summary of a submitted occupational medical examination for Wills Farms Ltd. (swine production / agribusiness in Ghana).\n\n` +
      `Candidate: ${params.candidateName}\n` +
      `Role: ${params.roleTitle}\n\n` +
      `Write for HR and executives — plain language, no markdown, no asterisks. Be factual and conservative; do not invent results not in the record. Flag abnormal findings and fitness restrictions clearly.\n\n` +
      `--- EXAMINATION RECORD ---\n${examText}`;

    const response = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 2000,
      tools: [SUMMARY_TOOL],
      tool_choice: { type: "tool", name: "record_medical_exam_summary" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    const raw =
      toolBlock && toolBlock.type === "tool_use"
        ? (toolBlock.input as MedicalExamIntelSummary)
        : null;

    if (!raw?.executive_summary?.trim()) {
      const summary = buildFallbackSummary(params.responses, params.referral);
      return {
        summary,
        formatted: formatMedicalExamSummaryForEmail(summary),
        generated_by: "fallback",
      };
    }

    const summary: MedicalExamIntelSummary = {
      executive_summary: raw.executive_summary.trim(),
      fitness_overview: raw.fitness_overview?.trim() ?? "",
      key_findings: (raw.key_findings ?? []).filter((s) => s?.trim()),
      clinical_highlights: (raw.clinical_highlights ?? []).filter((s) => s?.trim()),
      investigation_notes: raw.investigation_notes?.trim() ?? "",
      hr_recommendations: (raw.hr_recommendations ?? []).filter((s) => s?.trim()),
      fitness_determination: raw.fitness_determination?.trim() ?? "Not recorded",
      restrictions_or_accommodations: raw.restrictions_or_accommodations?.trim(),
    };

    return {
      summary,
      formatted: formatMedicalExamSummaryForEmail(summary),
      generated_by: "intel",
    };
  } catch (err) {
    console.error("[generateMedicalExamIntelSummary]", err);
    const summary = buildFallbackSummary(params.responses, params.referral);
    return {
      summary,
      formatted: formatMedicalExamSummaryForEmail(summary),
      generated_by: "fallback",
    };
  }
}
