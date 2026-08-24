"use client";
import { useState } from "react";
import { Loader2, Upload, X, CheckCircle2, Pencil } from "lucide-react";

import { toast } from "sonner";
import api from "@/lib/api";
import { CLOUDINARY_UPLOAD_PRESET, cloudinaryUploadUrl } from "@/lib/cloudinary";
import { ACCEPT_PDF_OR_WORD, validatePdfOrWordFile } from "@/lib/uploadConstraints";
import { POLICY_DESCRIPTION_MAX_CHARS } from "@/lib/moduleRegistry";

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

export default function EditManualModal({
  open,
  onClose,
  onSuccess,
  manual,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  manual: Manual | null;
  categories: string[];
}) {
  const [title, setTitle] = useState(manual?.title ?? "");
  const [category, setCategory] = useState(manual?.category ?? "");
  const [description, setDescription] = useState(manual?.description ?? "");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});

  // ── Version editor state ──
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    manual?.versions[0]?.version_id ?? "",
  );
  const [versionLabel, setVersionLabel] = useState("");
  const [versionNotes, setVersionNotes] = useState("");
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionErrors, setVersionErrors] = useState<Record<string, string>>({});

  // Re-seed local state whenever a different manual is opened for editing —
  // this modal instance is reused across rows rather than remounted.
  const [loadedManualId, setLoadedManualId] = useState<string | null>(null);
  if (manual && manual.manual_id !== loadedManualId) {
    setLoadedManualId(manual.manual_id);
    setTitle(manual.title);
    setCategory(manual.category);
    setDescription(manual.description ?? "");
    const first = manual.versions[0] ?? null;
    setSelectedVersionId(first?.version_id ?? "");
    setVersionLabel(first?.version_label ?? "");
    setVersionNotes(first?.version_notes ?? "");
    setReplacementFile(null);
  }

  if (!open || !manual) return null;

  const selectedVersion = manual.versions.find(
    (v) => v.version_id === selectedVersionId,
  );

  const handleSelectVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
    const v = manual.versions.find((x) => x.version_id === versionId);
    setVersionLabel(v?.version_label ?? "");
    setVersionNotes(v?.version_notes ?? "");
    setReplacementFile(null);
    setVersionErrors({});
  };

  const handleFile = (f: File) => {
    const validationError = validatePdfOrWordFile(f);
    if (validationError) {
      setVersionErrors((prev) => ({
        ...prev,
        file: validationError,
      }));
      return;
    }
    setReplacementFile(f);
    setVersionErrors((prev) => ({ ...prev, file: "" }));
  };

  const handleClose = () => {
    if (savingDetails || savingVersion) return;
    onClose();
  };

  // ── Save title / category / description ──
  const handleSaveDetails = async () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Title is required";
    if (!category.trim()) e.category = "Category is required";
    if (Object.keys(e).length > 0) return setDetailErrors(e);

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
        err?.response?.data?.error ??
        err?.message ??
        "Update failed. Please try again.";
      toast.error(message);
    } finally {
      setSavingDetails(false);
    }
  };

  // ── Save version label / notes / optional file replacement ──
  const handleSaveVersion = async () => {
    if (!selectedVersion) return;
    const e: Record<string, string> = {};
    if (!versionLabel.trim()) e.versionLabel = "Version label is required";
    if (Object.keys(e).length > 0) return setVersionErrors(e);

    setSavingVersion(true);
    try {
      let fileFields = {};
      if (replacementFile) {
        const { secure_url, public_id } = await uploadToCloudinary(
          replacementFile,
        );
        fileFields = {
          cloudinary_url: secure_url,
          cloudinary_public_id: public_id,
          file_name: replacementFile.name,
          file_size_bytes: replacementFile.size,
        };
      }
      await api.patch(
        `/policies/${manual.manual_id}/versions/${selectedVersion.version_id}`,
        {
          version_label: versionLabel,
          version_notes: versionNotes || null,
          ...fileFields,
        },
      );
      toast.success(`Version "${versionLabel}" updated.`);
      setReplacementFile(null);
      onSuccess();
    } catch (err: any) {
      const message =
        err?.response?.data?.error ??
        err?.message ??
        "Update failed. Please try again.";
      toast.error(message);
    } finally {
      setSavingVersion(false);
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
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-red-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Edit manual</h2>
              <p className="text-sm text-gray-500 mt-0.5">{manual.title}</p>
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
          {/* ── Manual details ── */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Manual details
            </h3>

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Manual Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {detailErrors.title && (
                <p className="text-red-500 text-xs mt-1">{detailErrors.title}</p>
              )}
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
              {detailErrors.category && (
                <p className="text-red-500 text-xs mt-1">
                  {detailErrors.category}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(
                    e.target.value.slice(0, POLICY_DESCRIPTION_MAX_CHARS),
                  )
                }
                rows={2}
                className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">
                {description.length}/{POLICY_DESCRIPTION_MAX_CHARS} characters
              </p>
            </div>

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
          </div>

          <div className="border-t border-gray-100" />

          {/* ── Version editor ── */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Edit a version
            </h3>

            {manual.versions.length === 0 ? (
              <p className="text-sm text-gray-400">No versions on this manual.</p>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                    Version
                  </label>
                  <select
                    value={selectedVersionId}
                    onChange={(e) => handleSelectVersion(e.target.value)}
                    className="w-full border border-gray-200 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {manual.versions.map((v) => (
                      <option key={v.version_id} value={v.version_id}>
                        {v.version_label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                    Version Label <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={versionLabel}
                    onChange={(e) => setVersionLabel(e.target.value)}
                    className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  {versionErrors.versionLabel && (
                    <p className="text-red-500 text-xs mt-1">
                      {versionErrors.versionLabel}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                    Version Notes
                  </label>
                  <textarea
                    value={versionNotes}
                    onChange={(e) => setVersionNotes(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                    Replace File{" "}
                    <span className="text-gray-400 normal-case font-normal">
                      (optional — leave blank to keep the current PDF)
                    </span>
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
                    className={`border-2 border-dashed rounded-xl p-4 text-center transition cursor-pointer ${
                      dragOver
                        ? "border-red-400 bg-red-50"
                        : replacementFile
                          ? "border-green-400 bg-green-50"
                          : "border-gray-200 hover:border-red-300 hover:bg-red-50/40"
                    }`}
                    onClick={() =>
                      document.getElementById("manual-version-replace")?.click()
                    }
                  >
                    <input
                      id="manual-version-replace"
                      type="file"
                      accept={ACCEPT_PDF_OR_WORD}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                      }}
                    />
                    {replacementFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-green-700">
                          {replacementFile.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReplacementFile(null);
                          }}
                          className="ml-1 text-gray-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
                        <Upload className="w-4 h-4" />
                        Drag & drop a PDF, or{" "}
                        <span className="text-red-600 font-medium">browse</span>
                      </div>
                    )}
                  </div>
                  {versionErrors.file && (
                    <p className="text-red-500 text-xs mt-1">
                      {versionErrors.file}
                    </p>
                  )}
                </div>

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
              </>
            )}
          </div>

          <button
            onClick={handleClose}
            disabled={savingDetails || savingVersion}
            className="w-full border border-gray-200 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
