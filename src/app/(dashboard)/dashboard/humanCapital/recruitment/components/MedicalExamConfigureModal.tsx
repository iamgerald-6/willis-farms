"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import type {
  MedicalFormResponses,
  MedicalFormSchema,
  MedicalReferralData,
} from "@/lib/medical/medicalFormSchema";
import { getDefaultMedicalFormSchema } from "@/lib/medical/medicalFormDefaults";
import { buildConfiguredMedicalFormSchema } from "@/lib/medical/buildConfiguredMedicalFormSchema";
import { buildInitialMedicalResponses } from "@/lib/medical/medicalResponses";
import {
  MEDICAL_EXAM_COMPONENTS,
  type MedicalExamComponentId,
  type MedicalFormConfig,
  componentRequirement,
  defaultIncludedComponents,
  medicalJobCategoryLetter,
  normalizeIncludedComponents,
} from "@/lib/medical/medicalExamRequirementsMatrix";
import MedicalExamPreviewModal from "./MedicalExamPreviewModal";

export default function MedicalExamConfigureModal({
  open,
  onClose,
  applicationId,
  jobCategory,
  hrData,
  existingConfig,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  jobCategory: string;
  hrData: OnboardingHrData;
  existingConfig?: MedicalFormConfig | null;
  onSaved: () => void;
}) {
  const categoryLetter = medicalJobCategoryLetter(jobCategory);
  const [included, setIncluded] = useState<MedicalExamComponentId[]>([]);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<{
    schema: MedicalFormSchema;
    responses: MedicalFormResponses;
    referral: MedicalReferralData;
  } | null>(null);

  useEffect(() => {
    if (!open || !categoryLetter) return;
    if (
      existingConfig &&
      existingConfig.job_category_letter === categoryLetter &&
      existingConfig.included_components.length > 0
    ) {
      setIncluded(existingConfig.included_components);
    } else {
      setIncluded(defaultIncludedComponents(categoryLetter));
    }
  }, [open, categoryLetter, existingConfig]);

  const normalizedIncluded = useMemo(() => {
    if (!categoryLetter) return [];
    return normalizeIncludedComponents(categoryLetter, included);
  }, [categoryLetter, included]);

  const configuredSchema = useMemo(() => {
    const base = getDefaultMedicalFormSchema();
    if (!categoryLetter || normalizedIncluded.length === 0) return base;
    return buildConfiguredMedicalFormSchema(base, normalizedIncluded);
  }, [categoryLetter, normalizedIncluded]);

  const toggleOptional = (componentId: MedicalExamComponentId) => {
    if (!categoryLetter) return;
    if (componentRequirement(componentId, categoryLetter) === "R") return;
    setIncluded((prev) =>
      prev.includes(componentId)
        ? prev.filter((id) => id !== componentId)
        : [...prev, componentId],
    );
  };

  const referralHrPayload = (): OnboardingHrData => ({
    medical_examination_type: hrData.medical_examination_type,
    medical_job_category: jobCategory,
    medical_designated_facility: hrData.medical_designated_facility,
    medical_appointment_date: hrData.medical_appointment_date,
    medical_hospital_email: hrData.medical_hospital_email,
  });

  const handlePreview = () => {
    if (!categoryLetter) return;
    const responses = buildInitialMedicalResponses(configuredSchema);
    setPreviewPayload({
      schema: configuredSchema,
      responses,
      referral: {
        job_category: jobCategory,
        examination_type: hrData.medical_examination_type ?? "Pre-employment",
        designated_facility: hrData.medical_designated_facility,
        appointment_date: hrData.medical_appointment_date,
        form_config: {
          job_category: jobCategory,
          job_category_letter: categoryLetter,
          included_components: normalizedIncluded,
        },
      },
    });
    setPreviewOpen(true);
  };

  const handleSave = async () => {
    if (!categoryLetter) {
      toast.error("Select a valid job category first.");
      return;
    }

    setSaving(true);
    try {
      await api.post("/careers/medical-examination/configure", {
        application_id: applicationId,
        hr_data: referralHrPayload(),
        included_components: normalizedIncluded,
      });
      toast.success("Hospital form configuration saved.");
      onSaved();
      onClose();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not save configuration.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  if (!categoryLetter) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
          <p className="text-sm text-gray-700">Select a job category before configuring the hospital form.</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 text-sm font-semibold text-gray-600 hover:text-gray-900"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Configure hospital form</h2>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Based on the selected job category. Required items are always included; you may add
                clinically indicated items for this candidate.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-4">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-2.5 px-3 font-semibold min-w-[200px]">Component</th>
                    <th className="py-2.5 px-3 font-semibold w-[180px]">Status for this category</th>
                    <th className="py-2.5 px-3 font-semibold w-[140px]">Include on form?</th>
                  </tr>
                </thead>
                <tbody>
                  {MEDICAL_EXAM_COMPONENTS.map((component) => {
                    const level = componentRequirement(component.id, categoryLetter);
                    const isRequired = level === "R";
                    const checked = normalizedIncluded.includes(component.id);

                    return (
                      <tr key={component.id} className="border-b border-gray-100 align-middle">
                        <td className="py-3 px-3">
                          <p className="font-medium text-gray-900">{component.label}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{component.part}</p>
                        </td>
                        <td className="py-3 px-3">
                          {isRequired ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 text-[11px] font-semibold">
                              Required
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-900 border border-amber-100 px-2 py-0.5 text-[11px] font-semibold">
                              If clinically indicated
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <label
                            className={`inline-flex items-center gap-2 ${
                              isRequired ? "cursor-default opacity-80" : "cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isRequired}
                              onChange={() => toggleOptional(component.id)}
                              className="rounded border-gray-300 text-red-600 focus:ring-red-200 disabled:opacity-70"
                            />
                            <span className="text-xs text-gray-600">
                              {isRequired ? "Always on" : checked ? "Included" : "Excluded"}
                            </span>
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/80">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-600 hover:bg-white border border-transparent hover:border-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePreview}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <Eye className="w-3.5 h-3.5" />
              Preview hospital form
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save configuration
            </button>
          </div>
        </div>
      </div>

      {previewOpen && previewPayload && (
        <MedicalExamPreviewModal
          open
          onClose={() => setPreviewOpen(false)}
          schema={previewPayload.schema}
          responses={previewPayload.responses}
          referral={previewPayload.referral}
          status="draft"
        />
      )}
    </>
  );
}
