"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  APPLICATION_STEP_LABELS,
  APPLICATION_STEPS,
  type ApplicationFieldStep,
  type ApplicationFormData,
  type ApplicationFormField,
  type EducationEntry,
  type UploadedFile,
  type WorkHistoryEntry,
  effectiveMaxLength,
  validateStep,
  visibleFieldsForStep,
} from "@/lib/careers/applicationFormSchema";
import type { JobPosting } from "@/lib/careers/jobPostings";
import { formatPublicJobTitle } from "@/lib/careers/jobPostings";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import { uploadHintForField } from "@/lib/uploadConstraints";
import { FormShell } from "@/components/Forms/FormShell";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { GhanaCardInput } from "@/components/GhanaCardInput";
import { WorkHistoryInput } from "@/components/WorkHistoryInput";
import { EducationHistoryInput } from "@/components/EducationHistoryInput";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  OPTIONAL_REFEREE_SLOTS,
  refereeAddKey,
  refereeFieldKeys,
  hasRefereeSlotData,
} from "@/lib/systemDefinitions/recruitmentDefaults";

// Applicants must be at least 15 years old — the latest a birthdate can be
// is exactly 15 years before today. Computed once at module load rather
// than per render/keystroke.
function minApplicantBirthdate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 15);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const MIN_APPLICANT_BIRTHDATE = minApplicantBirthdate();

type Props = {
  posting: JobPosting;
  fields: ApplicationFormField[];
  initialValues?: ApplicationFormData;
  draftToken?: string;
};

const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

