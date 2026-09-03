"use client";

import { useMemo, useState } from "react";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_LABELS,
  buildApplicationBackedOnboardingFlat,
  flatToOnboardingForm,
  mergeOnboardingFieldDefinitions,
  onboardingFormToFlat,
  resolveFieldOptions,
  validateOnboardingMedicalExtras,
  validateOnboardingStep,
  visibleOnboardingFieldsForStep,
  isOnboardingNameFieldKey,
  isOnboardingDigitsOnlyFieldKey,
  type OnboardingApplicationContext,
  type OnboardingFlatValues,
  type OnboardingFormField,
} from "@/lib/careers/onboardingFormSchema";
import {
  mergeOnboardingForm,
  type OnboardingFormData,
} from "@/lib/careers/onboardingTypes";
import type { UploadedFile } from "@/lib/careers/applicationFormSchema";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import { uploadHintForField } from "@/lib/uploadConstraints";
import { isValidEmail, sanitizeDigitsInput, sanitizeNameInput } from "@/lib/validation";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { GhanaCardInput } from "@/components/GhanaCardInput";
import { GhanaPostGpsInput } from "@/components/GhanaPostGpsInput";
import { SsnitNumberInput } from "@/components/SsnitNumberInput";
import CandidateProfileReview from "@/components/onboarding/CandidateProfileReview";
import { FormShell, usePreventBrowserBack } from "@/components/Forms/FormShell";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";

type ApplicationInfo = {
  full_name: string;
  email: string;
  phone: string;
  role_title: string;
  reference_number: string;
};

type Props = {
  token: string;
  application: ApplicationInfo;
  applicationFormData?: Record<string, unknown> | null;
  initialFlat: OnboardingFlatValues;
  fields: OnboardingFormField[];
  optionLists: Record<string, string[]>;
  expiresAt: string;
};

const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

const lockedClass =
  "w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700";

function displaySectionTitle(title: string): string {
  if (title === "K. Biosecurity declaration") return "Biosecurity";
  if (title === "L & N. Declarations") return "Consent & signature";
  return title.replace(/^[A-Z](?:\s*&\s*[A-Z])?\.\s*/, "");
}

function buildInitialValues(
  flat: OnboardingFlatValues,
  applicationContext?: OnboardingApplicationContext,
): OnboardingFlatValues {
  const next = onboardingFormToFlat(flatToOnboardingForm(flat)) as OnboardingFlatValues;
  if (applicationContext) {
    const fromApp = buildApplicationBackedOnboardingFlat(applicationContext);
    for (const [key, val] of Object.entries(fromApp)) {
      if (
        key.startsWith("personal.") &&
        (next[key] === undefined || next[key] === null || String(next[key]).trim() === "")
      ) {
        next[key] = val;
      }
    }
  }
  return next;
}

