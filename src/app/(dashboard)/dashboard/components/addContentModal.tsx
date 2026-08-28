"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  X,
  FileText,
  FileImage,
  Upload,
  Loader2,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import { Content } from "@/types";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  getSopCategoryLegacyValues,
  getSopCategoryOptions,
  getSopSubcategoriesForCategory,
  SOP_DESCRIPTION_MAX_CHARS,
} from "@/lib/moduleRegistry";
import { CLOUDINARY_UPLOAD_PRESET, cloudinaryUploadUrl } from "@/lib/cloudinary";
import {
  ACCEPT_IMAGE_JPEG_PNG,
  ACCEPT_PDF_OR_WORD,
  validateImageFile,
  validatePdfOrWordFile,
} from "@/lib/uploadConstraints";

const SOP_CATEGORY_VALUES = getSopCategoryLegacyValues() as unknown as [
  string,
  ...string[],
];
const SOP_CATEGORY_OPTIONS = getSopCategoryOptions();

const contentSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  category: z.enum(SOP_CATEGORY_VALUES, {
    error: "Category is required",
  }),
  sub_category: z.string().min(1, "Sub-category is required"),
  description: z
    .string()
    .min(5, "Description must be at least 5 characters")
    .max(
      SOP_DESCRIPTION_MAX_CHARS,
      `Description must be at most ${SOP_DESCRIPTION_MAX_CHARS} characters`,
    ),
  document_read_minutes: z.number().min(1, "Read time is required"),
});

export type ContentFormValues = {
  title: string;
  category: string;
  sub_category: string;
  description: string;
  document_read_minutes: number;
};

interface Props {
  open: boolean;
  setOpen: (val: boolean) => void;
  onSuccess?: (content: Content) => void;

  editingContent?: Content | null;

  performedBy: { id: string; name: string } | null;
}

// Cloudinary's unsigned-upload preset on this account caps individual files
// at 100MB — larger files don't get a graceful JSON error back, the
// connection just gets cut, which the browser reports as a bare "Failed to
// fetch" (no status code, no response body to read a real reason from).
function formatFileSizeMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

async function uploadToCloudinary(file: File, folder: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", folder);

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isPdf = file.type === "application/pdf";
  const resourceType = isImage || isPdf ? "image" : isVideo ? "video" : "raw";

  let res: Response;
  try {
    res = await fetch(cloudinaryUploadUrl(resourceType), {
      method: "POST",
      body: formData,
    });
  } catch {
    // fetch() itself only throws for a network-level failure (connection
    // reset, dropped, CORS block) — there's no response to inspect, so the
    // most common real-world cause (an oversized file getting cut off
    // mid-upload) is the most useful thing to say here.
    throw new Error(
      `Upload failed before it could complete — likely because "${file.name}" (${formatFileSizeMB(file.size)}MB) is too large, or the connection dropped. Try a smaller file or a more stable connection.`,
    );
  }

  const json = await res.json();
  if (!json.secure_url) {
    throw new Error(
      json?.error?.message ?? `Cloudinary upload failed (HTTP ${res.status})`,
    );
  }
  return json.secure_url as string;
}

