"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { ShieldAlert, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface AppraisalSummary {
  id: string;
  employee_name: string;
  job_title: string;
  review_quarter: string;
  review_year: number;
  status: string;
  locked_reason?: string | null;
}

/**
 * Justification Form (Section 8) — its own dedicated page, not a field
 * bolted onto the appraisal. A supervisor lands here from the "Submit
 * Justification" button on a locked appraisal.
 */
export default function SubmitJustificationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const appraisalId = searchParams.get("appraisal_id");

  const [reasonText, setReasonText] = useState("");
  const [error, setError] = useState("");

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: appraisal, isLoading } = useQuery<AppraisalSummary>({
    queryKey: ["appraisal", appraisalId],
    queryFn: async () => {
      const res = await api.get(`/appraisal/${appraisalId}`);
      return res.data.data;
    },
    enabled: !!appraisalId,
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await api.post("/appraisal/justification", {
        appraisal_id: appraisalId,
        supervisor_id: session?.user?.id,
        reason_text: reasonText,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success(
        "Justification submitted. Manager/Admin/Super Admin/L5+ reviewers have been notified.",
      );
      router.push("/dashboard/humanCapital/appraisal");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? "Failed to submit justification.");
    },
  });

  const handleSubmit = () => {
    if (!reasonText.trim()) {
      setError("Please explain why the evaluation wasn't completed in time.");
      return;
    }
    setError("");
    mutate();
  };

  if (!appraisalId) {
    return (
      <div className="p-6 min-h-screen bg-gray-50">
        <div className="max-w-lg mx-auto text-center py-24 text-gray-400">
          No appraisal specified.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-6"
      >
        ← Back
      </button>

      <div className="max-w-lg mx-auto bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="w-5 h-5 text-red-500" />
          <h1 className="text-lg font-bold text-gray-900">Justification Form</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Explain why the evaluation wasn't completed by the deadline. A
          Manager, Admin, Super Admin, or L5+ employee will review this and
          decide whether the 10-point deduction should be waived.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
          </div>
        ) : appraisal ? (
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 mb-5 text-sm">
            <p className="font-semibold text-gray-800">{appraisal.employee_name}</p>
            <p className="text-gray-500 text-xs mt-0.5">
              {appraisal.job_title} · {appraisal.review_quarter} {appraisal.review_year}
            </p>
          </div>
        ) : null}

        <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
          Reason for the delay <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={6}
          value={reasonText}
          onChange={(e) => {
            setReasonText(e.target.value);
            if (e.target.value.trim()) setError("");
          }}
          placeholder="Explain the circumstances that prevented you from completing the evaluation in time..."
          className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300 transition ${
            error ? "border-red-300 bg-red-50" : "border-gray-200"
          }`}
        />
        {error && (
          <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="mt-5 w-full px-6 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" /> Submit Justification
            </>
          )}
        </button>
      </div>
    </div>
  );
}
