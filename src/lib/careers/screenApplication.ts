import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getInterviewGuideKeyForRoleSlug } from "@/lib/careers/openings";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import { fetchAndAppendStatusHistory } from "@/lib/careers/statusHistory";
import { fetchGradeLevelsConfig } from "@/lib/grades/fetchGradeLevelsConfig";
import { resolveAgeRangeForGuideKey } from "@/lib/systemDefinitions/gradeLevelsConfig";
import type {
  ApplicationFormField,
  EducationEntry,
  UploadedFile,
  WorkHistoryEntry,
} from "@/lib/careers/applicationFormSchema";
import {
  isEducationFieldsType,
  isWorkFieldsType,
  normalizeApplicationFields,
  resolveUploadCategoryLabel,
} from "@/lib/careers/applicationFormSchema";
import { getDefaultApplicationFormFields } from "@/lib/systemDefinitions/recruitmentDefaults";
import { parseApplicationFormFieldsSnapshot } from "@/lib/systemDefinitions/applicationFormConfig";

export const SHORTLIST_THRESHOLD = 60;

const MAX_BYTES = 20 * 1024 * 1024;
// Combined cap across the CV plus every certificate sent in one screening
// call — keeps well under Anthropic's request-size limits even when an
// applicant has uploaded several large documents.
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type AgeScreeningContext = {
  gradeId: string;
  ageMin: number;
  ageMax: number;
  applicantAge: number | null;
  ageWithinRange: boolean | null;
};

function buildScreeningTool(ageContext: AgeScreeningContext | null) {
  const properties: Record<string, Record<string, unknown>> = {
    score: {
      type: "number",
      description:
        "Overall match score from 0 to 100 reflecting how well the CV matches the job's key responsibilities, minimum qualifications, experience requirements, and required skills/attributes. Be realistic and discriminating — most CVs are not a perfect match.",
    },
    summary: {
      type: "string",
      description:
        "A brief 1-3 sentence rationale for the score: the strongest matches and the clearest gaps, so a human reviewer can quickly sanity-check the call.",
    },
    certificate_validation_summary: {
      type: "string",
      description:
        "Only include when supporting documents were provided below. Name every uploaded document and its tagged category, and for each one: if it's tagged with one of the applicant's structured entry sections (e.g. Work Experience, Educational Qualifications, Professional Qualifications, or any similar section listed below), state whether it plausibly matches one of the applicant's corresponding entries in that section (institution/employer, role/qualification, dates — broad consistency, not exact wording) or state the specific discrepancy/mismatch found; if it's tagged Other, just state that it was uploaded and does not correspond to any specific field on the form. Keep it factual and concise — a couple of sentences per document.",
    },
  };

  const required = ["score", "summary"];

  if (ageContext) {
    properties.age_assessment = {
      type: "string",
      description:
        "Age eligibility analysis for HR (internal only — not shown to applicants). State the applicant's age (or that date of birth was missing), the configured age band for this grade level, whether they fall within the band, and how age affects shortlisting. Be factual and concise.",
    };
    required.push("age_assessment");
  }

  return {
    name: "record_application_screening",
    description:
      "Records how well an applicant's CV matches a job's requirements, for automatic shortlisting, and (when supporting documents were uploaded) whether those documents check out against what the applicant entered on the form.",
    input_schema: {
      type: "object" as const,
      properties,
      required,
    },
  };
}

type JobPostingSnippet = {
  title: string | null;
  interview_guide_key: string | null;
  key_responsibilities: string | null;
  minimum_qualifications: string | null;
  experience: string | null;
  required_skills_attributes: string | null;
};

export type ScreenApplicationInput = {
  id: string;
  role_title: string | null;
  role_slug?: string | null;
  job_posting_id: string | null;
  cv_url: string | null;
  /** Where the applicant's uploaded certificates and typed work/education
   * entries live — used to build the certificate validation pass. Absent
   * (or missing the relevant keys) simply skips that pass. */
  application_form_data?: Record<string, unknown> | null;
  /** Saved snapshot of which fields were on the application form when this
   * candidate submitted — used to discover every structured-entry section
   * (Work experience, Education, Professional qualifications, or any
   * similar field added later) to cross-check uploaded documents against,
   * instead of a hardcoded pair of field keys. Falls back to today's
   * default fields when absent (e.g. applications submitted before this
   * snapshot existed). */
  application_form_fields_snapshot?: Record<string, unknown> | null;
};

