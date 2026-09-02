"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  FileText,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import { ACCEPT_PDF_OR_WORD } from "@/lib/uploadConstraints";

type Props = {
  applicationId: string;
  candidateName: string;
  roleTitle: string;
  referenceNumber: string;
  onClose: () => void;
  onSaved: () => void;
};

type OfferLetterData = {
  offer_letter: { secure_url: string; original_name: string } | null;
  offer_letter_draft: string | null;
  offer_terms_saved_at: string | null;
  context: {
    salary_ghs: string | null;
    grade_level: string | null;
    pay_frequency: string | null;
    salary_display: string | null;
    employment_type: string | null;
    department: string | null;
    work_location: string | null;
    position_title: string | null;
    medical_reports: string[];
    recommended_start_date: string | null;
  } | null;
};

function formatCurrencyGhs(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const n = Number(value.replace(/,/g, ""));
  if (Number.isFinite(n) && n > 0) {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
      maximumFractionDigits: 2,
    }).format(n);
  }
  return `GHS ${value.trim()}`;
}

/** Survives Strict Mode remounts so we never fire two AI generations for one open. */
const offerLetterAutoGenerateStarted = new Set<string>();

export default function OfferLetterEditorModal({
  applicationId,
  candidateName,
  roleTitle,
  referenceNumber,
  onClose,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["offer-letter", applicationId],
    queryFn: async () => {
      const res = await api.get(
        `/careers/onboarding/offer-letter?application_id=${applicationId}`,
      );
      return res.data.data as OfferLetterData;
    },
  });

  const showInitialLoader = isLoading && !data;

  useEffect(() => {
    if (data?.offer_letter_draft) {
      setDraft(data.offer_letter_draft);
    }
  }, [data?.offer_letter_draft]);

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post("/careers/onboarding/offer-letter/generate", {
        application_id: applicationId,
      }),
    onSuccess: (res) => {
      const body = res.data.data.offer_letter_draft as string;
      setDraft(body);
      queryClient.setQueryData<OfferLetterData>(
        ["offer-letter", applicationId],
        (prev) =>
          prev
            ? { ...prev, offer_letter_draft: body }
            : {
                offer_letter: null,
                offer_letter_draft: body,
                offer_terms_saved_at: null,
                context: res.data.data.context ?? null,
              },
      );
      toast.success("Offer letter generated — review and edit before saving.");
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Generation failed.");
    },
  });

  const isGenerating = generateMutation.isPending;

  useEffect(() => {
    if (showInitialLoader || !data?.offer_terms_saved_at) return;
    if (data.offer_letter_draft?.trim()) return;
    if (offerLetterAutoGenerateStarted.has(applicationId)) return;
    offerLetterAutoGenerateStarted.add(applicationId);
    generateMutation.mutate();
    // One-shot auto-generate when the modal opens with no draft yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit generateMutation
  }, [showInitialLoader, applicationId, data?.offer_terms_saved_at, data?.offer_letter_draft]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = draft.trim();
      if (!trimmed) {
        throw new Error("Offer letter text is empty.");
      }

      await api.patch("/careers/onboarding/offer-letter", {
        application_id: applicationId,
        offer_letter_draft: trimmed,
      });

      const pdfRes = await fetch(
        `/api/careers/onboarding/offer-letter/pdf?application_id=${encodeURIComponent(applicationId)}`,
      );
      if (!pdfRes.ok) {
        const json = await pdfRes.json().catch(() => ({}));
        throw new Error(json.error ?? "PDF generation failed.");
      }

      const blob = await pdfRes.blob();
      const file = new File(
        [blob],
        `offer-letter-${referenceNumber}.pdf`,
        { type: "application/pdf" },
      );

      const uploaded = await uploadCareersFile(
        file,
        "careers/offer-letters",
        ACCEPT_PDF_OR_WORD,
        "offer_letter",
      );

      await api.patch("/careers/onboarding/offer-letter", {
        application_id: applicationId,
        offer_letter: uploaded,
      });
    },
    onSuccess: () => {
      toast.success("Offer letter saved and PDF ready.");
      onSaved();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Save failed.");
    },
  });

  const ctx = data?.context;
  const grossSalary = ctx?.salary_display ?? formatCurrencyGhs(ctx?.salary_ghs);
  const pdfPreviewUrl = `/api/careers/onboarding/offer-letter/pdf?application_id=${encodeURIComponent(applicationId)}`;
  const termsReady = Boolean(data?.offer_terms_saved_at);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Offer letter</h2>
            <p className="text-sm text-gray-500 mt-1">
              {candidateName} · {roleTitle} · {referenceNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {showInitialLoader ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !termsReady ? (
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-6 text-sm text-amber-900 text-center">
              Save offer terms (role, salary, pay frequency, and employment
              placement) before generating the offer letter.
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-red-100 bg-gradient-to-b from-red-50/80 to-white p-5">
                <div className="border-b-2 border-red-700 pb-3 mb-4">
                  <p className="text-lg font-bold text-red-800">Wills Farms Ltd.</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Genetics-led agribusiness · Professional farm management
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    info@willsfarms.com · www.willsfarms.com · Ghana
                  </p>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  Letter preview
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap min-h-[8rem]">
                  {draft.trim() || "Generate a draft with AI, then edit the text below."}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                {grossSalary && (
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <p className="text-xs text-gray-500">Gross salary</p>
                    <p className="font-semibold text-gray-900">{grossSalary}</p>
                  </div>
                )}
                {ctx?.pay_frequency && (
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <p className="text-xs text-gray-500">Pay frequency</p>
                    <p className="font-semibold text-gray-900">{ctx.pay_frequency}</p>
                  </div>
                )}
                {ctx?.grade_level && (
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <p className="text-xs text-gray-500">Grade level</p>
                    <p className="font-semibold text-gray-900">{ctx.grade_level}</p>
                  </div>
                )}
                {ctx?.recommended_start_date && (
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <p className="text-xs text-gray-500">Proposed start</p>
                    <p className="font-semibold text-gray-900">
                      {ctx.recommended_start_date}
                    </p>
                  </div>
                )}
                {ctx?.employment_type && (
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <p className="text-xs text-gray-500">Employment type</p>
                    <p className="font-semibold text-gray-900">{ctx.employment_type}</p>
                  </div>
                )}
                {ctx?.department && (
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <p className="text-xs text-gray-500">Department</p>
                    <p className="font-semibold text-gray-900">{ctx.department}</p>
                  </div>
                )}
                {ctx?.work_location && (
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <p className="text-xs text-gray-500">Work location</p>
                    <p className="font-semibold text-gray-900">{ctx.work_location}</p>
                  </div>
                )}
              </div>

              {ctx?.medical_reports?.length ? (
                <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-3">
                  <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                    Required medical reports
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-950 list-disc pl-5">
                    {ctx.medical_reports.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Edit offer letter
                </label>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={14}
                  className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
                  placeholder="Dear …"
                />
              </div>

              {data?.offer_letter?.secure_url && (
                <a
                  href={data.offer_letter.secure_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline"
                >
                  <FileText className="w-4 h-4" />
                  Current saved PDF
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 p-5 border-t border-gray-100 bg-gray-50/80 rounded-b-2xl">
          <button
            type="button"
            onClick={() => generateMutation.mutate()}
            disabled={!termsReady || isGenerating || saveMutation.isPending}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 bg-white text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {draft.trim() ? "Regenerate with AI" : "Generate with AI"}
          </button>
          {draft.trim() && (
            <a
              href={pdfPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <FileText className="w-4 h-4" />
              Preview PDF
            </a>
          )}
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!draft.trim() || saveMutation.isPending || isGenerating}
            className="sm:ml-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save offer letter PDF
          </button>
        </div>
      </div>
    </div>
  );
}
