// Shared PDF page helpers, built on pdf-lib — it works the same in the
// browser (the "Add Tasks From Document(s)" page picker) and in Node (the
// /api/task-manager/extract route that actually trims the file before
// sending it to Claude), so page counting and page slicing only need to be
// written once.
import { PDFDocument } from "pdf-lib";

// How many pages a single upload can be trimmed to for extraction. Keeping
// this in one place means the client-side picker and the server-side
// enforcement in extract/route.ts can never drift apart.
export const MAX_EXTRACTION_PAGES = 6;

// How many documents can be read together in one extraction batch. Kept
// here — not as a separate local constant in DocumentExtractionModal.tsx
// (the picker) and extract/route.ts (the server) — for the same reason as
// MAX_EXTRACTION_PAGES above: one number both sides read, so the UI's "up
// to N files" copy and the server's actual limit can never quietly drift
// apart.
export const MAX_EXTRACTION_FILES = 5;

// A document longer than this proactively gets sent to the page picker
// before extraction is even attempted — it's very likely to run past the
// "too many obligations" token limit anyway, so there's no point spending a
// full Claude call just to find that out. Documents at or under this length
// are read in full by default; the picker only otherwise shows up as a
// recovery step if extraction genuinely gets cut off.
export const MAX_DOCUMENT_PAGES = 100;

/** Page count of a PDF from raw bytes. */
export async function getPdfPageCount(bytes: ArrayBuffer | Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Builds a new PDF containing only the given 1-indexed pages, in ascending
 * order regardless of the order they were passed in. Out-of-range or
 * non-integer page numbers are silently dropped rather than throwing — a
 * caller passing a stale selection (e.g. against a document that changed)
 * should still get whatever's still valid instead of a hard failure.
 *
 * Returns the trimmed PDF bytes alongside which pages actually made it in
 * and the source document's total page count, so a caller can label what
 * was sent (e.g. "pages 2, 5 of 12") without loading the document twice.
 */
export async function extractPdfPages(
  bytes: ArrayBuffer | Uint8Array,
  pages: number[],
): Promise<{ bytes: Uint8Array; pages: number[]; totalPages: number }> {
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();
  const validPages = [...new Set(pages)]
    .filter((p) => Number.isInteger(p) && p >= 1 && p <= totalPages)
    .sort((a, b) => a - b)
    .slice(0, MAX_EXTRACTION_PAGES);
  if (validPages.length === 0) throw new Error("No valid pages to extract");

  const newDoc = await PDFDocument.create();
  const copied = await newDoc.copyPages(srcDoc, validPages.map((p) => p - 1));
  copied.forEach((p) => newDoc.addPage(p));
  const outBytes = await newDoc.save();
  return { bytes: outBytes, pages: validPages, totalPages };
}