export type ScreenApplicationResult =
  | {
      ok: true;
      status: "shortlisted" | "under_review";
      score: number;
      summary: string;
      certificate_validation_summary?: string;
    }
  | { ok: false; error: string };

function isWordDoc(fileName: string, contentType: string | null): boolean {
  const name = fileName.toLowerCase();
  return (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    !!contentType?.includes("wordprocessingml") ||
    !!contentType?.includes("msword")
  );
}

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function imageMediaType(fileName: string, contentType: string | null): string | null {
  if (contentType && Object.values(IMAGE_MEDIA_TYPES).includes(contentType)) return contentType;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return IMAGE_MEDIA_TYPES[ext] ?? null;
}

type FetchedDoc =
  | { ok: true; content: Array<Record<string, unknown>>; bytes: number }
  | { ok: false; error: string };

/** Fetches and converts one document into Claude-ready content block(s) —
 * shared by the CV read and each certificate read below. `remainingBudget`
 * is what's left of MAX_TOTAL_BYTES; a file that would blow that combined
 * cap is skipped (not fetched at all) rather than erroring the whole run. */
async function fetchDocumentContent(url: string, remainingBudget: number): Promise<FetchedDoc> {
  const fileRes = await fetch(url);
  if (!fileRes.ok) return { ok: false, error: `Could not download (HTTP ${fileRes.status})` };
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) return { ok: false, error: "File too large to read" };
  if (buffer.byteLength > remainingBudget) {
    return { ok: false, error: "Skipped — combined document size limit for this screening pass was reached" };
  }

  const fileName = decodeURIComponent(url.split("/").pop() ?? "file");
  const contentType = fileRes.headers.get("content-type");
  const wordDoc = isWordDoc(fileName, contentType);
  const imgMediaType = imageMediaType(fileName, contentType);

  if (wordDoc) {
    const { value: text } = await mammoth.extractRawText({ buffer });
    if (!text.trim()) return { ok: false, error: "Couldn't read text from document" };
    return { ok: true, content: [{ type: "text", text }], bytes: buffer.byteLength };
  }
  if (imgMediaType) {
    return {
      ok: true,
      content: [
        { type: "image", source: { type: "base64", media_type: imgMediaType, data: buffer.toString("base64") } },
      ],
      bytes: buffer.byteLength,
    };
  }
  return {
    ok: true,
    content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
    ],
    bytes: buffer.byteLength,
  };
}

function formatWorkExperience(entries: WorkHistoryEntry[]): string {
  if (!entries.length) return "None entered.";
  return entries
    .map(
      (e, i) =>
        `${i + 1}. ${e.title || "Role"} at ${e.company || "Company"} (${e.start || "?"} – ${
          e.current ? "Present" : e.end || "?"
        })`,
    )
    .join("\n");
}

function formatEducation(entries: EducationEntry[]): string {
  if (!entries.length) return "None entered.";
  return entries
    .map((e, i) => {
      const degree = e.degree?.trim() ? `, ${e.degree.trim()}` : "";
      return `${i + 1}. ${e.institutionType || "Institution"}: ${e.institutionName || "—"} (${
        e.yearStarted || "?"
      }–${e.yearCompleted || "?"}${degree})`;
    })
    .join("\n");
}

/** Every field shaped like Work experience or Education (Professional
 * qualifications, or any future field built the same way) that a
 * supporting document could plausibly be tagged against. Resolved from
 * the application's saved form snapshot so a newly added field is picked
 * up automatically, with no code change here. */
function resolveStructuredEntryFields(
  fieldsSnapshot: Record<string, unknown> | null | undefined,
): ApplicationFormField[] {
  const parsed = parseApplicationFormFieldsSnapshot(fieldsSnapshot);
  const fields =
    parsed?.fields ?? normalizeApplicationFields(getDefaultApplicationFormFields(), {});
  return fields.filter(
    (f) =>
      f.is_active !== false &&
      (isWorkFieldsType(f.rules.fieldType) || isEducationFieldsType(f.rules.fieldType)),
  );
}

function formatStructuredEntries(field: ApplicationFormField, value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "None entered.";
  if (isWorkFieldsType(field.rules.fieldType)) {
    return formatWorkExperience(value as WorkHistoryEntry[]);
  }
  return formatEducation(value as EducationEntry[]);
}

