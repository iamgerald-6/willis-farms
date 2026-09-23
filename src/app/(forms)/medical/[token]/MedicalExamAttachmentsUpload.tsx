"use client";

import { useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import type { MedicalAttachment } from "@/lib/medical/medicalInvestigationDefs";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import {
  ACCEPT_MEDICAL_EXAM_REPORTS,
  MAX_UPLOAD_FILE_SIZE_MB,
} from "@/lib/uploadConstraints";

export default function MedicalExamAttachmentsUpload({
  attachments,
  onChange,
  readOnly,
}: {
  attachments: MedicalAttachment[];
  onChange: (next: MedicalAttachment[]) => void;
  readOnly?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadCareersFile(
        file,
        "MedicalExamSupportingDocs",
        ACCEPT_MEDICAL_EXAM_REPORTS,
        "medical_exam_report",
      );
      onChange([
        ...attachments,
        {
          secure_url: uploaded.secure_url,
          public_id: uploaded.public_id,
          original_name: uploaded.original_name || file.name,
          uploaded_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (index: number) => {
    const next = [...attachments];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">Upload test results &amp; imaging</p>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          Attach X-ray images, laboratory reports, or other documents showing the actual test results
          (JPEG, PNG, or PDF — max {MAX_UPLOAD_FILE_SIZE_MB}MB each). You can upload multiple files.
        </p>
      </div>

      {attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map((doc, i) => (
            <li
              key={doc.secure_url}
              className="flex items-center justify-between gap-2 border border-gray-200 bg-white rounded-lg px-3 py-2.5 shadow-sm"
            >
              <a
                href={doc.secure_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-teal-800 truncate hover:underline font-medium"
              >
                {doc.original_name ?? "Document"}
              </a>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded shrink-0"
                  aria-label="Remove document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <label className="flex items-center gap-3 cursor-pointer border-2 border-dashed border-teal-400 rounded-xl bg-white px-5 py-4 hover:bg-teal-50/30 hover:border-teal-500 transition-colors">
          {uploading ? (
            <Loader2 className="w-6 h-6 animate-spin text-teal-700 shrink-0" />
          ) : (
            <Upload className="w-6 h-6 text-teal-600 shrink-0" />
          )}
          <span className="text-sm font-medium text-gray-800">
            {uploading ? "Uploading…" : "Click to upload X-ray or lab report (JPEG, PNG, or PDF)"}
          </span>
          <input
            type="file"
            className="sr-only"
            accept={ACCEPT_MEDICAL_EXAM_REPORTS}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      )}

      {readOnly && attachments.length === 0 && (
        <p className="text-xs text-gray-400 italic">No documents attached.</p>
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
