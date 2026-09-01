"use client";

import { useState } from "react";
import { useAppNavigation } from "@/lib/navigation/appNavigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { User } from "@/types";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { TableSkeleton } from "@/components/skeletons/PageSkeletons";
import { getJustificationStatusDef, resolveNavIcon } from "@/lib/moduleRegistry";

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function periodLabel(j: Justification) {
  const appraisal = j.appraisals;
  if (!appraisal) return "—";
  const quarter =
    appraisal.review_quarter === "Q4"
      ? "Annual"
      : appraisal.review_quarter;
  return `${quarter} ${appraisal.review_year}`;
}

function StatusPill({ status }: { status: Justification["status"] }) {
  const def = getJustificationStatusDef(status);
  const Icon = resolveNavIcon(def.iconKey);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${def.badgeClass}`}
    >
      <Icon className="w-3.5 h-3.5" /> {def.label}
    </span>
  );
}

function ReviewModal({
  justification,
  reviewerId,
  onClose,
}: {
  justification: Justification;
  reviewerId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const appraisal = justification.appraisals;

  const { mutate, isPending } = useMutation({
    mutationFn: async (decision: "approved" | "rejected") => {
      const res = await api.patch(`/appraisal/justification/${justification.id}`, {
        decision,
        reviewer_id: reviewerId,
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
      onClose();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Failed to record decision.");
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-base font-bold text-gray-900">Review justification</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {appraisal?.employee_name ?? "Unknown employee"} · {periodLabel(justification)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 mb-5">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Employee
            </p>
            <p className="text-sm font-medium text-gray-900">
              {appraisal?.employee_name ?? "Unknown employee"}
            </p>
            <p className="text-xs text-gray-500">{appraisal?.job_title ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Reason given
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {justification.reason_text}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Submitted
            </p>
            <p className="text-sm text-gray-600">{formatDateTime(justification.created_at)}</p>
          </div>
        </div>

        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Review notes (optional)
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes to share with the supervisor or employee..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300 mb-4"
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => mutate("approved")}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Approve (waive deduction)
          </button>
          <button
            type="button"
            onClick={() => mutate("rejected")}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4" /> Reject (deduction stands)
          </button>
        </div>
      </div>
    </div>
  );
}

function JustificationMobileRow({
  justification,
  onReview,
}: {
  justification: Justification;
  onReview: () => void;
}) {
  const appraisal = justification.appraisals;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">
            {appraisal?.employee_name ?? "Unknown employee"}
          </p>
          <p className="text-xs text-gray-400 truncate">{appraisal?.job_title ?? "—"}</p>
        </div>
        <StatusPill status={justification.status} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-gray-400">Period</p>
          <p className="font-medium text-gray-700 mt-0.5">{periodLabel(justification)}</p>
        </div>
        <div>
          <p className="text-gray-400">Submitted</p>
          <p className="font-medium text-gray-700 mt-0.5">
            {formatDate(justification.created_at)}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-600 line-clamp-2">{justification.reason_text}</p>

      {justification.status === "pending" ? (
        <button
          type="button"
          onClick={onReview}
          className="w-full py-2 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition font-medium"
        >
          Review
        </button>
      ) : (
        <p className="text-xs text-gray-500">
          Reviewed by <strong>{justification.reviewed_by_name ?? "—"}</strong>
          {justification.reviewed_at ? ` · ${formatDate(justification.reviewed_at)}` : ""}
          {justification.review_notes ? ` — ${justification.review_notes}` : ""}
        </p>
      )}
    </div>
  );
}

export default function JustificationsInboxPage() {
  const { goBack } = useAppNavigation();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "">("pending");
  const [selected, setSelected] = useState<Justification | null>(null);

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
  const reviewerId = session?.user?.id ?? "";

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

  const pendingCount =
    filter === "pending" ? (justifications?.length ?? 0) : 0;

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
    <div className="p-4 md:p-6 min-h-screen bg-gray-50">
      <button
        type="button"
        onClick={() => goBack("/dashboard/humanCapital/appraisal")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-6"
      >
        ← Back
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-500" />
            Appraisal Justifications
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Review why a supervisor missed an evaluation deadline and decide
            whether the 10-point deduction should be waived.
          </p>
        </div>
        {filter === "pending" && pendingCount > 0 && (
          <span className="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full text-xs font-medium">
            {pendingCount} pending
          </span>
        )}
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {(["pending", "approved", "rejected", ""] as const).map((f) => (
          <button
            key={f || "all"}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition border ${
              filter === f
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
            }`}
          >
            {f === "" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-3"
            >
              <div className="h-4 bg-gray-100 rounded w-1/2" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-full" />
            </div>
          ))
        ) : (justifications?.length ?? 0) === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
            <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Nothing to review</p>
          </div>
        ) : (
          justifications?.map((j) => (
            <JustificationMobileRow
              key={j.id}
              justification={j}
              onReview={() => setSelected(j)}
            />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
        {isLoading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 font-semibold text-gray-600">Employee</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Period</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Reason</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Submitted</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Review</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(justifications?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">Nothing to review</p>
                  </td>
                </tr>
              ) : (
                justifications?.map((j) => {
                  const appraisal = j.appraisals;
                  return (
                    <tr
                      key={j.id}
                      className="border-b border-gray-100 hover:bg-gray-50 align-top"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {appraisal?.employee_name ?? "Unknown employee"}
                        </p>
                        <p className="text-xs text-gray-400">{appraisal?.job_title ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {periodLabel(j)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[260px]">
                        <p className="line-clamp-3 whitespace-pre-wrap">{j.reason_text}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(j.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={j.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px]">
                        {j.status === "pending" ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <>
                            <p className="font-medium text-gray-700">
                              {j.reviewed_by_name ?? "—"}
                            </p>
                            {j.reviewed_at && (
                              <p className="text-gray-400 mt-0.5">{formatDate(j.reviewed_at)}</p>
                            )}
                            {j.review_notes && (
                              <p className="text-gray-500 mt-1 line-clamp-2">{j.review_notes}</p>
                            )}
                            <p className="text-gray-400 mt-1">
                              Deduction {j.points_waived ? "waived" : "stands"}
                            </p>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {j.status === "pending" ? (
                          <button
                            type="button"
                            onClick={() => setSelected(j)}
                            className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition font-medium"
                          >
                            Review
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">Completed</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {selected && reviewerId && (
        <ReviewModal
          justification={selected}
          reviewerId={reviewerId}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
