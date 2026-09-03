"use client";

import { FileText, ExternalLink } from "lucide-react";
import type {
  ApplicationFieldType,
  ApplicationFormField,
  EducationEntry,
  UploadedFile,
  UploadedFileCategory,
  WorkHistoryEntry,
} from "@/lib/careers/applicationFormSchema";
import {
  isEducationFieldsType,
  isWorkFieldsType,
  normalizeApplicationFields,
  resolveUploadCategoryLabel,
} from "@/lib/careers/applicationFormSchema";
import { getDefaultApplicationFormFields } from "@/lib/systemDefinitions/recruitmentDefaults";
import {
  parseApplicationFormFieldsSnapshot,
  resolveApplicationFormSteps,
  type ApplicationFormConfig,
} from "@/lib/systemDefinitions/applicationFormConfig";

type Props = {
  formData: Record<string, unknown>;
  /** Saved snapshot of exactly which fields/sections existed on the
   * application form when this candidate submitted (application record's
   * application_form_fields_snapshot column) — this drives which sections
   * render below, so a custom field (e.g. "Professional qualifications")
   * shows up automatically without a hardcoded field-key list here.
   * Applications submitted before this snapshot existed fall back to
   * today's default fields as the closest available approximation. */
  fieldsSnapshot?: Record<string, unknown> | null;
};

function normalizeApplicationFormData(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const data = { ...raw };

  if (!data.work_history && Array.isArray(data.work_experience)) {
    data.work_history = data.work_experience;
  }
  if (!data.education_history && Array.isArray(data.education)) {
    data.education_history = data.education;
  }
  if (!data.ghana_card && data.ghana_card_no) {
    data.ghana_card = data.ghana_card_no;
  }

  return data;
}

type ReviewItem =
  | { kind: "text"; label: string; text: string; fieldType?: ApplicationFieldType }
  | { kind: "list"; label: string; lines: string[] }
  | {
      kind: "files";
      label: string;
      files: { name: string; url: string; category?: UploadedFileCategory }[];
    };

function buildItem(field: ApplicationFormField, value: unknown): ReviewItem | null {
  const { fieldType } = field.rules;
  const label = field.label;

  if (value === undefined || value === null || value === "") return null;

  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "secure_url" in value
  ) {
    const file = value as { original_name?: string; secure_url?: string };
    if (!file.secure_url) return null;
    return {
      kind: "files",
      label,
      files: [{ name: file.original_name || "File", url: file.secure_url }],
    };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null;

    // Any field of this shape — Work experience, Education, Professional
    // qualifications, or a future field built the same way — renders as a
    // list of entries, driven by its fieldType rather than its exact key.
    if (isWorkFieldsType(fieldType)) {
      const lines = (value as WorkHistoryEntry[]).map((entry) => {
        const end = entry.current ? "Present" : entry.end || "—";
        return `${entry.title || "Role"} at ${entry.company || "Company"} (${entry.start || "?"} – ${end})`;
      });
      return { kind: "list", label, lines };
    }

    if (isEducationFieldsType(fieldType)) {
      const lines = (value as EducationEntry[]).map((entry) => {
        const degree = entry.degree?.trim() ? ` — ${entry.degree}` : "";
        return `${entry.institutionType || "Institution"}: ${entry.institutionName || "—"} (${entry.yearStarted || "?"}–${entry.yearCompleted || "?"}${degree})`;
      });
      return { kind: "list", label, lines };
    }

    if (
      value.every(
        (item) =>
          typeof item === "object" && item !== null && "secure_url" in item,
      )
    ) {
      const files = (value as UploadedFile[])
        .filter((f) => f.secure_url)
        .map((f) => ({
          name: f.original_name || "File",
          url: f.secure_url,
          category: f.category,
        }));
      if (files.length === 0) return null;
      return { kind: "files", label, files };
    }

    return { kind: "text", label, text: value.map(String).join(", ") };
  }

  if (typeof value === "object") return null;
  return { kind: "text", label, text: String(value), fieldType };
}

// Referee contact fields are auto-generated (reference_N_name, _phone,
// _email, _relationship — see generateRefereeFormFields) rather than
// individually configured, so they're grouped per referee number here
// instead of going through the generic per-step loop below.
const REFEREE_KEY_PATTERN = /^reference_(\d+)_(name|phone|email|relationship)$/;
const REFEREE_SUFFIX_LABELS: Record<string, string> = {
  name: "Referee name",
  phone: "Referee phone",
  email: "Referee email",
  relationship: "Relationship",
};