// ─── Field wrapper ─────────────────────────────────────────────────────────────
function Field({
  label,
  required,
  error,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
        {icon && <span className="text-gray-400">{icon}</span>}
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

// ─── File Drop Zone ────────────────────────────────────────────────────────────
function FileDropZone({
  accept,
  file,
  onChange,
  placeholder,
  hasError,
  disabled,
}: {
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
  placeholder: string;
  hasError?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-4 transition",
        disabled
          ? "opacity-50 cursor-not-allowed bg-gray-50 border-gray-200"
          : "cursor-pointer hover:border-red-400 hover:bg-red-50/30",
        hasError ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50",
      ].join(" ")}
    >
      <Upload className="w-4 h-4 text-gray-400" />
      <span className="text-xs text-center text-gray-500 truncate max-w-full px-2">
        {file ? file.name : placeholder}
      </span>
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

// ─── Input class helper ────────────────────────────────────────────────────────
function inputCls(hasError?: boolean, isDisabled?: boolean) {
  return [
    "w-full border rounded-lg px-3 py-2 text-sm text-gray-900 transition",
    "focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent",
    "placeholder:text-gray-400",
    hasError ? "border-red-300 bg-red-50" : "border-gray-200 bg-white",
    isDisabled ? "bg-gray-50 text-gray-400 cursor-not-allowed" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// ─── Upload payload type ───────────────────────────────────────────────────────
interface UploadPayload {
  id?: string;
  title: string;
  category: string;
  sub_category: string;
  description: string;
  cover_image_url: string | null;
  document_url: string | null;
  document_read_minutes: number;
  video_url: string | null;
  video_duration_minutes: number | null;
  created_by?: string;
  performed_by?: string;
  performed_by_name?: string;
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AddContentModal({
  open,
  setOpen,
  onSuccess,
  editingContent,
  performedBy,
}: Props) {
  const isEditing = !!editingContent;
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [fileErrors, setFileErrors] = useState<{
    cover?: string;
    doc?: string;
  }>({});

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ContentFormValues>({
    resolver: zodResolver(contentSchema),
  });

  // Pre-fill from the SOP being edited, or clear to a blank form for
  // creating a new one — runs whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    if (editingContent) {
      reset({
        title: editingContent.title,
        category: editingContent.category,
        sub_category: editingContent.sub_category,
        description: editingContent.description,
        document_read_minutes:
          editingContent.document_read_minutes ?? undefined,
      });
    } else {
      reset({
        title: "",
        category: "",
        sub_category: "",
        description: "",
        document_read_minutes: undefined,
      });
    }
    setCoverFile(null);
    setDocFile(null);
    setFileErrors({});
    setServerError(null);
    setSuccessMsg(null);
    // Only re-run when the modal opens or switches which SOP it's editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingContent]);

  const selectedCategory = watch("category");
  const subOptions = selectedCategory
    ? getSopSubcategoriesForCategory(selectedCategory).map(
        (s) => s.legacyValue ?? s.label,
      )
    : [];

  const descriptionValue = watch("description") ?? "";
  const descriptionCharCount = descriptionValue.length;

  const validateFiles = () => {
    const errs: { cover?: string; doc?: string } = {};
    // Document is only required when creating a brand-new SOP (matches the
    // Document field's required={!isEditing} hint below). When editing,
    // whatever the SOP already has is preserved/updated as-is by onSubmit's
    // docUrl fallback.
    if (!isEditing && !docFile) {
      errs.doc = "Document is required";
    }
    setFileErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const { mutate, isPending } = useMutation({
    mutationFn: async (payload: UploadPayload) => {
      const res = payload.id
        ? await api.patch("/sop/update", payload)
        : await api.post("/sop/upload", payload);
      return res.data;
    },
    onSuccess: (result) => {
      setSuccessMsg(
        isEditing ? "SOP updated successfully!" : "SOP added successfully!",
      );
      onSuccess?.(result.content);
      setTimeout(() => handleClose(), 1200);
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error ??
        "Something went wrong. Please try again.";
      setServerError(message);
    },
  });

  const onSubmit = async (data: ContentFormValues) => {
    if (!validateFiles()) return;

    setServerError(null);
    setSuccessMsg(null);

    try {
      const [coverUrl, docUrl] = await Promise.all([
        coverFile
          ? uploadToCloudinary(coverFile, "WillImage")
          : Promise.resolve(editingContent?.cover_image_url ?? null),
        docFile
          ? uploadToCloudinary(docFile, "WillDocs")
          : Promise.resolve(editingContent?.document_url ?? null),
      ]);

      mutate({
        ...(isEditing ? { id: editingContent!.id } : {}),
        title: data.title,
        category: data.category,
        sub_category: data.sub_category,
        description: data.description,
        cover_image_url: coverUrl,
        document_url: docUrl,
        document_read_minutes: data.document_read_minutes,
        video_url: editingContent?.video_url ?? null,
        video_duration_minutes: editingContent?.video_duration_minutes ?? null,
        ...(isEditing ? {} : { created_by: performedBy?.id }),
        performed_by: performedBy?.id,
        performed_by_name: performedBy?.name,
      });
    } catch (err: any) {
      setServerError(err.message ?? "File upload failed. Please try again.");
    }
  };

  const handleClose = () => {
    if (isPending) return;
    reset();
    setCoverFile(null);
    setDocFile(null);
    setFileErrors({});
    setServerError(null);
    setSuccessMsg(null);
    setOpen(false);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto focus:outline-none">
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
            <div>
              <Dialog.Title className="text-lg font-bold text-gray-900">
                {isEditing ? "Edit SOP" : "Add SOP"}
              </Dialog.Title>
              <p className="text-xs text-gray-400 mt-0.5">
                Files upload to Cloudinary. Fields marked{" "}
                <span className="text-red-500">*</span> are required.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── Form ── */}
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="px-6 py-5 space-y-5"
          >
            {serverError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {serverError}
              </div>
            )}
            {successMsg && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                {successMsg}
              </div>
            )}

            {/* Title */}
            <Field label="Title" required error={errors.title?.message}>
              <input
                type="text"
                placeholder="e.g. Farrowing Crate Preparation"
                {...register("title")}
                className={inputCls(!!errors.title)}
              />
            </Field>

            {/* Category + Sub-category */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category" required error={errors.category?.message}>
                <select
                  {...register("category")}
                  className={inputCls(!!errors.category)}
                >
                  <option value="">Select category</option>
                  {SOP_CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.legacyValue ?? c.label}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Sub-category"
                required
                error={errors.sub_category?.message}
              >
                <select
                  {...register("sub_category")}
                  disabled={!selectedCategory}
                  className={inputCls(!!errors.sub_category, !selectedCategory)}
                >
                  <option value="">
                    {selectedCategory
                      ? "Select sub-category"
                      : "Choose category first"}
                  </option>
                  {subOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Description */}
            <Field
              label="Description"
              required
              error={errors.description?.message}
            >
              <textarea
                rows={3}
                placeholder={`What does this SOP cover? (${SOP_DESCRIPTION_MAX_CHARS} characters max)`}
                {...register("description")}
                onChange={(e) => {
                  // Let RHF record the keystroke first, then — if it pushed
                  // past the character cap — use setValue so both the
                  // visible text and RHF's internal form state get
                  // truncated together. Mutating e.target.value directly
                  // here would only fix the display: RHF already reads the
                  // untruncated value before a custom onChange runs, so the
                  // extra characters would still slip into the submitted
                  // data.
                  register("description").onChange(e);
                  if (e.target.value.length > SOP_DESCRIPTION_MAX_CHARS) {
                    setValue(
                      "description",
                      e.target.value.slice(0, SOP_DESCRIPTION_MAX_CHARS),
                      { shouldValidate: true },
                    );
                  }
                }}
                className={`${inputCls(!!errors.description)} resize-none`}
              />
              <p
                className={`text-xs text-right ${
                  descriptionCharCount >= SOP_DESCRIPTION_MAX_CHARS
                    ? "text-red-500 font-medium"
                    : "text-gray-400"
                }`}
              >
                {descriptionCharCount}/{SOP_DESCRIPTION_MAX_CHARS} characters
              </p>
            </Field>

            {/* ── Media section ── */}
            <div className="border-t border-dashed border-gray-200 pt-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Media &amp; Documents
              </p>

              <Field
                label="Cover Image"
                icon={<FileImage className="w-4 h-4" />}
                error={fileErrors.cover}
              >
                <FileDropZone
                  accept={ACCEPT_IMAGE_JPEG_PNG}
                  file={coverFile}
                  onChange={(f) => {
                    if (!f) {
                      setCoverFile(null);
                      return;
                    }
                    const validationError = validateImageFile(f);
                    if (validationError) {
                      setFileErrors((prev) => ({ ...prev, cover: validationError }));
                      setCoverFile(null);
                      return;
                    }
                    setFileErrors((prev) => ({ ...prev, cover: undefined }));
                    setCoverFile(f);
                  }}
                  placeholder={
                    isEditing
                      ? "Click to replace (optional)"
                      : "Click to upload (optional)"
                  }
                />
                {coverFile ? (
                  <img
                    src={URL.createObjectURL(coverFile)}
                    alt="Cover preview"
                    className="w-full h-36 object-cover rounded-lg mt-2 border border-gray-100"
                  />
                ) : (
                  isEditing &&
                  editingContent?.cover_image_url && (
                    <img
                      src={editingContent.cover_image_url}
                      alt="Current cover"
                      className="w-full h-36 object-cover rounded-lg mt-2 border border-gray-100"
                    />
                  )
                )}
              </Field>

              <div className="grid grid-cols-2 gap-4 mt-4 items-start">
                <Field
                  label="Document (PDF / Word)"
                  required={!isEditing}
                  icon={<FileText className="w-4 h-4" />}
                  error={fileErrors.doc}
                >
                  <FileDropZone
                    accept={ACCEPT_PDF_OR_WORD}
                    file={docFile}
                    onChange={(f) => {
                      if (!f) {
                        setDocFile(null);
                        return;
                      }
                      const validationError = validatePdfOrWordFile(f);
                      if (validationError) {
                        setFileErrors((prev) => ({ ...prev, doc: validationError }));
                        setDocFile(null);
                        return;
                      }
                      setDocFile(f);
                      setFileErrors((prev) => ({ ...prev, doc: undefined }));
                    }}
                    placeholder={
                      isEditing && editingContent?.document_url
                        ? "Existing document on file — click to replace"
                        : "Click to upload a document"
                    }
                    hasError={!!fileErrors.doc}
                  />
                </Field>

                <Field
                  label="Estimated Read Time (min)"
                  required
                  error={errors.document_read_minutes?.message}
                >
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g. 10"
                    {...register("document_read_minutes", {
                      setValueAs: (v) => (v === "" ? undefined : Number(v)),
                    })}
                    className={inputCls(!!errors.document_read_minutes)}
                  />
                </Field>
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-5 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition font-medium flex items-center gap-2 disabled:opacity-60"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isEditing ? "Saving…" : "Uploading…"}
                  </>
                ) : isEditing ? (
                  <>
                    <Pencil className="w-4 h-4" /> Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> Add SOP
                  </>
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
