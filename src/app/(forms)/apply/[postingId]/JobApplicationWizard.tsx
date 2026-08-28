"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ApplicationFormData,
  type ApplicationFormField,
  type EducationEntry,
  type UploadedFile,
  type WorkHistoryEntry,
  effectiveMaxLength,
  validateStep,
  visibleFieldsForStep,
} from "@/lib/careers/applicationFormSchema";
import {
  isRefereeFieldKey,
  resolveRequiredRefereeCount,
  type ApplicationFormConfig,
} from "@/lib/systemDefinitions/applicationFormConfig";
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
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";

function minApplicantBirthdate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 15);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const MIN_APPLICANT_BIRTHDATE = minApplicantBirthdate();

type PassportBioStatus = "idle" | "incomplete" | "checking" | "ok" | "mismatch" | "error";

type Props = {
  posting: JobPosting;
  fields: ApplicationFormField[];
  steps: string[];
  stepLabels: Record<string, string>;
  formConfig?: ApplicationFormConfig;
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
  steps,
  stepLabels,
  formConfig,
  initialValues = {},
  draftToken,
}: Props) {
  const router = useRouter();
  const requiredRefereeCount = resolveRequiredRefereeCount(formConfig);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<ApplicationFormData>(() => ({ ...initialValues }));
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null);
  const [activeDraftToken, setActiveDraftToken] = useState(draftToken);
  const [extractingCv, setExtractingCv] = useState(false);
  const [cvFillNotice, setCvFillNotice] = useState<string | null>(null);
  const [passportBioStatus, setPassportBioStatus] = useState<PassportBioStatus>("idle");
  const [passportBioMessage, setPassportBioMessage] = useState<string | null>(null);
  // Tracks the in-flight verification request so a superseded call (e.g. a
  // duplicate fired by an effect re-run, or the applicant editing a field
  // mid-check) is aborted outright instead of racing to update state — this
  // also stops the abandoned request from showing as a spurious "failed to
  // load" network error in the browser.
  const passportBioAbortRef = useRef<AbortController | null>(null);

  const step = steps[stepIndex] ?? steps[0];
  const stepFields = useMemo(
    () => visibleFieldsForStep(fields, step, values),
    [fields, step, values],
  );
  const nonRefereeStepFields = useMemo(
    () => stepFields.filter((f) => !isRefereeFieldKey(f.rules.fieldKey)),
    [stepFields],
  );
  const refereeFields = useMemo(
    () => stepFields.filter((f) => isRefereeFieldKey(f.rules.fieldKey)),
    [stepFields],
  );
  const refereeGroups = useMemo(() => {
    const groups: ApplicationFormField[][] = [];
    for (let i = 1; i <= requiredRefereeCount; i++) {
      const prefix = `reference_${i}_`;
      const group = refereeFields.filter((f) => f.rules.fieldKey.startsWith(prefix));
      if (group.length) groups.push(group);
    }
    return groups;
  }, [refereeFields, requiredRefereeCount]);

  const refereeStepLabel = stepLabels.references ?? "Referees";

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
    const bioIssue = resolvePassportBioIssue();
    if (bioIssue) {
      setError(bioIssue);
      return;
    }
    setError(null);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const saveApplication = async (finalize: boolean) => {
    if (finalize) {
      for (const s of steps) {
        const stepErrors = validateStep(fields, s, values);
        if (stepErrors.length > 0) {
          setError(stepErrors[0]);
          return;
        }
      }
      const bioIssue = resolvePassportBioIssue();
      if (bioIssue) {
        setError(bioIssue);
        return;
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

  // Reads the applicant's name, date of birth, and passport number off their
  // uploaded passport bio page photo and checks it against what they typed
  // in the form. Called automatically (see effect below) once a photo is
  // present and those fields are filled — never asked to run more than once
  // per upload unless the applicant explicitly asks to re-check.
  const handleVerifyPassportBio = async (
    fileUrl: string,
    fileName: string,
    firstName: string,
    lastName: string,
    dateOfBirth: string,
    passportNumber: string,
  ) => {
    passportBioAbortRef.current?.abort();
    const controller = new AbortController();
    passportBioAbortRef.current = controller;

    setPassportBioStatus("checking");
    setPassportBioMessage(null);
    try {
      const res = await fetch("/api/careers/applications/validate-passport-bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: fileUrl,
          file_name: fileName,
          first_name: firstName,
          last_name: lastName,
          date_of_birth: dateOfBirth,
          passport_number: passportNumber,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.error ??
            "We couldn't verify this photo. Please upload a clear passport bio page and try again.",
        );
      }
      if (json.data.matches) {
        setPassportBioStatus("ok");
        setPassportBioMessage(null);
      } else {
        setPassportBioStatus("mismatch");
        setPassportBioMessage(
          json.data.message ??
            "This doesn't match the details you entered — please check your details or upload a clearer photo of your passport bio page.",
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setPassportBioStatus("error");
      setPassportBioMessage(
        "We couldn't verify this photo. Please upload a clear passport bio page and try again.",
      );
    }
  };

  // Auto-verify whenever there's an uploaded bio page photo, the applicant
  // isn't a Ghana citizen, and we don't already have a settled result for
  // the current photo. Re-runs as they finish typing name/DOB (guarded so
  // it only ever calls the AI once those are filled in), and again whenever
  // they upload a new photo (handleFileUpload resets status back to idle).
  useEffect(() => {
    if (values.is_citizen !== "No") return;
    if (passportBioStatus !== "idle" && passportBioStatus !== "incomplete") return;

    const bio = values.passport_bio_page as UploadedFile | undefined;
    if (!bio?.secure_url) return;

    const firstName = String(values.first_name ?? "").trim();
    const lastName = String(values.last_name ?? "").trim();
    const dob = String(values.date_of_birth ?? "").trim();
    const passportNumber = String(values.passport_number ?? "").trim();

    if (!firstName || !lastName || !dob || !passportNumber) {
      setPassportBioStatus("incomplete");
      setPassportBioMessage(
        "Enter your first name, last name, date of birth, and passport number above — we'll verify your passport photo against them automatically.",
      );
      return;
    }

    void handleVerifyPassportBio(
      bio.secure_url,
      bio.original_name,
      firstName,
      lastName,
      dob,
      passportNumber,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    values.is_citizen,
    (values.passport_bio_page as UploadedFile | undefined)?.secure_url,
    values.first_name,
    values.last_name,
    values.date_of_birth,
    values.passport_number,
    passportBioStatus,
  ]);

  // Blocks moving on while the passport bio page hasn't been verified yet —
  // still checking, still missing name/DOB to check against, or a settled
  // mismatch/error. Returns null (nothing to block) once verified or not
  // applicable (Ghana citizens never see this field).
  const resolvePassportBioIssue = (): string | null => {
    if (values.is_citizen !== "No") return null;
    const bio = values.passport_bio_page as UploadedFile | undefined;
    if (!bio?.secure_url) return null;
    if (uploadingKey === "passport_bio_page") {
      return "Please wait for your passport photo to finish uploading.";
    }
    if (passportBioStatus === "checking") {
      return "Please wait while we verify your passport bio page photo…";
    }
    if (passportBioStatus === "incomplete" || passportBioStatus === "mismatch" || passportBioStatus === "error") {
      return (
        passportBioMessage ??
        "Your passport bio page photo doesn't match the details you entered — please review and re-upload it."
      );
    }
    return null;
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
      if (fieldKey === "passport_bio_page") {
        // New photo — clear any previous result so the effect above
        // re-verifies it fresh against the current name/DOB fields.
        setPassportBioStatus("idle");
        setPassportBioMessage(null);
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
          {maxLen != null && remaining != null && (
            <p
              className={`text-xs mt-1 ${
                remaining === 0
                  ? "text-red-600 font-medium"
                  : remaining != null && remaining <= 100
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
      const isPassportBio = fieldKey === "passport_bio_page";
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
          {isPassportBio && fileVal?.secure_url && (
            <div className="mt-2">
              {passportBioStatus === "checking" && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Verifying…
                </p>
              )}
              {passportBioStatus === "ok" && (
                <p className="text-xs text-green-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verified.
                </p>
              )}
              {(passportBioStatus === "incomplete" ||
                passportBioStatus === "mismatch" ||
                passportBioStatus === "error") &&
                passportBioMessage && (
                  <div className="space-y-1">
                    <p className="text-xs text-red-600 flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{passportBioMessage}</span>
                    </p>
                    {(passportBioStatus === "mismatch" || passportBioStatus === "error") && (
                      <button
                        type="button"
                        onClick={() => {
                          setPassportBioStatus("idle");
                          setPassportBioMessage(null);
                        }}
                        className="text-xs font-medium text-red-700 underline hover:text-red-800"
                      >
                        I've fixed my details — re-check
                      </button>
                    )}
                  </div>
                )}
            </div>
          )}
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
        {steps.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full ${i <= stepIndex ? "bg-red-600" : "bg-gray-200"}`}
          />
        ))}
      </div>
      <p className="text-sm font-semibold text-gray-800 mb-1">
        Step {stepIndex + 1} of {steps.length}
      </p>
      <p className="text-xs text-gray-500 mb-6">
        {stepLabels[step] ?? step}
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

      {nonRefereeStepFields.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {nonRefereeStepFields.map((field) => (
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

      {refereeFields.length > 0 && (
        <>
          <div className="mt-2 mb-4 text-sm text-blue-900 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
            <p className="font-semibold text-blue-950 mb-1">{refereeStepLabel}</p>
            <p>
              {requiredRefereeCount === 1
                ? "One referee is required."
                : `${requiredRefereeCount} referees are required.`}{" "}
              When you click <span className="font-medium">Submit application</span>, we will
              email each referee you list below a secure link to complete a short reference form on
              your behalf. Please double-check their email addresses before submitting.
            </p>
          </div>

          <div className="space-y-6">
            {refereeGroups.map((group, index) => (
              <div key={`referee-${index + 1}`} className="space-y-3">
                <p className="text-sm font-semibold text-gray-900">
                  {requiredRefereeCount === 1
                    ? "Referee"
                    : index === 0
                      ? "First referee"
                      : index === 1
                        ? "Second referee"
                        : index === 2
                          ? "Third referee"
                          : `Referee ${index + 1}`}
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {group.map((field) => (
                    <div key={field.id}>{renderField(field)}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
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

        {stepIndex < steps.length - 1 ? (
          <button
            type="button"
            disabled={saving || !!uploadingKey || passportBioStatus === "checking"}
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
              disabled={saving || !!uploadingKey || passportBioStatus === "checking"}
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
