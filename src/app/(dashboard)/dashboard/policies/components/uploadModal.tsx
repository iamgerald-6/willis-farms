"use client";
import { useState } from "react";
import { Loader2, Upload, X, CheckCircle2 } from "lucide-react";

import { toast } from "sonner";
import api from "@/lib/api";
import {
  getDefaultPolicyCategoryLegacyValue,
  getPolicyCategoryLegacyValues,
  POLICIES_PAGE_COPY,
} from "@/lib/moduleRegistry";
import { CLOUDINARY_UPLOAD_PRESET, cloudinaryUploadUrl } from "@/lib/cloudinary";

const POLICY_CATEGORY_SUGGESTIONS = getPolicyCategoryLegacyValues();
const DEFAULT_CATEGORY = getDefaultPolicyCategoryLegacyValue();

export default function UploadManualModal({
  open,
  onClose,
  onSuccess,
  uploadedById,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  uploadedById: string;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [description, setDescription] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [versionNotes, setVersionNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!open) return null;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Title is required";
    if (!category.trim()) e.category = "Category is required";
    if (!versionLabel.trim())
      e.versionLabel = "Version label is required (e.g. v1.0)";
    if (!file) e.file = "Please attach a PDF file";
    return e;
  };

  const handleFile = (f: File) => {
    if (f.type !== "application/pdf") {
      setErrors((prev) => ({ ...prev, file: "Only PDF files are accepted" }));
      return;
    }
    setFile(f);
    setErrors((prev) => ({ ...prev, file: "" }));
  };

  const handleClose = () => {
    if (isUploading) return;
    setTitle("");
    setCategory(DEFAULT_CATEGORY);
    setDescription("");
    setVersionLabel("");
    setVersionNotes("");
    setFile(null);
    setErrors({});
    onClose();
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) return setErrors(e);
    setIsUploading(true);
    try {
      const { secure_url, public_id } = await uploadToCloudinary(file!);
      await api.post("/policies/create_policies", {
        title,
        category,
        description: description || undefined,
        version_label: versionLabel,
        version_notes: versionNotes || undefined,
        cloudinary_public_id: public_id,
        cloudinary_url: secure_url,
        file_name: file!.name,
        file_size_bytes: file!.size,
        uploaded_by: uploadedById,
      });
      toast.success(`"${title}" uploaded successfully.`);
      onSuccess();
      handleClose();
    } catch (err: any) {
      const message =
        err?.response?.data?.error ??
        err?.message ??
        "Upload failed. Please try again.";
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  async function uploadToCloudinary(file: File): Promise<{
    secure_url: string;
    public_id: string;
  }> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", "WillDocs");

    const res = await fetch(cloudinaryUploadUrl("image"), {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    if (!res.ok || !json.secure_url) {
      const cloudErr =
        json?.error?.message ?? `Cloudinary upload failed (HTTP ${res.status})`;
      throw new Error(cloudErr);
    }
    return { secure_url: json.secure_url, public_id: json.public_id };
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {POLICIES_PAGE_COPY.uploadModalTitle}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {POLICIES_PAGE_COPY.uploadModalSubtitle}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
              Manual Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Employee Handbook"
              className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {errors.title && (
              <p className="text-red-500 text-xs mt-1">{errors.title}</p>
            )}
          </div>

          {/* Category + Version */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Category
              </label>
              <input
                type="text"
                list="manual-category-options"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. HR, or type a new one"
                className="w-full border border-gray-200 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <datalist id="manual-category-options">
                {POLICY_CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="text-[11px] text-gray-400 mt-1">
                Pick an existing one or type a new category.
              </p>
              {errors.category && (
                <p className="text-red-500 text-xs mt-1">{errors.category}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Version Label <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
                placeholder="e.g. v1.0"
                className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {errors.versionLabel && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.versionLabel}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this manual covers..."
              rows={2}
              className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>

          {/* Version Notes */}
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

          {/* Drop Zone */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
              PDF File <span className="text-red-500">*</span>
            </label>
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
                if (dropped) handleFile(dropped);
              }}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
                dragOver
                  ? "border-red-400 bg-red-50"
                  : file
                    ? "border-green-400 bg-green-50"
                    : "border-gray-200 hover:border-red-300 hover:bg-red-50/40"
              }`}
              onClick={() =>
                document.getElementById("manual-pdf-upload")?.click()
              }
            >
              <input
                id="manual-pdf-upload"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-700">
                    {file.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
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
                    Drag & drop your PDF or{" "}
                    <span className="text-red-600 font-medium">browse</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">PDF files only</p>
                </>
              )}
            </div>
            {errors.file && (
              <p className="text-red-500 text-xs mt-1">{errors.file}</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleClose}
              disabled={isUploading}
              className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isUploading}
              className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />{" "}
                  {POLICIES_PAGE_COPY.uploadButton}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
