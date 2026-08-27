/** Shared upload limits — PDF/Word docs and images max 5MB; images JPEG/PNG only. */

export const MAX_UPLOAD_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_FILE_SIZE_MB = 5;

export const ACCEPT_PDF = "application/pdf,.pdf";
export const ACCEPT_WORD =
  ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** Document uploads — always PDF or Word together, never one format alone. */
export const ACCEPT_PDF_OR_WORD = `${ACCEPT_PDF},${ACCEPT_WORD}`;
export const ACCEPT_IMAGE_JPEG_PNG = "image/jpeg,image/png,.jpg,.jpeg,.png";
export const ACCEPT_PDF_WORD_OR_IMAGE = `${ACCEPT_PDF_OR_WORD},${ACCEPT_IMAGE_JPEG_PNG}`;
/** @deprecated use ACCEPT_PDF_WORD_OR_IMAGE */
export const ACCEPT_PDF_OR_IMAGE = ACCEPT_PDF_WORD_OR_IMAGE;
/** Passport bio page — JPEG, PNG, or PDF scan. */
export const ACCEPT_PASSPORT_BIO = `${ACCEPT_IMAGE_JPEG_PNG},${ACCEPT_PDF}`;
export const ACCEPT_CV = `${ACCEPT_PDF_OR_WORD},${ACCEPT_IMAGE_JPEG_PNG}`;
export const ACCEPT_JD = ACCEPT_CV;
export const ACCEPT_TASK_MANAGER_DOC = ACCEPT_PDF_WORD_OR_IMAGE;

export const PASSPORT_BIO_FIELD_KEYS = new Set([
  "passport_bio_page",
  "personal.passport_bio_page",
]);

export function formatFileSizeMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function exceedsMaxUploadSize(file: File): boolean {
  return file.size > MAX_UPLOAD_FILE_SIZE_BYTES;
}

export function maxUploadSizeError(file: File): string {
  return `File must be ${MAX_UPLOAD_FILE_SIZE_MB}MB or smaller — this file is ${formatFileSizeMB(file.size)}MB.`;
}

export function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

export function isJpegOrPngFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    type === "image/jpeg" ||
    type === "image/png" ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png")
  );
}

export function isWordDocFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    type === "application/msword" ||
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function validatePdfSize(file: File): string | null {
  if (!isPdfFile(file)) return "Only PDF files are accepted.";
  if (exceedsMaxUploadSize(file)) return maxUploadSizeError(file);
  return null;
}

function validateWordSize(file: File): string | null {
  if (!isWordDocFile(file)) return "Only Word (.doc/.docx) files are accepted.";
  if (exceedsMaxUploadSize(file)) return maxUploadSizeError(file);
  return null;
}

export function validatePdfOrWordFile(file: File): string | null {
  if (isPdfFile(file)) return validatePdfSize(file);
  if (isWordDocFile(file)) return validateWordSize(file);
  return "Only PDF or Word (.doc/.docx) files are accepted.";
}

export function validateImageFile(file: File): string | null {
  if (!isJpegOrPngFile(file)) return "Only JPEG or PNG images are accepted.";
  if (exceedsMaxUploadSize(file)) return maxUploadSizeError(file);
  return null;
}

/** PDF, Word, JPEG, or PNG — used for certificates, medical reports, leave docs, etc. */
export function validatePdfOrImageFile(file: File): string | null {
  if (isPdfFile(file)) return validatePdfSize(file);
  if (isWordDocFile(file)) return validateWordSize(file);
  if (isJpegOrPngFile(file)) return validateImageFile(file);
  return "Only PDF, Word (.doc/.docx), JPEG, or PNG files are accepted.";
}

export function validateCvOrJdFile(file: File): string | null {
  return validatePdfOrImageFile(file);
}

export function validateTaskManagerDocumentFile(file: File): string | null {
  return validatePdfOrImageFile(file);
}

export function validatePassportBioFile(file: File): string | null {
  if (isPdfFile(file)) return validatePdfSize(file);
  if (isJpegOrPngFile(file)) return validateImageFile(file);
  return "Only JPEG, PNG, or PDF files are accepted.";
}

/** Validate a browser File against an HTML accept string (and optional field key). */
export function validateFileForAccept(
  file: File,
  accept?: string,
  fieldKey?: string,
): string | null {
  if (fieldKey && PASSPORT_BIO_FIELD_KEYS.has(fieldKey)) {
    return validatePassportBioFile(file);
  }

  const normalized = (accept ?? "").toLowerCase().trim();

  if (!normalized) {
    return validatePdfOrImageFile(file);
  }

  const allowsPdf = normalized.includes("pdf");
  const allowsWord =
    normalized.includes(".doc") ||
    normalized.includes("wordprocessingml") ||
    normalized.includes("msword");
  const allowsImage =
    normalized.includes("image") ||
    normalized.includes(".jpg") ||
    normalized.includes(".jpeg") ||
    normalized.includes(".png");

  if (allowsImage) {
    return validatePdfOrImageFile(file);
  }

  if (allowsPdf || allowsWord) {
    return validatePdfOrWordFile(file);
  }

  if (exceedsMaxUploadSize(file)) return maxUploadSizeError(file);
  return null;
}

export function uploadHintForField(fieldKey?: string, accept?: string): string {
  if (fieldKey && PASSPORT_BIO_FIELD_KEYS.has(fieldKey)) {
    return `JPEG, PNG, or PDF — max ${MAX_UPLOAD_FILE_SIZE_MB}MB.`;
  }

  const normalized = (accept ?? "").toLowerCase();
  const allowsImage =
    normalized.includes("image") ||
    normalized.includes(".jpg") ||
    normalized.includes(".jpeg") ||
    normalized.includes(".png");

  if (allowsImage) {
    return `PDF, Word (.doc/.docx), JPEG, or PNG — max ${MAX_UPLOAD_FILE_SIZE_MB}MB each.`;
  }

  if (
    normalized.includes("pdf") ||
    normalized.includes(".doc") ||
    normalized.includes("word")
  ) {
    return `PDF or Word (.doc/.docx) — max ${MAX_UPLOAD_FILE_SIZE_MB}MB.`;
  }

  return `Max file size ${MAX_UPLOAD_FILE_SIZE_MB}MB.`;
}
