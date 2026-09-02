"use client";

import { useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { OnboardingFormData, OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import { ACCEPT_PDF_WORD_OR_IMAGE } from "@/lib/uploadConstraints";

type Props = {
  applicationId: string;
  formData: OnboardingFormData;
  hrData: OnboardingHrData;
  setHrData: React.Dispatch<React.SetStateAction<OnboardingHrData>>;
  requiredReports: string[];
  onPersist?: (hrData: OnboardingHrData) => void;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(iso: string | undefined): string {
  if (!iso?.trim()) return "—";
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return trimmed;
}

export default function OnboardingMedicalReportPanel({
  applicationId,
  formData,
  hrData,
  setHrData,
  requiredReports,
  onPersist,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [lastWarnings, setLastWarnings] = useState<string[]>([]);

  const medical = formData.medical ?? {};
  const report = hrData.medical_report;
  const submittedOn = hrData.medical_report_received;

  const handleUpload = async (file: File) => {
    setUploading(true);
    setValidating(true);
    setLastWarnings([]);
    try {
      const uploaded = await uploadCareersFile(
        file,
        "CareersOnboardingMedical",
        ACCEPT_PDF_WORD_OR_IMAGE,
        "medical_report",
      );

      setValidating(true);
      const res = await api.post("/careers/onboarding/validate-medical-report", {
        application_id: applicationId,
        file_url: uploaded.secure_url,
        file_name: uploaded.original_name || file.name,
      });

      const data = res.data as {
        ok?: boolean;
        error?: string;
        message?: string;
        warnings?: string[];
      };

      if (!data.ok) {
        toast.error(data.error ?? data.message ?? "Medical report validation failed.");
        return;
      }

      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      setLastWarnings(warnings);

      setHrData((prev) => {
        const next = {
          ...prev,
          medical_report: uploaded,
          medical_report_received: todayIsoDate(),
        };
        onPersist?.(next);
        return next;
      });

      if (warnings.length) {
        toast.warning("Report uploaded with review notes.");
      } else {
        toast.success("Medical report verified and saved.");
      }
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err instanceof Error ? err.message : "Upload failed.");
      toast.error(msg);
    } finally {
      setUploading(false);
      setValidating(false);
    }
  };

  const clearReport = () => {
    setHrData((prev) => {
      const next = { ...prev };
      delete next.medical_report;
      delete next.medical_report_received;
      onPersist?.(next);
      return next;
    });
    setLastWarnings([]);
  };

  return (
    <section className="rounded-xl border border-teal-100 bg-teal-50/40 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Medical report (HR upload)</h3>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          Upload the candidate&apos;s pre-employment medical certificate here. AI checks it
          against what they declared on the onboarding form (blood group, allergies,
          conditions). The submitted date is filled automatically.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 text-xs">
        <div className="rounded-lg border border-white bg-white/80 px-3 py-2">
          <p className="text-gray-400 uppercase tracking-wide text-[10px]">Declared blood group</p>
          <p className="font-medium text-gray-800 mt-0.5">{medical.blood_group?.trim() || "—"}</p>
        </div>
        <div className="rounded-lg border border-white bg-white/80 px-3 py-2 sm:col-span-2">
          <p className="text-gray-400 uppercase tracking-wide text-[10px]">Declared allergies</p>
          <p className="font-medium text-gray-800 mt-0.5">{medical.allergies?.trim() || "—"}</p>
        </div>
        <div className="rounded-lg border border-white bg-white/80 px-3 py-2 sm:col-span-3">
          <p className="text-gray-400 uppercase tracking-wide text-[10px]">Declared conditions</p>
          <p className="font-medium text-gray-800 mt-0.5">{medical.conditions?.trim() || "—"}</p>
        </div>
      </div>

      {requiredReports.length > 0 && (
        <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4">
          {requiredReports.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {report?.secure_url ? (
        <div className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg bg-white px-3 py-2">
          <span className="text-sm text-gray-700 truncate">
            {report.original_name ?? "Medical report"}
          </span>
          <button
            type="button"
            onClick={clearReport}
            className="p-1 rounded hover:bg-red-50 shrink-0"
            title="Remove report"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      ) : (
        <label className="flex items-center gap-3 cursor-pointer border border-dashed border-teal-200 rounded-lg bg-white px-4 py-3 hover:border-teal-400">
          {uploading ? (
            <Loader2 className="w-5 h-5 animate-spin text-teal-700" />
          ) : (
            <Upload className="w-5 h-5 text-teal-600" />
          )}
          <span className="text-sm text-gray-700">
            {validating ? "Validating report…" : "Upload medical report (PDF or image)"}
          </span>
          <input
            type="file"
            className="sr-only"
            accept={ACCEPT_PDF_WORD_OR_IMAGE}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      )}

      <label className="block">
        <span className="text-xs text-gray-500">Medical report submitted on</span>
        <input
          type="text"
          readOnly
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700"
          value={formatDisplayDate(submittedOn)}
          placeholder="Auto-filled when report is uploaded"
        />
      </label>

      {lastWarnings.length > 0 && (
        <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 space-y-1 list-disc pl-4">
          {lastWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
