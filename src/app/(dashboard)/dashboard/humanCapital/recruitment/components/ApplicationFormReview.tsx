"use client";

import type { EducationEntry, UploadedFile, WorkHistoryEntry } from "@/lib/careers/applicationFormSchema";

type Props = {
  formData: Record<string, unknown>;
};

function normalizeApplicationFormData(raw: Record<string, unknown>): Record<string, unknown> {
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

function formatValue(key: string, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;

  if (key === "cv" && typeof value === "object" && value !== null) {
    const file = value as { original_name?: string; secure_url?: string };
    return file.original_name ?? file.secure_url ?? "Uploaded";
  }

  if (key === "work_history" || key === "work_experience") {
    const entries = Array.isArray(value) ? value : [];
    if (entries.length === 0) return null;
    return entries
      .map((entry) => {
        const e = entry as WorkHistoryEntry & {
          employer?: string;
          job_title?: string;
          from?: string;
          to?: string;
        };
        const end = e.current ? "Present" : e.end || e.to || "—";
        const title = e.title || e.job_title || "Role";
        const company = e.company || e.employer || "Company";
        const start = e.start || e.from || "?";
        return `${title} at ${company} (${start} – ${end})`;
      })
      .join("\n");
  }

  if (key === "education_history" || key === "education") {
    const entries = Array.isArray(value) ? value : [];
    if (entries.length === 0) return null;
    return entries
      .map((entry) => {
        const e = entry as EducationEntry & {
          institution?: string;
          from?: string;
          to?: string;
        };
        const degree = e.degree?.trim() ? ` — ${e.degree}` : "";
        const institution = e.institutionName || e.institution || "—";
        const type = e.institutionType ? `${e.institutionType}: ` : "";
        const start = e.yearStarted || e.from || "?";
        const end = e.yearCompleted || e.to || "?";
        return `${type}${institution} (${start}–${end}${degree})`;
      })
      .join("\n");
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((item) => typeof item === "object" && item !== null && "secure_url" in item)) {
      return (value as UploadedFile[]).map((f) => f.original_name || "File").join(", ");
    }
    return value.map(String).join(", ");
  }

  if (typeof value === "object") return null;
  return String(value);
}

const FIELD_SECTIONS: { title: string; fields: { key: string; label: string }[] }[] = [
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
      { key: "ghana_card", label: "Ghana Card" },
      { key: "passport_number", label: "Passport number" },
      { key: "location", label: "Location" },
    ],
  },
  {
    title: "Experience & qualifications",
    fields: [
      { key: "work_history", label: "Work history" },
      { key: "education_history", label: "Education" },
      { key: "years_experience", label: "Years of experience" },
      { key: "skills", label: "Skills" },
    ],
  },
  {
    title: "Documents",
    fields: [
      { key: "cv", label: "CV / résumé" },
      { key: "cover_letter", label: "Cover letter" },
      { key: "certificates", label: "Certificates" },
    ],
  },
  {
    title: "Referee",
    fields: [
      { key: "reference_1_name", label: "Referee name" },
      { key: "reference_1_phone", label: "Referee phone" },
      { key: "reference_1_email", label: "Referee email" },
      { key: "reference_1_relationship", label: "Relationship" },
    ],
  },
  {
    title: "Second referee",
    fields: [
      { key: "reference_2_name", label: "Referee name" },
      { key: "reference_2_phone", label: "Referee phone" },
      { key: "reference_2_email", label: "Referee email" },
      { key: "reference_2_relationship", label: "Relationship" },
    ],
  },
];

export default function ApplicationFormReview({ formData }: Props) {
  const normalized = normalizeApplicationFormData(formData);
  const sections = FIELD_SECTIONS.map((section) => ({
    ...section,
    items: section.fields
      .map((field) => ({
        label: field.label,
        value: formatValue(field.key, normalized[field.key]),
      }))
      .filter((item) => item.value),
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
            {section.items.map((item) => (
              <div
                key={item.label}
                className={
                  item.label === "Cover letter" ||
                  item.label === "Work history" ||
                  item.label === "Education"
                    ? "sm:col-span-2"
                    : ""
                }
              >
                <p className="text-xs text-gray-400">{item.label}</p>
                <p className="font-medium text-gray-900 mt-0.5 whitespace-pre-wrap">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
