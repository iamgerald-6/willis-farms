"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, FileWarning } from "lucide-react";
import { getPdfPageCount, MAX_EXTRACTION_PAGES } from "@/lib/pdfPages";

// Lets a reviewer see the real document (in an embedded viewer — full
// scroll/zoom, not a static thumbnail) and pick which pages Claude should
// actually read, capped at MAX_EXTRACTION_PAGES. Only meaningful for PDFs —
// an image is already a single "page", and Word docs are read as plain
// text with no page boundaries — so the parent only renders this for PDF
// entries. `source` is a freshly-picked File for the upload tab, or the
// document's own URL for something chosen from "Choose existing".
export default function PdfPagePicker({
  source,
  pages,
  onChange,
  onUnavailable,
}: {
  source: File | string;
  pages: number[];
  onChange: (pages: number[]) => void;
  onUnavailable: () => void;
}) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const objectUrlRef = useRef<string | null>(null);

  const previewUrl = useMemo(() => {
    if (typeof source === "string") return source;
    const url = URL.createObjectURL(source);
    objectUrlRef.current = url;
    return url;
  }, [source]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const bytes = typeof source === "string" ? await (await fetch(source)).arrayBuffer() : await source.arrayBuffer();
        const count = await getPdfPageCount(bytes);
        if (cancelled) return;
        setPageCount(count);
        // Default selection: a short document just uses all of it, so
        // there's nothing to pick. A longer one defaults to page 1 rather
        // than leaving the selection empty — the common case (the relevant
        // clause is on one page) is then already a valid choice, and the
        // reviewer only needs to act if they want a different page.
        onChange(count <= MAX_EXTRACTION_PAGES ? Array.from({ length: count }, (_, i) => i + 1) : [1]);
      } catch (err: any) {
        if (cancelled) return;
        const reason = err?.message ? String(err.message) : "unknown error";
        setError(`Couldn't read this as a PDF (${reason}) — it will be read in full instead.`);
        onUnavailable();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately only re-run when the source itself changes — onChange/
    // onUnavailable are recreated by the parent on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const togglePage = (n: number) => {
    if (pages.includes(n)) {
      onChange(pages.filter((p) => p !== n));
    } else {
      if (pages.length >= MAX_EXTRACTION_PAGES) return;
      onChange([...pages, n].sort((a, b) => a - b));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-2.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading page preview…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-600 py-2">
        <FileWarning className="w-3.5 h-3.5 flex-shrink-0" /> {error}
      </div>
    );
  }

  if (!pageCount) return null;

  return (
    <div className="mt-2 border border-gray-100 rounded-lg overflow-hidden">
      <iframe src={previewUrl} title="Document preview" className="w-full h-56 border-0" />
      <div className="p-2.5 border-t border-gray-100 bg-gray-50">
        <p className="text-[11px] text-gray-500 mb-1.5">
          {pageCount <= MAX_EXTRACTION_PAGES
            ? `${pageCount} page${pageCount === 1 ? "" : "s"} — all will be read.`
            : `Select up to ${MAX_EXTRACTION_PAGES} pages for Claude to read (${pages.length} of ${MAX_EXTRACTION_PAGES} selected):`}
        </p>
        {pageCount > MAX_EXTRACTION_PAGES && (
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => {
              const checked = pages.includes(n);
              const disabled = !checked && pages.length >= MAX_EXTRACTION_PAGES;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => togglePage(n)}
                  disabled={disabled}
                  className={`text-xs px-2 py-1 rounded-md border transition ${
                    checked
                      ? "bg-red-600 border-red-600 text-white"
                      : disabled
                        ? "border-gray-100 text-gray-300 cursor-not-allowed"
                        : "border-gray-200 text-gray-600 hover:border-red-300"
                  }`}
                >
                  Page {n}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