function buildCertificateSectionIntro(
  structuredFields: ApplicationFormField[],
  formData: Record<string, unknown>,
): string {
  const entrySections = structuredFields.map(
    (f) =>
      `${f.label} the applicant entered:\n${formatStructuredEntries(f, formData[f.rules.fieldKey])}`,
  );
  return [
    "The applicant also uploaded supporting documents on the Experience & Qualifications step of the application, each tagged by the applicant with what it's supposed to be. Cross-check each one against what the applicant typed in below, and record your findings in the certificate_validation_summary field of the record_application_screening tool.",
    ...entrySections,
    "Each uploaded document follows below, labeled with its filename and tagged category.",
  ].join("\n\n");
}

function computeAgeFromDob(dob: string | null | undefined, asOf = new Date()): number | null {
  const trimmed = dob?.trim();
  if (!trimmed) return null;
  const born = new Date(trimmed);
  if (Number.isNaN(born.getTime())) return null;
  let age = asOf.getFullYear() - born.getFullYear();
  const monthDiff = asOf.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < born.getDate())) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

function resolveGuideKey(
  posting: JobPostingSnippet | null,
  roleSlug: string | null | undefined,
): string | null {
  const fromPosting = posting?.interview_guide_key?.trim();
  if (fromPosting) return fromPosting;
  const slug = roleSlug?.trim();
  if (!slug) return null;
  return getInterviewGuideKeyForRoleSlug(slug) ?? null;
}

function buildAgeContext(
  guideKey: string | null,
  gradeConfig: Awaited<ReturnType<typeof fetchGradeLevelsConfig>>,
  dateOfBirth: string | null,
): AgeScreeningContext | null {
  const ageRange = resolveAgeRangeForGuideKey(guideKey, gradeConfig);
  if (!ageRange) return null;
  const applicantAge = computeAgeFromDob(dateOfBirth);
  const ageWithinRange =
    applicantAge == null
      ? null
      : applicantAge >= ageRange.ageMin && applicantAge <= ageRange.ageMax;
  return {
    gradeId: ageRange.gradeId,
    ageMin: ageRange.ageMin,
    ageMax: ageRange.ageMax,
    applicantAge,
    ageWithinRange,
  };
}

