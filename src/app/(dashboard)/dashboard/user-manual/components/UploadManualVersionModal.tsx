"use client";
import { useState } from "react";
import { Loader2, Upload, X, CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { CLOUDINARY_UPLOAD_PRESET, cloudinaryUploadUrl } from "@/lib/cloudinary";
import { ACCEPT_PDF, exceedsMaxUploadSize, isPdfFile, maxUploadSizeError } from "@/lib/uploadConstraints";

// This is the one PDF everyone reads/downloads, not a PDF-or-Word library
// like Policies — kept strictly PDF so the inline viewer on the page always
// works.
function validatePdfFile(file: File): string | null {
  if (!isPdfFile(file)) return "Only PDF files are accepted.";
  if (exceedsMaxUploadSize(file)) return maxUploadSizeError(file);
  return null;
}

async function uploadToCloudinary(file: File): Promise<{ secure_url: string; public_id: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "UserManual");

  const res = await fetch(cloudinaryUploadUrl("image"), { method: "POST", body: formData });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(json?.error?.message ?? `Cloudinary upload failed (HTTP ${res.status})`);
  }
  return { secure_url: json.secure_url, public_id: json.public_id };
}

// Same drop-zone look as Policies' ManualModal, trimmed down — this is a
// single document, not a multi-document library, so there's no title/
// category/version picker, just the file plus a version label/notes pair.
function DocDropZone({
  file,
  onChange,
  onClear,
  hasError,
}: {
  file: File | null;
  onChange: (f: File) => void;
  onClear: () => void;
  hasError?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputId = "user-manual-upload-input";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) onChange(dropped);
      }}
      className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
        dragOver
          ? "border-red-400 bg-red-50"
          : file
            ? "border-green-400 bg-green-50"
            : hasError
              ? "border-red-300 bg-red-50"
              : "border-gray-200 hover:border-red-300 hover:bg-red-50/40"
      }`}
      onClick={() => document.getElementById(inputId)?.click()}
    >
      <input
        id={inputId}
        type="file"
        accept={ACCEPT_PDF}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
        }}
      />
      {file ? (
        <div className="flex items-center justify-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium text-green-700">{file.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="ml-1 text-gray-400 hover:text-red-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            Drag & drop the PDF or <span className="text-red-600 font-medium">browse</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">PDF files only</p>
        </>
      )}
    </div>
  );
}

export default function UploadManualVersionModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [versionNotes, setVersionNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleFile = (f: File) => {
    const validationError = validatePdfFile(f);
    if (validationError) {
      setErrors((prev) => ({ ...prev, file: validationError }));
      return;
    }
    setFile(f);
    setErrors((prev) => ({ ...prev, file: "" }));
  };

  const handleClose = () => {
    if (saving) return;
    setFile(null);
    setVersionLabel("");
    setVersionNotes("");
    setErrors({});
    onClose();
  };

  const handleSave = async () => {
    const e: Record<string, string> = {};
    if (!file) e.file = "Please attach a PDF file";
    if (!versionLabel.trim()) e.versionLabel = "Version label is required (e.g. v1.0)";
    if (Object.keys(e).length > 0) return setErrors(e);

    setSaving(true);
    try {
      const { secure_url, public_id } = await uploadToCloudinary(file!);
      await api.post("/user-manual", {
        cloudinary_url: secure_url,
        cloudinary_public_id: public_id,
        file_name: file!.name,
        file_size_bytes: file!.size,
        version_label: versionLabel,
        version_notes: versionNotes || undefined,
      });
      toast.success("User Manual updated.");
      onSuccess();
      handleClose();
    } catch (err: any) {
      const message = err?.response?.data?.error ?? err?.message ?? "Upload failed. Please try again.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Upload new version</h2>
            <p className="text-sm text-gray-500 mt-0.5">Replaces what everyone sees on the User Manual page.</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
              PDF File <span className="text-red-500">*</span>
            </label>
            <DocDropZone
              file={file}
              onChange={handleFile}
              onClear={() => setFile(null)}
              hasError={!!errors.file}
            />
            {errors.file && <p className="text-red-500 text-xs mt-1">{errors.file}</p>}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
              Version Label <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="e.g. v1.1"
              className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {errors.versionLabel && <p className="text-red-500 text-xs mt-1">{errors.versionLabel}</p>}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
              Version Notes
            </label>
            <textarea
              value={versionNotes}
              onChange={(e) => setVersionNotes(e.target.value)}
              placeholder="What changed in this version? (optional)"
              rows={2}
              className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleClose}
              disabled={saving}
              className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Upload
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