function resolveFormContext(
  fieldsSnapshot: Record<string, unknown> | null | undefined,
): { fields: ApplicationFormField[]; config: ApplicationFormConfig } {
  const parsed = parseApplicationFormFieldsSnapshot(fieldsSnapshot);
  if (parsed) return parsed;
  return {
    fields: normalizeApplicationFields(getDefaultApplicationFormFields(), {}),
    config: {},
  };
}

export default function ApplicationFormReview({ formData, fieldsSnapshot }: Props) {
  const normalized = normalizeApplicationFormData(formData);
  const { fields, config } = resolveFormContext(fieldsSnapshot);
  const activeFields = fields.filter((f) => f.is_active !== false);
  const steps = resolveApplicationFormSteps(config);

  const sections: { title: string; items: ReviewItem[] }[] = [];

  for (const step of steps) {
    // Referees render below, grouped per referee rather than as one flat list.
    if (step.id === "references") continue;
    // File uploads (e.g. the certificates upload) render after the
    // qualification-detail fields they support — a field like Professional
    // Qualification should read above the upload that backs it up, not
    // below, regardless of which was added to the form more recently.
    const stepFields = activeFields
      .filter((f) => f.rules.step === step.id)
      .sort((a, b) => {
        const aFile = a.rules.fieldType === "file" ? 1 : 0;
        const bFile = b.rules.fieldType === "file" ? 1 : 0;
        if (aFile !== bFile) return aFile - bFile;
        return a.sort_order - b.sort_order;
      });
    const items = stepFields
      .map((f) => buildItem(f, normalized[f.rules.fieldKey]))
      .filter((item): item is ReviewItem => item !== null);
    if (items.length > 0) sections.push({ title: step.label, items });
  }

  const refereeFields = activeFields.filter((f) =>
    REFEREE_KEY_PATTERN.test(f.rules.fieldKey),
  );
  const refereeNumbers = Array.from(
    new Set(
      refereeFields
        .map((f) => f.rules.fieldKey.match(REFEREE_KEY_PATTERN)?.[1])
        .filter((n): n is string => Boolean(n))
        .map(Number),
    ),
  ).sort((a, b) => a - b);

  for (const n of refereeNumbers) {
    const group = refereeFields.filter((f) =>
      f.rules.fieldKey.startsWith(`reference_${n}_`),
    );
    const items = group
      .map((f) => {
        const suffix = f.rules.fieldKey.match(REFEREE_KEY_PATTERN)?.[2] ?? "";
        const label = REFEREE_SUFFIX_LABELS[suffix] ?? f.label;
        return buildItem({ ...f, label }, normalized[f.rules.fieldKey]);
      })
      .filter((item): item is ReviewItem => item !== null);
    if (items.length > 0) sections.push({ title: `Referee ${n}`, items });
  }

  if (sections.length === 0) {
    return (
      <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-4">
        No application form details on file.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Job application
      </p>
      {sections.map((section) => (
        <div
          key={section.title}
          className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-3"
        >
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            {section.title}
          </p>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {section.items.map((item) => {
              const fullWidth =
                item.kind === "list" ||
                item.kind === "files" ||
                (item.kind === "text" && item.fieldType === "textarea");
              return (
                <div
                  key={item.label}
                  className={fullWidth ? "sm:col-span-2" : ""}
                >
                  <p className="text-xs text-gray-400">{item.label}</p>

                  {item.kind === "text" && (
                    <p className="font-medium text-gray-900 mt-0.5 whitespace-pre-wrap">
                      {item.text}
                    </p>
                  )}

                  {item.kind === "list" && (
                    <ul className="mt-1 space-y-1 list-disc pl-4 text-gray-900">
                      {item.lines.map((line, i) => (
                        <li key={i} className="font-medium">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}

                  {item.kind === "files" && (
                    <div className="mt-1 flex flex-col gap-1.5">
                      {item.files.map((f, i) => (
                        <div
                          key={`${f.url}-${i}`}
                          className="flex items-center gap-2"
                        >
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline w-fit"
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            {f.name}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                          {f.category && (
                            <span className="text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                              {resolveUploadCategoryLabel(fields, f.category)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