function buildInstructions(
  posting: JobPostingSnippet | null,
  roleTitle: string,
  ageContext: AgeScreeningContext | null,
): string {
  const sections = posting
    ? [
        posting.key_responsibilities?.trim() &&
          `Key responsibilities:\n${posting.key_responsibilities.trim()}`,
        posting.minimum_qualifications?.trim() &&
          `Minimum qualifications:\n${posting.minimum_qualifications.trim()}`,
        posting.experience?.trim() && `Experience required:\n${posting.experience.trim()}`,
        posting.required_skills_attributes?.trim() &&
          `Required skills & attributes:\n${posting.required_skills_attributes.trim()}`,
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  const ageSection = ageContext
    ? [
        `Internal age eligibility (HR only — not disclosed to applicants): this role is grade ${ageContext.gradeId} with an age band of ${ageContext.ageMin}–${ageContext.ageMax} years.`,
        ageContext.applicantAge != null
          ? `The applicant's date of birth indicates they are ${ageContext.applicantAge} years old${
              ageContext.ageWithinRange === true
                ? " — within the configured band."
                : ageContext.ageWithinRange === false
                  ? " — outside the configured band. Treat this as a shortlisting cutoff: they should not be auto-shortlisted even if the CV otherwise scores well."
                  : "."
            }`
          : "Date of birth was not provided on the application — note this in age_assessment; they cannot be verified against the age band for auto-shortlisting.",
        "Include a clear age_assessment in your tool response covering age vs. the band and shortlisting impact.",
      ].join("\n")
    : "";

  return [
    `You are screening a CV against a job at Wills Farms, a farm operation in Ghana. The role is "${roleTitle}".`,
    sections
      ? `Here are the role's requirements:\n\n${sections}`
      : "No detailed job description is on file for this role — use the role title alone as the basis for judgment.",
    ageSection,
    "Read the attached CV and record a match score using the record_application_screening tool. Score realistically: a CV that clearly meets the minimum qualifications, has relevant experience, and shows the required skills should score highly; a CV missing several of these should score low. Don't be generous by default.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Grade one submitted application against its job posting CV requirements. */
export async function screenApplication(
  supabaseAdmin: SupabaseClient,
  application: ScreenApplicationInput,
): Promise<ScreenApplicationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server" };
  }

  if (!application.cv_url) {
    return { ok: false, error: "No CV on file for this application." };
  }

  const gradeConfig = await fetchGradeLevelsConfig(supabaseAdmin);

  let posting: JobPostingSnippet | null = null;
  if (application.job_posting_id) {
    const { data: postingRow } = await supabaseAdmin
      .from("job_postings")
      .select(
        "title, interview_guide_key, key_responsibilities, minimum_qualifications, experience, required_skills_attributes",
      )
      .eq("id", application.job_posting_id)
      .maybeSingle();
    posting = postingRow ?? null;
  }

  const formData = application.application_form_data ?? {};
  const dateOfBirth =
    typeof formData.date_of_birth === "string" ? formData.date_of_birth.trim() : null;
  const guideKey = resolveGuideKey(posting, application.role_slug);
  const ageContext = buildAgeContext(guideKey, gradeConfig, dateOfBirth);

  let remainingBudget = MAX_TOTAL_BYTES;

  const cv = await fetchDocumentContent(application.cv_url, remainingBudget);
  if (!cv.ok) {
    return { ok: false, error: `Could not read CV: ${cv.error}` };
  }
  remainingBudget -= cv.bytes;

  const certificates = Array.isArray(formData.certificates)
    ? (formData.certificates as UploadedFile[]).filter((f) => f?.secure_url)
    : [];
  const structuredFields = resolveStructuredEntryFields(
    application.application_form_fields_snapshot,
  );

  const instructions = buildInstructions(
    posting,
    application.role_title ?? "this role",
    ageContext,
  );
  const screeningTool = buildScreeningTool(ageContext);
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: instructions },
    ...cv.content,
  ];

  if (certificates.length > 0) {
    content.push({
      type: "text",
      text: buildCertificateSectionIntro(structuredFields, formData),
    });
    for (const cert of certificates) {
      const categoryLabel = cert.category
        ? resolveUploadCategoryLabel(structuredFields, cert.category)
        : "Uncategorized";
      const doc = await fetchDocumentContent(cert.secure_url, remainingBudget);
      if (!doc.ok) {
        content.push({
          type: "text",
          text: `Document: "${cert.original_name}" (tagged ${categoryLabel}) — could not be reviewed: ${doc.error}.`,
        });
        continue;
      }
      remainingBudget -= doc.bytes;
      content.push({ type: "text", text: `Document: "${cert.original_name}" (tagged ${categoryLabel}):` });
      content.push(...doc.content);
    }
  }

  const message = await anthropic.messages.create({
    model: TASK_MANAGER_AI_MODEL,
    max_tokens: 1536,
    tools: [screeningTool],
    tool_choice: { type: "tool", name: "record_application_screening" },
    messages: [{ role: "user", content: content as never }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  const result = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};
  const rawScore = Number(result.score);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;
  const scoreSummary = typeof result.summary === "string" ? result.summary : "";
  const ageAssessment =
    ageContext && typeof result.age_assessment === "string" ? result.age_assessment : undefined;
  const certificateValidationSummary =
    certificates.length > 0 && typeof result.certificate_validation_summary === "string"
      ? result.certificate_validation_summary
      : undefined;

  const ageBlocksShortlist =
    ageContext != null &&
    (ageContext.ageWithinRange === false || ageContext.applicantAge == null);

  const newStatus: "shortlisted" | "under_review" =
    score >= SHORTLIST_THRESHOLD && !ageBlocksShortlist ? "shortlisted" : "under_review";

  const statusHistory = await fetchAndAppendStatusHistory(supabaseAdmin, application.id, newStatus, null);

  const { error: updateErr } = await supabaseAdmin
    .from("job_applications")
    .update({
      status: newStatus,
      status_history: statusHistory,
      ai_screening: {
        score,
        summary: scoreSummary,
        model: TASK_MANAGER_AI_MODEL,
        screened_at: new Date().toISOString(),
        ...(ageContext
          ? {
              grade_level: ageContext.gradeId,
              age_min: ageContext.ageMin,
              age_max: ageContext.ageMax,
              applicant_age: ageContext.applicantAge,
              age_within_range: ageContext.ageWithinRange,
              ...(ageAssessment ? { age_assessment: ageAssessment } : {}),
            }
          : {}),
        ...(certificateValidationSummary
          ? { certificate_validation_summary: certificateValidationSummary }
          : {}),
      },
    })
    .eq("id", application.id);

  if (updateErr) return { ok: false, error: updateErr.message };

  return {
    ok: true,
    status: newStatus,
    score,
    summary: scoreSummary,
    ...(certificateValidationSummary ? { certificate_validation_summary: certificateValidationSummary } : {}),
  };
}
