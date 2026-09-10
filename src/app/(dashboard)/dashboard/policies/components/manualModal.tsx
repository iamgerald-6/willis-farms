"use client";
import { useEffect, useState } from "react";
import { Loader2, Upload, X, CheckCircle2, Sparkles, Plus, Pencil } from "lucide-react";

import { toast } from "sonner";
import api from "@/lib/api";
import {
  getDefaultPolicyCategoryLegacyValue,
  POLICIES_PAGE_COPY,
  POLICY_DESCRIPTION_MAX_CHARS,
} from "@/lib/moduleRegistry";
import { CLOUDINARY_UPLOAD_PRESET, cloudinaryUploadUrl } from "@/lib/cloudinary";
import { ACCEPT_PDF_OR_WORD, validatePdfOrWordFile } from "@/lib/uploadConstraints";

const DEFAULT_CATEGORY = getDefaultPolicyCategoryLegacyValue();

interface ManualVersion {
  version_id: string;
  version_label: string;
  cloudinary_url: string;
  file_name: string;
  file_size_bytes: number | null;
  version_notes: string | null;
  uploaded_by_id: string;
  uploaded_by_name: string;
  uploaded_at: string;
}

interface Manual {
  manual_id: string;
  title: string;
  category: string;
  description: string | null;
  versions: ManualVersion[];
}

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

// ─── Shared drop zone (used for both the "new manual" file and the "replace
// version file" case — same look, different label/required-ness) ──────────
function DocDropZone({
  file,
  onChange,
  onClear,
  hasError,
  placeholder,
}: {
  file: File | null;
  onChange: (f: File) => void;
  onClear: () => void;
  hasError?: boolean;
  placeholder: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputId = "manual-modal-file-input";

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
        accept={ACCEPT_PDF_OR_WORD}
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
            Drag & drop your PDF or <span className="text-red-600 font-medium">browse</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">{placeholder}</p>
        </>
      )}
    </div>
  );
}