function FieldBlock({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default function JobApplicationWizard({
  posting,
  fields,
  initialValues = {},
  draftToken,
}: Props) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<ApplicationFormData>(() => {
    const init: ApplicationFormData = { ...initialValues };
    for (const slot of OPTIONAL_REFEREE_SLOTS) {
      const key = refereeAddKey(slot);
      init[key] =
        initialValues[key] === "Yes" || hasRefereeSlotData(initialValues, slot) ? "Yes" : "";
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null);
  const [activeDraftToken, setActiveDraftToken] = useState(draftToken);
  const [extractingCv, setExtractingCv] = useState(false);
  const [cvFillNotice, setCvFillNotice] = useState<string | null>(null);

  const step = APPLICATION_STEPS[stepIndex];
  const stepFields = useMemo(
    () => visibleFieldsForStep(fields, step, values),
    [fields, step, values],
  );
  const documentsFieldsBeforeReferees = useMemo(
    () =>
      step === "documents"
        ? stepFields.filter((f) => !f.rules.fieldKey.startsWith("reference_"))
        : [],
    [step, stepFields],
  );
  const refereeFields = useMemo(
    () =>
      step === "documents"
        ? stepFields.filter((f) => f.rules.fieldKey.startsWith("reference_"))
        : [],
    [step, stepFields],
  );
  // Referee fields are grouped by slot number (1-5) rather than by fixed
  // "primary/secondary" names, so any number of optional slots can be added.
  const refereeFieldsBySlot = useMemo(() => {
    const map = new Map<number, ApplicationFormField[]>();
    for (const f of refereeFields) {
      const match = f.rules.fieldKey.match(/^reference_(\d+)_/);
      if (!match) continue;
      const slot = Number(match[1]);
      const list = map.get(slot) ?? [];
      list.push(f);
      map.set(slot, list);
    }
    return map;
  }, [refereeFields]);
  const requiredRefereeSlots = useMemo(
    () => [1, 2].filter((s) => refereeFieldsBySlot.has(s)),
    [refereeFieldsBySlot],
  );
  const visibleOptionalSlots = useMemo(
    () =>
      OPTIONAL_REFEREE_SLOTS.filter(
        (s) => refereeFieldsBySlot.has(s) && values[refereeAddKey(s)] === "Yes",
      ),
    [refereeFieldsBySlot, values],
  );
  const nextOptionalSlot = OPTIONAL_REFEREE_SLOTS.find(
    (s) => refereeFieldsBySlot.has(s) && values[refereeAddKey(s)] !== "Yes",
  );

  const addReferee = () => {
    if (nextOptionalSlot === undefined) return;
    setValues((prev) => ({ ...prev, [refereeAddKey(nextOptionalSlot)]: "Yes" }));
    setDraftSavedMessage(null);
    setError(null);
  };

  const removeReferee = (slot: number) => {
    setValues((prev) => {
      const next: ApplicationFormData = { ...prev, [refereeAddKey(slot)]: "" };
      for (const key of refereeFieldKeys(slot)) {
        next[key] = "";
      }
      return next;
    });
    setDraftSavedMessage(null);
    setError(null);
  };

  const setFieldValue = (key: string, value: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // is_citizen isn't asked directly anymore (see recruitmentDefaults.ts)
      // — it's derived from Nationality so the existing Ghana Card /
      // Passport showWhen rules (which key off is_citizen) keep working.
      // Blank nationality must clear is_citizen back to blank too — otherwise
      // switching nationality back to "Select…" left is_citizen stuck at
      // "No" (blank isn't "Ghana"), keeping Passport visible forever.
      if (key === "nationality") {
        next.is_citizen = !value ? "" : value === "Ghana" ? "Yes" : "No";
      }
      return next;
    });
    setDraftSavedMessage(null);
  };

  const goNext = () => {
    const errors = validateStep(fields, step, values);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, APPLICATION_STEPS.length - 1));
  };

  const saveApplication = async (finalize: boolean) => {
    if (finalize) {
      for (const s of APPLICATION_STEPS) {
        const stepErrors = validateStep(fields, s, values);
        if (stepErrors.length > 0) {
          setError(stepErrors[0]);
          return;
        }
      }
    } else {
      const stepErrors = validateStep(fields, step, values);
      if (stepErrors.length > 0) {
        setError(stepErrors[0]);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/careers/applications/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posting_id: posting.id,
          draft_token: activeDraftToken,
          form_data: values,
          finalize,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");

      if (finalize) {
        router.replace(
          `/apply/success?ref=${encodeURIComponent(json.data.reference_number)}&role=${encodeURIComponent(posting.title)}`,
        );
        return;
      }

      if (json.data.draft_token) {
        setActiveDraftToken(json.data.draft_token);
        const resumeUrl = `${window.location.origin}/apply/draft/${json.data.draft_token}`;
        setDraftSavedMessage(
          `Draft saved. Your reference is ${json.data.reference_number}. Resume anytime: ${resumeUrl}`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  type ExtractedCvFields = {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    date_of_birth: string;
    gender: string;
    nationality: string;
    work_experience: WorkHistoryEntry[];
    education: EducationEntry[];
  };

  // Reads whatever the CV extraction route found and fills in ONLY the
  // fields still blank — never overwrites something the applicant already
  // typed (e.g. if they re-upload a different CV after editing manually).
  // Everything it fills stays fully editable afterward.
  const handleExtractCv = async (fileUrl: string, fileName: string) => {
    setExtractingCv(true);
    setCvFillNotice(null);
    try {
      const res = await fetch("/api/careers/applications/extract-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_url: fileUrl, file_name: fileName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read the CV");
      const extracted = json.data as ExtractedCvFields;

      // setValues' updater isn't guaranteed to run synchronously (it's
      // batched into the next render), so a variable mutated inside it and
      // read right after can still be stale — compute the merge and the
      // "did we fill anything" flag together, inside the updater, and only
      // react to the result from there.
      setValues((prev) => {
        const next = { ...prev };
        let filledAnything = false;
        const fillText = (key: string, val: string) => {
          if (val && !String(next[key] ?? "").trim()) {
            next[key] = val;
            filledAnything = true;
          }
        };
        fillText("first_name", extracted.first_name);
        fillText("last_name", extracted.last_name);
        fillText("email", extracted.email);
        fillText("phone", extracted.phone);
        fillText("date_of_birth", extracted.date_of_birth);
        fillText("gender", extracted.gender);
        if (extracted.nationality && !String(next.nationality ?? "").trim()) {
          next.nationality = extracted.nationality;
          next.is_citizen = extracted.nationality === "Ghana" ? "Yes" : "No";
          filledAnything = true;
        }
        if (
          extracted.work_experience.length > 0 &&
          !(Array.isArray(next.work_experience) && next.work_experience.length > 0)
        ) {
          next.work_experience = extracted.work_experience;
          filledAnything = true;
        }
        if (
          extracted.education.length > 0 &&
          !(Array.isArray(next.education) && next.education.length > 0)
        ) {
          next.education = extracted.education;
          filledAnything = true;
        }

        setCvFillNotice(
          filledAnything
            ? "We've pre-filled some fields from your CV — please review everything before continuing."
            : "We couldn't find anything in that CV to pre-fill — no problem, just fill in the fields below.",
        );

        return next;
      });
    } catch (e) {
      // CV auto-fill is a convenience, not a requirement — fail quietly and
      // let them fill the form manually.
      console.error(e);
    } finally {
      setExtractingCv(false);
    }
  };

  const handleFileUpload = async (
    fieldKey: string,
    file: File,
    multiple: boolean,
    accept?: string,
  ) => {
    setUploadingKey(fieldKey);
    setError(null);
    try {
      const uploaded = await uploadCareersFile(
        file,
        "CareersApplications",
        accept,
        fieldKey,
      );
      if (multiple) {
        setValues((prev) => {
          const existing = Array.isArray(prev[fieldKey]) ? (prev[fieldKey] as UploadedFile[]) : [];
          return { ...prev, [fieldKey]: [...existing, uploaded] };
        });
        setDraftSavedMessage(null);
      } else {
        setFieldValue(fieldKey, uploaded);
      }
      if (fieldKey === "cv") {
        void handleExtractCv(uploaded.secure_url, uploaded.original_name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingKey(null);
    }
  };

  const handleRemoveFile = (fieldKey: string, index: number) => {
    setValues((prev) => {
      const existing = Array.isArray(prev[fieldKey]) ? (prev[fieldKey] as UploadedFile[]) : [];
      return { ...prev, [fieldKey]: existing.filter((_, i) => i !== index) };
    });
  };

  const renderField = (field: ApplicationFormField) => {
    const { fieldKey, fieldType, required, placeholder, options, accept } =
      field.rules;
    const value = values[fieldKey];

    if (fieldType === "select") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required}>
          <select
            className={inputClass}
            value={String(value ?? "")}
            onChange={(e) => setFieldValue(fieldKey, e.target.value)}
          >
            <option value="">Select…</option>
            {(options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </FieldBlock>
      );
    }

    if (fieldType === "textarea") {
      const text = String(value ?? "");
      const maxLen = effectiveMaxLength(field);
      const remaining =
        maxLen != null ? Math.max(0, maxLen - text.length) : null;

      return (
        <FieldBlock key={field.id} label={field.label} required={required}>
          <textarea
            className={inputClass}
            rows={6}
            placeholder={placeholder}
            value={text}
            maxLength={maxLen}
            onChange={(e) => {
              let next = e.target.value;
              if (maxLen != null && next.length > maxLen) {
                next = next.slice(0, maxLen);
              }
              setFieldValue(fieldKey, next);
            }}
          />
          {maxLen != null && (
            <p
              className={`text-xs mt-1 ${
                remaining === 0
                  ? "text-red-600 font-medium"
                  : remaining <= 100
                    ? "text-amber-600"
                    : "text-gray-400"
              }`}
            >
              {remaining} character{remaining === 1 ? "" : "s"} remaining
              <span className="text-gray-300 mx-1">·</span>
              {text.length}/{maxLen}
            </p>
          )}
        </FieldBlock>
      );
    }

    if (fieldType === "file" && field.rules.multiple) {
      const files = Array.isArray(value) ? (value as UploadedFile[]) : [];
      return (
        <FieldBlock key={field.id} label={field.label} required={required}>
          <div className="space-y-2">
            {files.map((f, i) => (
              <div
                key={f.public_id ?? `${f.original_name}-${i}`}
                className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2"
              >
                <span className="text-sm text-gray-700 truncate">{f.original_name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(fieldKey, i)}
                  className="p-1 rounded hover:bg-red-50 shrink-0"
                  aria-label={`Remove ${f.original_name}`}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            ))}
            <label className="flex items-center gap-3 cursor-pointer border border-dashed border-gray-300 rounded-lg px-4 py-3 hover:border-red-300 hover:bg-red-50/30">
              {uploadingKey === fieldKey ? (
                <Loader2 className="w-5 h-5 animate-spin text-red-600" />
              ) : (
                <Upload className="w-5 h-5 text-gray-400" />
              )}
              <span className="text-sm text-gray-600">
                {files.length > 0 ? "Add another file" : "Choose file to upload"}
              </span>
              <input
                type="file"
                className="sr-only"
                accept={accept}
                disabled={uploadingKey === fieldKey}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileUpload(fieldKey, file, true, accept);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="text-[11px] text-gray-400">
              {uploadHintForField(fieldKey, accept)}
            </p>
          </div>
        </FieldBlock>
      );
    }

    if (fieldType === "file") {
      const fileVal = value as
        | { secure_url?: string; original_name?: string }
        | undefined;
      return (
        <FieldBlock key={field.id} label={field.label} required={required}>
          <label className="flex items-center gap-3 cursor-pointer border border-dashed border-gray-300 rounded-lg px-4 py-3 hover:border-red-300 hover:bg-red-50/30">
            {uploadingKey === fieldKey ? (
              <Loader2 className="w-5 h-5 animate-spin text-red-600" />
            ) : (
              <Upload className="w-5 h-5 text-gray-400" />
            )}
            <span className="text-sm text-gray-600">
              {fileVal?.original_name ?? fileVal?.secure_url
                ? "File uploaded — click to replace"
                : "Choose file to upload"}
            </span>
            <input
              type="file"
              className="sr-only"
              accept={accept}
              disabled={uploadingKey === fieldKey}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(fieldKey, file, false, accept);
              }}
            />
          </label>
          <p className="text-[11px] text-gray-400 mt-1">
            {uploadHintForField(fieldKey, accept)}
          </p>
        </FieldBlock>
      );
    }

    if (fieldType === "phone") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required}>
          <PhoneNumberInput
            value={String(value ?? "")}
            onChange={(next) => setFieldValue(fieldKey, next)}
          />
        </FieldBlock>
      );
    }

    if (fieldType === "ghana_card") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required}>
          <GhanaCardInput
            value={String(value ?? "")}
            onChange={(next) => setFieldValue(fieldKey, next)}
          />
        </FieldBlock>
      );
    }

    if (fieldType === "work_history") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required}>
          <WorkHistoryInput value={value} onChange={(next) => setFieldValue(fieldKey, next)} />
        </FieldBlock>
      );
    }

    if (fieldType === "education_history") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required}>
          <EducationHistoryInput
            value={value}
            onChange={(next) => setFieldValue(fieldKey, next)}
          />
        </FieldBlock>
      );
    }

    const inputType =
      fieldType === "email"
        ? "email"
        : fieldType === "date"
          ? "date"
          : "text";

    // Applicants must be at least 15 — the date_of_birth picker can't
    // select a date more recent than 15 years ago, so nobody younger can
    // even pick a valid birthdate.
    const dateMax =
      fieldType === "date" && fieldKey === "date_of_birth"
        ? MIN_APPLICANT_BIRTHDATE
        : undefined;

    return (
      <FieldBlock key={field.id} label={field.label} required={required}>
        <input
          className={inputClass}
          type={inputType}
          placeholder={placeholder}
          max={dateMax}
          value={String(value ?? "")}
          onChange={(e) => setFieldValue(fieldKey, e.target.value)}
        />
      </FieldBlock>
    );
  };

  return (
    <FormShell
      eyebrow="Wills Farms Ltd. — Job application"
      title={formatPublicJobTitle(posting.title)}
      subtitle={`${posting.location} · ${posting.employment_type}`}
      backHref="/careers"
      backLabel="Back to job postings"
    >
      <div className="flex gap-2 mb-6">
        {APPLICATION_STEPS.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full ${i <= stepIndex ? "bg-red-600" : "bg-gray-200"}`}
          />
        ))}
      </div>
      <p className="text-sm font-semibold text-gray-800 mb-1">
        Step {stepIndex + 1} of {APPLICATION_STEPS.length}
      </p>
      <p className="text-xs text-gray-500 mb-6">
        {APPLICATION_STEP_LABELS[step as ApplicationFieldStep]}
      </p>

      {extractingCv && (
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-red-600" />
          Reading your CV and filling in what we can find…
        </div>
      )}

      {!extractingCv && cvFillNotice && (
        <div className="mb-4 text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          {cvFillNotice}
        </div>
      )}

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {draftSavedMessage && (
        <div className="mb-4 text-sm text-green-800 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          {draftSavedMessage}
        </div>
      )}

      {step === "documents" ? (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            {documentsFieldsBeforeReferees.map((field) => (
              <div
                key={field.id}
                className={
                  field.rules.fieldType === "textarea" ||
                  field.rules.fieldType === "file" ||
                  field.rules.fieldType === "work_history" ||
                  field.rules.fieldType === "education_history"
                    ? "sm:col-span-2"
                    : ""
                }
              >
                {renderField(field)}
              </div>
            ))}
          </div>

          {refereeFields.length > 0 && (
            <>
              <div className="mt-8 mb-4 text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
                <p className="font-semibold text-blue-950 mb-1">Referees</p>
                <p>
                  At least two referees are required. If you are selected for the role, we will
                  email each referee you list below a secure link to complete a short reference
                  form on your behalf. Please double-check their email addresses before
                  submitting.
                </p>
              </div>

              {requiredRefereeSlots.map((slot) => (
                <div key={slot} className="mb-6">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Referee {slot}</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {(refereeFieldsBySlot.get(slot) ?? []).map((field) => (
                      <div key={field.id}>{renderField(field)}</div>
                    ))}
                  </div>
                </div>
              ))}

              {visibleOptionalSlots.map((slot) => (
                <div key={slot} className="mb-6">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-sm font-semibold text-gray-900">Referee {slot} (optional)</p>
                    <button
                      type="button"
                      onClick={() => removeReferee(slot)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600"
                    >
                      <X className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {(refereeFieldsBySlot.get(slot) ?? []).map((field) => (
                      <div key={field.id}>{renderField(field)}</div>
                    ))}
                  </div>
                </div>
              ))}

              {nextOptionalSlot !== undefined && (
                <button
                  type="button"
                  onClick={addReferee}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:text-red-800"
                >
                  <Plus className="w-4 h-4" />
                  Add another referee (optional)
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {stepFields.map((field) => (
            <div
              key={field.id}
              className={
                field.rules.fieldType === "textarea" ||
                field.rules.fieldType === "file" ||
                field.rules.fieldType === "work_history" ||
                field.rules.fieldType === "education_history"
                  ? "sm:col-span-2"
                  : ""
              }
            >
              {renderField(field)}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-gray-100">
        {stepIndex > 0 && (
          <button
            type="button"
            onClick={() => setStepIndex((i) => i - 1)}
            disabled={saving}
            className="inline-flex items-center gap-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        )}

        {stepIndex < APPLICATION_STEPS.length - 1 ? (
          <button
            type="button"
            disabled={saving || !!uploadingKey}
            onClick={goNext}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={saving || !!uploadingKey}
              onClick={() => saveApplication(false)}
              className="inline-flex items-center justify-center px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
            >
              Save as draft
            </button>
            <button
              type="button"
              disabled={saving || !!uploadingKey}
              onClick={() => saveApplication(true)}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Submit application
                </>
              )}
            </button>
          </>
        )}
      </div>
    </FormShell>
  );
}
