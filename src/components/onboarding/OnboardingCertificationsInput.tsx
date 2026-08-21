"use client";

import { useId } from "react";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";
import type { UploadedFile } from "@/lib/careers/applicationFormSchema";
import type { OnboardingCertificationEntry } from "@/lib/careers/onboardingEntryTypes";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";

export type { OnboardingCertificationEntry };

type Props = {
  value: unknown;
  onChange: (next: OnboardingCertificationEntry[]) => void;
  uploadingIndex: number | null;
  onUploadingChange: (index: number | null) => void;
};

function emptyEntry(): OnboardingCertificationEntry {
  return { name: "", issuing_body: "", licence_no: "", expiry: "", file: null };
}

function normalize(value: unknown): OnboardingCertificationEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const raw = entry as OnboardingCertificationEntry;
    const fileRaw = raw?.file as UploadedFile | null | undefined;
    return {
      name: String(raw?.name ?? ""),
      issuing_body: String(raw?.issuing_body ?? ""),
      licence_no: String(raw?.licence_no ?? ""),
      expiry: String(raw?.expiry ?? ""),
      file:
        fileRaw?.secure_url
          ? {
              secure_url: fileRaw.secure_url,
              public_id: fileRaw.public_id,
              original_name: fileRaw.original_name,
            }
          : null,
    };
  });
}

const labelClass = "text-xs font-medium text-gray-600";
const inputClass =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400";

export function OnboardingCertificationsInput({
  value,
  onChange,
  uploadingIndex,
  onUploadingChange,
}: Props) {
  const entries = normalize(value);
  const idBase = useId();

  const update = (index: number, patch: Partial<OnboardingCertificationEntry>) => {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };

  const removeEntry = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  const uploadFile = async (index: number, file: File) => {
    onUploadingChange(index);
    try {
      const uploaded = await uploadCareersFile(file, "CareersOnboarding");
      const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      update(index, {
        file: uploaded,
        name: entries[index]?.name?.trim() ? entries[index].name : baseName,
      });
    } finally {
      onUploadingChange(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 leading-relaxed">
        Upload any <strong>additional</strong> certificates or licences not already submitted
        with your job application. Certificates from your application are shown above — you
        do not need to upload those again.
      </p>

      {entries.length === 0 && (
        <p className="text-sm text-gray-400 italic">No additional certifications added.</p>
      )}

      {entries.map((entry, index) => (
        <div
          key={`${idBase}-${index}`}
          className="border border-gray-200 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-500">
              Additional certification {index + 1}
            </p>
            <button
              type="button"
              onClick={() => removeEntry(index)}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className={labelClass}>Certificate / licence name</span>
              <input
                className={`${inputClass} mt-1`}
                value={entry.name}
                onChange={(e) => update(index, { name: e.target.value })}
                placeholder="e.g. PDA Certificate, Driver's licence"
              />
            </label>
            <label className="block">
              <span className={labelClass}>Issuing body</span>
              <input
                className={`${inputClass} mt-1`}
                value={entry.issuing_body}
                onChange={(e) => update(index, { issuing_body: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Licence / certificate number</span>
              <input
                className={`${inputClass} mt-1`}
                value={entry.licence_no}
                onChange={(e) => update(index, { licence_no: e.target.value })}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Upload certificate copy</span>
              <div className="mt-1 space-y-2">
                {entry.file?.secure_url && (
                  <div className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700 truncate">
                      {entry.file.original_name ?? "Uploaded file"}
                    </span>
                    <button
                      type="button"
                      onClick={() => update(index, { file: null })}
                      className="p-1 rounded hover:bg-red-50 shrink-0"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                )}
                <label className="flex items-center gap-3 cursor-pointer border border-dashed border-gray-300 rounded-lg px-4 py-3 hover:border-red-300 hover:bg-red-50/30">
                  {uploadingIndex === index ? (
                    <Loader2 className="w-5 h-5 animate-spin text-red-600" />
                  ) : (
                    <Upload className="w-5 h-5 text-gray-400" />
                  )}
                  <span className="text-sm text-gray-600">
                    {entry.file?.secure_url ? "Replace file" : "Choose PDF or image"}
                  </span>
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,image/*"
                    disabled={uploadingIndex === index}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadFile(index, file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </label>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...entries, emptyEntry()])}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
      >
        <Plus className="w-4 h-4" />
        Add additional certification
      </button>
    </div>
  );
}

export function isCertificationEntryComplete(entry: OnboardingCertificationEntry): boolean {
  return Boolean(entry.name.trim() && entry.file?.secure_url);
}

export function hasValidCertifications(value: unknown): boolean {
  const entries = normalize(value);
  return entries.some(isCertificationEntryComplete);
}