export default function ManualModal({
  open,
  onClose,
  onSuccess,
  uploadedById,
  categories,
  manual,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  uploadedById: string;
  // The full set of categories actually in use (built-in + any custom ones
  // already added elsewhere). Typing a brand-new category here isn't allowed.
  categories: string[];
  /** Absent/null = creating a brand-new manual. Present = editing that
   * manual, prefilled from it (same pattern as the SOP add/edit modal). */
  manual?: Manual | null;
}) {
  const isEditing = !!manual;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(categories[0] ?? DEFAULT_CATEGORY);
  const [description, setDescription] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [versionNotes, setVersionNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // The file currently picked — a brand-new manual's document when creating,
  // or an optional replacement for the selected version when editing.
  const [file, setFile] = useState<File | null>(null);
  // Cached Cloudinary upload for `file`, so "Autofill" and the eventual save
  // never upload the same file twice.
  const [uploaded, setUploaded] = useState<{ secure_url: string; public_id: string } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [savingCreate, setSavingCreate] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);

  // Re-seed whenever the modal opens, or switches which manual it's editing
  // (or from editing to creating) — mirrors the SOP add/edit modal.
  useEffect(() => {
    if (!open) return;
    if (manual) {
      setTitle(manual.title);
      setCategory(manual.category);
      setDescription(manual.description ?? "");
      const first = manual.versions[0] ?? null;
      setSelectedVersionId(first?.version_id ?? "");
      setVersionLabel(first?.version_label ?? "");
      setVersionNotes(first?.version_notes ?? "");
    } else {
      setTitle("");
      setCategory(categories[0] ?? DEFAULT_CATEGORY);
      setDescription("");
      setSelectedVersionId("");
      setVersionLabel("");
      setVersionNotes("");
    }
    setFile(null);
    setUploaded(null);
    setExtracting(false);
    setExtractError(null);
    setErrors({});
    // Only re-run when the modal opens or switches which manual it's editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, manual?.manual_id]);

  if (!open) return null;

  const selectedVersion = manual?.versions.find((v) => v.version_id === selectedVersionId);

  const handleSelectVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
    const v = manual?.versions.find((x) => x.version_id === versionId);
    setVersionLabel(v?.version_label ?? "");
    setVersionNotes(v?.version_notes ?? "");
    setFile(null);
    setUploaded(null);
    setExtractError(null);
  };

  const handleFile = (f: File) => {
    const validationError = validatePdfOrWordFile(f);
    if (validationError) {
      setErrors((prev) => ({ ...prev, file: validationError }));
      return;
    }
    setFile(f);
    setUploaded(null);
    setExtractError(null);
    setErrors((prev) => ({ ...prev, file: "" }));
  };

  const handleClose = () => {
    if (savingCreate || savingDetails || savingVersion) return;
    onClose();
  };

  // Uploads the currently-picked file to Cloudinary if it hasn't been
  // already, caching the result so it's never uploaded twice.
  const ensureUploaded = async (): Promise<{ secure_url: string; public_id: string }> => {
    if (uploaded) return uploaded;
    const result = await uploadToCloudinary(file!);
    setUploaded(result);
    return result;
  };

  // Reads whichever file currently applies — a freshly picked one, or (when
  // editing, and nothing new has been picked) the selected version's
  // existing file, which needs no upload since it's already hosted.
  const handleExtract = async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      let fileUrl: string;
      let fileName: string;
      if (file) {
        const result = await ensureUploaded();
        fileUrl = result.secure_url;
        fileName = file.name;
      } else if (isEditing && selectedVersion) {
        fileUrl = selectedVersion.cloudinary_url;
        fileName = selectedVersion.file_name;
      } else {
        setExtractError("Choose a document first.");
        return;
      }
      const res = await api.post("/policies/extract", {
        file_url: fileUrl,
        file_name: fileName,
      });
      const extracted = res.data?.data as { title?: string; description?: string };
      if (extracted?.title) setTitle(extracted.title);
      if (extracted?.description) {
        setDescription(extracted.description.slice(0, POLICY_DESCRIPTION_MAX_CHARS));
      }
    } catch (err: any) {
      setExtractError(
        err?.response?.data?.error ?? err?.message ?? "Extraction failed. Please try again.",
      );
    } finally {
      setExtracting(false);
    }
  };

  // ── Create a brand-new manual + its first version, in one call ──
  const handleCreate = async () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Title is required";
    if (!category.trim()) e.category = "Category is required";
    if (!versionLabel.trim()) e.versionLabel = "Version label is required (e.g. v1.0)";
    if (!file) e.file = "Please attach a PDF file";
    if (Object.keys(e).length > 0) return setErrors(e);

    setSavingCreate(true);
    try {
      const { secure_url, public_id } = await ensureUploaded();
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
        err?.response?.data?.error ?? err?.message ?? "Upload failed. Please try again.";
      toast.error(message);
    } finally {
      setSavingCreate(false);
    }
  };

  // ── Edit mode: manual details (title/category/description) — its own save ──
  const handleSaveDetails = async () => {
    if (!manual) return;
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Title is required";
    if (!category.trim()) e.category = "Category is required";
    if (Object.keys(e).length > 0) return setErrors((prev) => ({ ...prev, ...e }));

    setSavingDetails(true);
    try {
      await api.patch(`/policies/${manual.manual_id}`, {
        title,
        category,
        description: description || null,
      });
      toast.success("Manual details updated.");
      onSuccess();
    } catch (err: any) {
      const message =
        err?.response?.data?.error ?? err?.message ?? "Update failed. Please try again.";
      toast.error(message);
    } finally {
      setSavingDetails(false);
    }
  };

  // ── Edit mode: the selected version's label/notes/optional file — its own save ──
  const handleSaveVersion = async () => {
    if (!manual || !selectedVersion) return;
    const e: Record<string, string> = {};
    if (!versionLabel.trim()) e.versionLabel = "Version label is required";
    if (Object.keys(e).length > 0) return setErrors((prev) => ({ ...prev, ...e }));

    setSavingVersion(true);
    try {
      let fileFields = {};
      if (file) {
        const { secure_url, public_id } = await ensureUploaded();
        fileFields = {
          cloudinary_url: secure_url,
          cloudinary_public_id: public_id,
          file_name: file.name,
          file_size_bytes: file.size,
        };
      }
      await api.patch(`/policies/${manual.manual_id}/versions/${selectedVersion.version_id}`, {
        version_label: versionLabel,
        version_notes: versionNotes || null,
        ...fileFields,
      });
      toast.success(`Version "${versionLabel}" updated.`);
      setFile(null);
      setUploaded(null);
      onSuccess();
    } catch (err: any) {
      const message =
        err?.response?.data?.error ?? err?.message ?? "Update failed. Please try again.";
      toast.error(message);
    } finally {
      setSavingVersion(false);
    }
  };

  const canExtract = !!file || (isEditing && !!selectedVersion);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {isEditing && <Pencil className="w-4 h-4 text-red-600" />}
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {isEditing ? "Edit manual" : POLICIES_PAGE_COPY.uploadModalTitle}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {isEditing ? manual!.title : POLICIES_PAGE_COPY.uploadModalSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Document — first, so it can be used to fill in Title/Description below ── */}
          <div className="space-y-3">
            {isEditing && manual!.versions.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                  Version
                </label>
                <select
                  value={selectedVersionId}
                  onChange={(e) => handleSelectVersion(e.target.value)}
                  className="w-full border border-gray-200 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {manual!.versions.map((v) => (
                    <option key={v.version_id} value={v.version_id}>
                      {v.version_label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                {isEditing ? (
                  <>
                    Replace File{" "}
                    <span className="text-gray-400 normal-case font-normal">
                      (optional — leave blank to keep the current file)
                    </span>
                  </>
                ) : (
                  <>
                    PDF File <span className="text-red-500">*</span>
                  </>
                )}
              </label>
              <DocDropZone
                file={file}
                onChange={handleFile}
                onClear={() => {
                  setFile(null);
                  setUploaded(null);
                  setExtractError(null);
                }}
                hasError={!!errors.file}
                placeholder={isEditing ? "PDF or Word" : "PDF files only"}
              />
              {errors.file && <p className="text-red-500 text-xs mt-1">{errors.file}</p>}
            </div>

            {canExtract && (
              <div>
                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={extracting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition disabled:opacity-60"
                >
                  {extracting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {extracting ? "Reading document…" : "Autofill with WillsFarms Intel"}
                </button>
                {extractError && (
                  <p className="text-red-500 text-xs mt-1">{extractError}</p>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* ── Manual details ── */}
          <div className="space-y-4">
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
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-gray-200 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="text-red-500 text-xs mt-1">{errors.category}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value.slice(0, POLICY_DESCRIPTION_MAX_CHARS))
                }
                placeholder="Brief description of what this manual covers..."
                rows={2}
                className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">
                {description.length}/{POLICY_DESCRIPTION_MAX_CHARS} characters
              </p>
            </div>

            {isEditing && (
              <button
                onClick={handleSaveDetails}
                disabled={savingDetails}
                className="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingDetails ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  "Save details"
                )}
              </button>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* ── Version label / notes ── */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              {isEditing ? "Edit version" : "Version"}
            </h3>

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
                <p className="text-red-500 text-xs mt-1">{errors.versionLabel}</p>
              )}
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

            {isEditing ? (
              manual!.versions.length === 0 ? (
                <p className="text-sm text-gray-400">No versions on this manual.</p>
              ) : (
                <button
                  onClick={handleSaveVersion}
                  disabled={savingVersion}
                  className="w-full border border-red-200 text-red-600 py-2.5 rounded-lg text-sm font-medium hover:bg-red-50 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {savingVersion ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    "Save version"
                  )}
                </button>
              )
            ) : null}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleClose}
              disabled={savingCreate || savingDetails || savingVersion}
              className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
            >
              {isEditing ? "Done" : "Cancel"}
            </button>
            {!isEditing && (
              <button
                onClick={handleCreate}
                disabled={savingCreate}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingCreate ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> {POLICIES_PAGE_COPY.uploadButton}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
