"use client";

import { FileText, ExternalLink } from "lucide-react";
import type {
  EducationEntry,
  UploadedFile,
  WorkHistoryEntry,
} from "@/lib/careers/applicationFormSchema";

type Props = {
  formData: Record<string, unknown>;
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
  | { kind: "text"; label: string; text: string }
  | { kind: "list"; label: string; lines: string[] }
  | { kind: "files"; label: string; files: { name: string; url: string }[] };

function buildItem(
  key: string,
  label: string,
  value: unknown,
): ReviewItem | null {
  if (value === undefined || value === null || value === "") return null;

  // Any single-file upload field (cv, passport_bio_page, ...) is an object
  // with secure_url — not just "cv" specifically.
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

    // Field keys match ApplicationFieldRules.fieldKey in recruitmentDefaults.ts
    // — "work_experience" and "education", not "work_history"/"education_history".
    if (key === "work_experience") {
      const lines = (value as WorkHistoryEntry[]).map((entry) => {
        const end = entry.current ? "Present" : entry.end || "—";
        return `${entry.title || "Role"} at ${entry.company || "Company"} (${entry.start || "?"} – ${end})`;
      });
      return { kind: "list", label, lines };
    }

    if (key === "education") {
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
        .map((f) => ({ name: f.original_name || "File", url: f.secure_url }));
      if (files.length === 0) return null;
      return { kind: "files", label, files };
    }

    return { kind: "text", label, text: value.map(String).join(", ") };
  }

  if (typeof value === "object") return null;
  return { kind: "text", label, text: String(value) };
}

// Keys here must match ApplicationFieldRules.fieldKey in
// src/lib/systemDefinitions/recruitmentDefaults.ts — this is meant to show
// everything an applicant filled in, so a stale/mismatched key here just
// silently hides that field from HR.
const FIELD_SECTIONS: {
  title: string;
  fields: { key: string; label: string }[];
}[] = [
  {
    title: "Personal",
    fields: [
      { key: "first_name", label: "First name" },
      { key: "last_name", label: "Last name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "date_of_birth", label: "Date of birth" },
      { key: "gender", label: "Gender" },
      { key: "nationality", label: "Nationality" },
      { key: "is_citizen", label: "Ghana citizen" },
      { key: "ghana_card_no", label: "Ghana Card" },
      { key: "passport_number", label: "Passport number" },
      { key: "passport_bio_page", label: "Passport bio page" },
    ],
  },
  {
    title: "Experience & qualifications",
    fields: [
      { key: "work_experience", label: "Work history" },
      { key: "education", label: "Education" },
      { key: "certificates", label: "Educational certificates" },
    ],
  },
  {
    title: "Documents",
    fields: [{ key: "cover_letter", label: "Cover letter" }],
  },
  // Referees 1–5 (1 and 2 required, 3–5 optional "add another" slots — see
  // MAX_REFEREES in recruitmentDefaults.ts). Sections with no data are
  // dropped below, so unused optional slots simply don't render.
  ...Array.from({ length: 5 }, (_, i) => i + 1).map((n) => ({
    title: `Referee ${n}`,
    fields: [
      { key: `reference_${n}_name`, label: "Referee name" },
      { key: `reference_${n}_phone`, label: "Referee phone" },
      { key: `reference_${n}_email`, label: "Referee email" },
      { key: `reference_${n}_relationship`, label: "Relationship" },
    ],
  })),
];

export default function ApplicationFormReview({ formData }: Props) {
  const normalized = normalizeApplicationFormData(formData);
  const sections = FIELD_SECTIONS.map((section) => ({
    ...section,
    items: section.fields
      .map((field) => buildItem(field.key, field.label, formData[field.key]))
      .filter((item): item is ReviewItem => item !== null),
  })).filter((section) => section.items.length > 0);

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
                item.label === "Cover letter";
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
                        <a
                          key={`${f.url}-${i}`}
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline w-fit"
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          {f.name}
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
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
