"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { User } from "@/types";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { ListRowsSkeleton } from "@/components/skeletons/PageSkeletons";

interface Justification {
  id: string;
  appraisal_id: string;
  supervisor_id: string;
  reason_text: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by_name?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
  points_waived: boolean;
  created_at: string;
  appraisals?: {
    employee_name: string;
    job_title: string;
    review_quarter: string;
    review_year: number;
  } | null;
}

function StatusPill({ status }: { status: Justification["status"] }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <ShieldCheck className="w-3.5 h-3.5" /> Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
        <ShieldX className="w-3.5 h-3.5" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="w-3.5 h-3.5" /> Pending
    </span>
  );
}

function JustificationCard({ justification }: { justification: Justification }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async (decision: "approved" | "rejected") => {
      const res = await api.patch(`/appraisal/justification/${justification.id}`, {
        decision,
        reviewer_id: session?.user?.id,
        review_notes: notes || null,
      });
      return res.data;
    },
    onSuccess: (_, decision) => {
      toast.success(
        decision === "approved"
          ? "Justification approved — deduction waived, appraisal reopened."
          : "Justification rejected — deduction stands, appraisal reopened.",
      );
      queryClient.invalidateQueries({ queryKey: ["appraisal-justifications-pending"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? "Failed to record decision.");
    },
  });

  const appraisal = justification.appraisals;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-sm font-bold text-gray-900">
            {appraisal?.employee_name ?? "Unknown employee"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {appraisal?.job_title} · {appraisal?.review_quarter} {appraisal?.review_year}
          </p>
        </div>
        <StatusPill status={justification.status} />
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 mb-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Reason given
        </p>
        <p className="text-sm text-gray-700">
          {expanded || justification.reason_text.length <= 220
            ? justification.reason_text
            : `${justification.reason_text.slice(0, 220)}...`}
        </p>
        {justification.reason_text.length > 220 && (
          <button
            onClick={() => setExpanded((p) => !p)}
            className="text-xs text-blue-500 hover:underline mt-1"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {justification.status === "pending" ? (
        <>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Review notes (optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes to share with the supervisor/employee..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300 mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={() => mutate("approved")}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> Approve (waive deduction)
            </button>
            <button
              onClick={() => mutate("rejected")}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <XCircle className="w-4 h-4" /> Reject (deduction stands)
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-500">
          Reviewed by <strong>{justification.reviewed_by_name}</strong>
          {justification.review_notes ? ` — ${justification.review_notes}` : ""}
        </p>
      )}
    </div>
  );
}

export default function JustificationsInboxPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "">("pending");

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const profile = users?.find((u) => u.user_id === session?.user?.id);
  const role = profile?.role ?? (session?.user?.user_metadata?.role as string | undefined);
  const canReview = hasFullAppraisalAccess(role, profile?.grade_level);

  const { data: justifications, isLoading } = useQuery<Justification[]>({
    queryKey: ["appraisal-justifications-pending", filter],
    queryFn: async () => {
      const res = await api.get(
        `/appraisal/justification${filter ? `?status=${filter}` : ""}`,
      );
      return res.data.data ?? [];
    },
    enabled: canReview,
  });

  if (session && !canReview) {
    return (
      <div className="p-6 min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            Only Manager, Admin, Super Admin, or L5+ employees can review justifications.
          </p>
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

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          Appraisal Justifications
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Review why a supervisor missed an evaluation deadline and decide
          whether the 10-point deduction should be waived.
        </p>
      </div>

      <div className="flex gap-1.5 mb-5">
        {(["pending", "approved", "rejected", ""] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
              filter === f
                ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
          >
            {f === "" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading && <ListRowsSkeleton rows={4} />}

      {!isLoading && (justifications?.length ?? 0) === 0 && (
        <div className="text-center py-24 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Nothing to review</p>
        </div>
      )}

      <div className="space-y-3 max-w-2xl">
        {justifications?.map((j) => (
          <JustificationCard key={j.id} justification={j} />
        ))}
      </div>
    </div>
  );
}