function FieldBlock({
  label,
  required,
  children,
  half,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  half?: boolean;
}) {
  return (
    <label className={half ? "block" : "block sm:col-span-2"}>
      <span className="text-xs font-medium text-gray-600">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default function OnboardingWizard({
  token,
  application,
  applicationFormData,
  initialFlat,
  fields,
  optionLists,
  expiresAt,
}: Props) {
  const applicationContext = useMemo<OnboardingApplicationContext>(
    () => ({
      application_form_data: applicationFormData,
      full_name: application.full_name,
      email: application.email,
      phone: application.phone,
    }),
    [applicationFormData, application.full_name, application.email, application.phone],
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<OnboardingFlatValues>(() =>
    buildInitialValues(initialFlat, {
      application_form_data: applicationFormData,
      full_name: application.full_name,
      email: application.email,
      phone: application.phone,
    }),
  );
  const [formExtras, setFormExtras] = useState<OnboardingFormData>(() =>
    mergeOnboardingForm(
      flatToOnboardingForm(
        buildInitialValues(initialFlat, {
          application_form_data: applicationFormData,
          full_name: application.full_name,
          email: application.email,
          phone: application.phone,
        }),
      ),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [submittedForm, setSubmittedForm] = useState<OnboardingFormData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const step = ONBOARDING_STEPS[stepIndex];

  const mergedFields = useMemo(
    () => mergeOnboardingFieldDefinitions(fields),
    [fields],
  );

  const stepFields = useMemo(
    () => visibleOnboardingFieldsForStep(mergedFields, step, values, applicationContext),
    [mergedFields, step, values, applicationContext],
  );

  const sections = useMemo(() => {
    const map = new Map<string, OnboardingFormField[]>();
    for (const field of stepFields) {
      const key = field.rules.section ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(field);
    }
    return [...map.entries()];
  }, [stepFields]);

  const setFieldValue = (key: string, value: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "payment.method") {
        if (value === "Bank transfer") {
          delete next["payment.momo_network"];
          delete next["payment.momo_number"];
          delete next["payment.momo_registered_name"];
        } else if (value === "Mobile money") {
          delete next["payment.bank_name"];
          delete next["payment.account_name"];
          delete next["payment.account_number"];
        }
      }

      return next;
    });
    setError(null);
  };

  const patchExtras = (partial: Partial<OnboardingFormData>) => {
    setFormExtras((prev) => mergeOnboardingForm({ ...prev, ...partial }));
  };

  const buildFormPayload = (): OnboardingFormData => {
    const fromFlat = flatToOnboardingForm(values);
    return mergeOnboardingForm({
      ...fromFlat,
      medical: {
        ...fromFlat.medical,
        ...formExtras.medical,
      },
      biosecurity: {
        ...fromFlat.biosecurity,
        ...formExtras.biosecurity,
      },
      declarations: {
        ...fromFlat.declarations,
        ...formExtras.declarations,
      },
    });
  };

  const saveStep = async (opts: { finalize?: boolean }) => {
    const payload = buildFormPayload();
    const flatForValidation = onboardingFormToFlat(payload);

    const stepErrors = validateOnboardingStep(
      mergedFields,
      step,
      flatForValidation,
      optionLists,
      applicationContext,
    );
    if (stepErrors.length > 0) {
      setError(stepErrors[0]);
      return;
    }

    if (opts.finalize) {
      for (const s of ONBOARDING_STEPS) {
        const allErrors = validateOnboardingStep(
          mergedFields,
          s,
          flatForValidation,
          optionLists,
          applicationContext,
        );
        if (allErrors.length > 0) {
          setError(allErrors[0]);
          return;
        }
      }
      const medicalErrors = validateOnboardingMedicalExtras(payload);
      if (medicalErrors.length > 0) {
        setError(medicalErrors[0]);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/careers/onboarding/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step,
          form_data: payload,
          finalize: opts.finalize ?? false,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      if (opts.finalize) {
        setSubmittedForm(payload);
      } else if (stepIndex < ONBOARDING_STEPS.length - 1) {
        setStepIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (fieldKey: string, file: File, accept?: string) => {
    setUploadingKey(fieldKey);
    setError(null);
    try {
      const uploaded = await uploadCareersFile(
        file,
        "CareersOnboarding",
        accept,
        fieldKey,
      );
      setFieldValue(fieldKey, uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingKey(null);
    }
  };

  const renderField = (field: OnboardingFormField) => {
    const { fieldKey, fieldType, required, placeholder, accept, prefillLocked } =
      field.rules;
    const value = values[fieldKey];
    const readOnly = prefillLocked === true;
    const cls = readOnly ? lockedClass : inputClass;
    const opts = resolveFieldOptions(field, values, optionLists);
    const half = field.rules.colSpan === "half";

    if (fieldType === "select") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required} half={half}>
          {readOnly ? (
            <input className={lockedClass} readOnly value={String(value ?? "")} />
          ) : (
            <select
              className={cls}
              value={String(value ?? "")}
              onChange={(e) => setFieldValue(fieldKey, e.target.value)}
            >
              <option value="">Select…</option>
              {opts.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}
        </FieldBlock>
      );
    }

    if (fieldType === "textarea") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required} half={half}>
          <textarea
            className={cls}
            rows={3}
            readOnly={readOnly}
            placeholder={placeholder}
            value={String(value ?? "")}
            onChange={(e) => setFieldValue(fieldKey, e.target.value)}
          />
        </FieldBlock>
      );
    }

    if (fieldType === "checkbox") {
      return (
        <label
          key={field.id}
          className="flex items-start gap-2 text-sm text-gray-700 sm:col-span-2"
        >
          <input
            type="checkbox"
            className="mt-1 accent-red-600"
            checked={Boolean(value)}
            disabled={readOnly}
            onChange={(e) => setFieldValue(fieldKey, e.target.checked)}
          />
          <span>
            {field.label}
            {required && <span className="text-red-600"> *</span>}
          </span>
        </label>
      );
    }

    if (fieldType === "phone") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required} half={half}>
          {readOnly ? (
            <input className={cls} readOnly value={String(value ?? "")} />
          ) : (
            <PhoneNumberInput
              value={String(value ?? "")}
              onChange={(v) => setFieldValue(fieldKey, v)}
            />
          )}
        </FieldBlock>
      );
    }

    if (fieldType === "ghana_card") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required} half={half}>
          <GhanaCardInput
            value={String(value ?? "")}
            onChange={(v) => setFieldValue(fieldKey, v)}
          />
        </FieldBlock>
      );
    }

    if (fieldType === "ssnit") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required} half={half}>
          <SsnitNumberInput
            value={String(value ?? "")}
            onChange={(v) => setFieldValue(fieldKey, v)}
          />
        </FieldBlock>
      );
    }

    if (fieldType === "file") {
      const fileVal = value as UploadedFile | null | undefined;
      return (
        <FieldBlock key={field.id} label={field.label} required={required} half={half}>
          <div className="space-y-2">
            {fileVal?.secure_url && (
              <div className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-700 truncate">
                  {fileVal.original_name ?? "Uploaded file"}
                </span>
                <button
                  type="button"
                  onClick={() => setFieldValue(fieldKey, null)}
                  className="p-1 rounded hover:bg-red-50 shrink-0"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            )}
            <label className="flex items-center gap-3 cursor-pointer border border-dashed border-gray-300 rounded-lg px-4 py-3 hover:border-red-300 hover:bg-red-50/30">
              {uploadingKey === fieldKey ? (
                <Loader2 className="w-5 h-5 animate-spin text-red-600" />
              ) : (
                <Upload className="w-5 h-5 text-gray-400" />
              )}
              <span className="text-sm text-gray-600">Choose file to upload</span>
              <input
                type="file"
                className="sr-only"
                accept={accept}
                disabled={uploadingKey === fieldKey}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileUpload(fieldKey, file, accept);
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

    if (fieldType === "date") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required} half={half}>
          <input
            className={cls}
            type="date"
            readOnly={readOnly}
            value={String(value ?? "")}
            onChange={(e) => setFieldValue(fieldKey, e.target.value)}
          />
        </FieldBlock>
      );
    }

    if (fieldType === "email") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required} half={half}>
          <input
            className={cls}
            type="email"
            readOnly={readOnly}
            inputMode="email"
            autoComplete="email"
            value={String(value ?? "")}
            onChange={(e) => setFieldValue(fieldKey, e.target.value)}
            onBlur={(e) => {
              const trimmed = e.target.value.trim();
              if (trimmed && !isValidEmail(trimmed)) {
                setError(`${field.label} must be a valid email address.`);
              }
            }}
          />
        </FieldBlock>
      );
    }

    if (fieldType === "bank_account") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required} half={half}>
          <input
            className={cls}
            inputMode="numeric"
            placeholder="10–16 digits"
            value={String(value ?? "")}
            onChange={(e) =>
              setFieldValue(fieldKey, sanitizeDigitsInput(e.target.value).slice(0, 16))
            }
          />
        </FieldBlock>
      );
    }

    if (fieldType === "gps") {
      return (
        <FieldBlock key={field.id} label={field.label} required={required} half={half}>
          <GhanaPostGpsInput
            value={String(value ?? "")}
            placeholder={placeholder ?? "GA-123-4567"}
            onChange={(v) => setFieldValue(fieldKey, v)}
          />
        </FieldBlock>
      );
    }

    const isNameField = fieldType === "text" && isOnboardingNameFieldKey(fieldKey);
    const isDigitsOnlyField =
      fieldType === "text" && isOnboardingDigitsOnlyFieldKey(fieldKey);

    return (
      <FieldBlock key={field.id} label={field.label} required={required} half={half}>
        <input
          className={cls}
          readOnly={readOnly}
          placeholder={placeholder}
          inputMode={isDigitsOnlyField ? "numeric" : undefined}
          value={String(value ?? "")}
          onChange={(e) => {
            let next = e.target.value;
            if (isNameField) next = sanitizeNameInput(next);
            else if (isDigitsOnlyField) next = sanitizeDigitsInput(next);
            setFieldValue(fieldKey, next);
          }}
        />
      </FieldBlock>
    );
  };

  if (submittedForm) {
    return (
      <SubmittedProfile
        token={token}
        fullName={application.full_name}
        roleTitle={application.role_title}
        referenceNumber={application.reference_number}
        email={application.email}
        phone={application.phone}
        applicationFormData={applicationFormData}
        onboardingFormData={submittedForm}
      />
    );
  }

  return (
    <FormShell
      eyebrow="Wills Farms Ltd. — Employee onboarding"
      title={application.full_name}
      subtitle={`${application.role_title} · Ref ${application.reference_number} · Link expires ${new Date(expiresAt).toLocaleString("en-GB")}`}
    >
      <div className="flex gap-2 mb-8">
        {ONBOARDING_STEPS.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full ${i <= stepIndex ? "bg-red-600" : "bg-gray-200"}`}
          />
        ))}
      </div>
      <p className="text-sm font-semibold text-gray-800 mb-1">
        Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
      </p>
      <p className="text-xs text-gray-500 mb-6">{ONBOARDING_STEP_LABELS[step]}</p>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {sections.map(([sectionTitle, sectionFields]) => {
          const isBiosecuritySection =
            sectionTitle === "Biosecurity" ||
            sectionTitle === "K. Biosecurity declaration";

          return (
            <section key={sectionTitle || "default"} className="space-y-3">
              {sectionTitle && (
                <h2 className="text-sm font-bold text-gray-900">
                  {displaySectionTitle(sectionTitle)}
                </h2>
              )}

              {step === "medical" && isBiosecuritySection && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Wills Farms is a pig production business. These questions help us protect
                    herd health and comply with biosecurity rules.
                  </p>
                  {[
                    {
                      key: "household_pigs" as const,
                      label:
                        "Do you or anyone in your household keep pigs or have contact with pigs outside work?",
                    },
                    {
                      key: "household_pig_work" as const,
                      label:
                        "Does any household member work on another pig farm, animal market, or slaughter facility?",
                    },
                    {
                      key: "visited_swine_site_12m" as const,
                      label:
                        "Have you worked on or visited any other swine site in the past 12 months?",
                    },
                    {
                      key: "asf_travel_30d" as const,
                      label:
                        "Have you travelled to a region affected by African Swine Fever in the past 30 days?",
                    },
                  ].map(({ key, label }) => (
                    <div key={key} className="text-sm">
                      <p className="text-gray-700 mb-1">{label}</p>
                      <div className="flex gap-2">
                        {(["yes", "no"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() =>
                              patchExtras({
                                biosecurity: { ...formExtras.biosecurity, [key]: v },
                              })
                            }
                            className={`px-3 py-1 rounded-lg text-xs font-medium border ${formExtras.biosecurity?.[key] === v ? "bg-red-600 text-white border-red-600" : "bg-white border-gray-200"}`}
                          >
                            {v === "yes" ? "Yes" : "No"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                {sectionFields.map((field) => renderField(field))}
              </div>
            </section>
          );
        })}

        {step === "medical" && (
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Consent & signature</h2>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1 accent-red-600"
                checked={formExtras.declarations?.data_consent ?? false}
                onChange={(e) =>
                  patchExtras({
                    declarations: {
                      ...formExtras.declarations,
                      data_consent: e.target.checked,
                    },
                  })
                }
              />
              <span>
                I consent to the collection and processing of my personal data for employment
                administration, and I certify that the information provided is accurate and
                complete.
              </span>
            </label>
          </section>
        )}
      </div>

      <div className="flex gap-2 mt-8 pt-6 border-t border-gray-100">
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
        <button
          type="button"
          disabled={saving}
          onClick={() => saveStep({ finalize: stepIndex === ONBOARDING_STEPS.length - 1 })}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : stepIndex === ONBOARDING_STEPS.length - 1 ? (
            "Submit onboarding"
          ) : (
            <>
              Save & continue
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </FormShell>
  );
}

function SubmittedProfile({
  token,
  fullName,
  roleTitle,
  referenceNumber,
  email,
  phone,
  applicationFormData,
  onboardingFormData,
}: {
  token: string;
  fullName: string;
  roleTitle: string;
  referenceNumber: string;
  email: string;
  phone: string;
  applicationFormData?: Record<string, unknown> | null;
  onboardingFormData: OnboardingFormData;
}) {
  usePreventBrowserBack(true);

  return (
    <FormShell eyebrow="Wills Farms Ltd." title="Onboarding submitted">
      <div className="text-center mb-6 print:hidden">
        <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-4" />
        <p className="text-gray-600 text-sm leading-relaxed">
          Thank you, {fullName.split(/\s+/)[0]}. Your information has been sent to
          Wills Farms HR. We will contact you regarding medical examination and next steps.
        </p>
        <p className="text-xs text-gray-400 mt-4">Reference {referenceNumber}</p>
      </div>
      <CandidateProfileReview
        applicationFormData={applicationFormData}
        onboardingFormData={onboardingFormData}
        profileDownloadUrl={`/api/careers/onboarding/profile/pdf?token=${encodeURIComponent(token)}`}
        header={{
          fullName,
          roleTitle,
          referenceNumber,
          email,
          phone,
          submittedAt: new Date().toISOString(),
        }}
      />
    </FormShell>
  );
}
