"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import api from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Hourglass, Loader2, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type: string;
  reason: string | null;
  start_date: string;
  end_date: string;
  total_days: number;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  users: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    role: string;
  };
}

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  approved: "bg-green-50 text-green-700 border border-green-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
};

const reviewSchema = z.object({
  admin_note: z.string().optional(),
});
type ReviewFormValues = z.infer<typeof reviewSchema>;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function reviewStampLabel(r: LeaveRequest): string | null {
  if (r.status === "pending" || !r.reviewed_at) return null;
  const verb = r.status === "approved" ? "Approved" : "Rejected";
  const who = r.reviewed_by_name ? ` by ${r.reviewed_by_name}` : "";
  return `${verb}${who} · ${formatDate(r.reviewed_at)}`;
}

// ─── Review Modal ─────────────────────────────────────────────────────────────
function ReviewModal({
  request,
  adminId,
  onClose,
  onSuccess,
}: {
  request: LeaveRequest;
  adminId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pendingStatus, setPendingStatus] = useState<
    "approved" | "rejected" | null
  >(null);

  const { register, handleSubmit } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { admin_note: "" },
  });

  const mutation = useMutation({
    mutationFn: (payload: {
      leave_id: string;
      status: "approved" | "rejected";
      admin_note: string | null;
      reviewed_by: string;
    }) => api.patch("/leave/review", payload),
    onSuccess: (_, variables) => {
      toast.success(`Leave request ${variables.status}.`);
      onSuccess();
      onClose();
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.error ?? "Server error. Please try again.",
      );
    },
  });

  const onSubmit = (data: ReviewFormValues) => {
    if (!pendingStatus) return;
    mutation.mutate({
      leave_id: request.id,
      status: pendingStatus,
      admin_note: data.admin_note || null,
      reviewed_by: adminId,
    });
  };

  const employeeName = request.users.first_name
    ? `${request.users.first_name} ${request.users.last_name ?? ""}`
    : request.users.email;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Review Leave Request
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{employeeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Leave Type</span>
            <span className="font-medium text-gray-900">
              {request.leave_type}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">From</span>
            <span className="font-medium text-gray-900">
              {formatDate(request.start_date)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">To</span>
            <span className="font-medium text-gray-900">
              {formatDate(request.end_date)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total Days</span>
            <span className="font-medium text-gray-900">
              {request.total_days} working days
            </span>
          </div>
          {request.reason && (
            <div className="flex justify-between gap-4">
              <span className="text-gray-500 flex-shrink-0">Reason</span>
              <span className="font-medium text-gray-900 text-right">
                {request.reason}
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Note to employee <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Add a note for the employee..."
              {...register("admin_note")}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={mutation.isPending}
              onClick={() => setPendingStatus("rejected")}
              className="flex-1 border border-red-200 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {mutation.isPending && pendingStatus === "rejected" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Reject
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              onClick={() => setPendingStatus("approved")}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {mutation.isPending && pendingStatus === "approved" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Approve
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Mobile Leave Card ────────────────────────────────────────────────────────
function LeaveCard({
  r,
  onReview,
}: {
  r: LeaveRequest;
  onReview: (r: LeaveRequest) => void;
}) {
  const employeeName = r.users.first_name
    ? `${r.users.first_name} ${r.users.last_name ?? ""}`
    : r.users.email;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900 text-sm">{employeeName}</p>
          <p className="text-xs text-gray-400">{r.users.email}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize flex-shrink-0 ${STATUS_STYLES[r.status]}`}
        >
          {r.status === "pending" && <Hourglass className="w-3 h-3" />}
          {r.status === "approved" && <CheckCircle2 className="w-3 h-3" />}
          {r.status === "rejected" && <XCircle className="w-3 h-3" />}
          {r.status}
        </span>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-gray-400">Leave Type</p>
          <p className="font-medium text-gray-700 mt-0.5">{r.leave_type}</p>
        </div>
        <div>
          <p className="text-gray-400">Days</p>
          <p className="font-medium text-gray-700 mt-0.5">{r.total_days}d</p>
        </div>
        <div>
          <p className="text-gray-400">From</p>
          <p className="font-medium text-gray-700 mt-0.5">
            {formatDate(r.start_date)}
          </p>
        </div>
        <div>
          <p className="text-gray-400">To</p>
          <p className="font-medium text-gray-700 mt-0.5">
            {formatDate(r.end_date)}
          </p>
        </div>
        {r.reason && (
          <div className="col-span-2">
            <p className="text-gray-400">Reason</p>
            <p className="font-medium text-gray-700 mt-0.5">{r.reason}</p>
          </div>
        )}
        {r.admin_note && r.status !== "pending" && (
          <div className="col-span-2">
            <p className="text-gray-400">Note</p>
            <p className="font-medium text-gray-700 mt-0.5">{r.admin_note}</p>
          </div>
        )}
      </div>

      {reviewStampLabel(r) && (
        <p
          className={`text-xs font-medium ${
            r.status === "approved" ? "text-green-600" : "text-red-600"
          }`}
        >
          {reviewStampLabel(r)}
        </p>
      )}

      {/* Action */}
      {r.status === "pending" && (
        <button
          onClick={() => onReview(r)}
          className="w-full py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition"
        >
          Review
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LeaveRequestsAdminPage() {
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(
    null,
  );
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("pending");
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const adminId = session?.user?.id ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["all_leave"],
    queryFn: async () => {
      const res = await api.get("/leave/all");
      return res.data.data as LeaveRequest[];
    },
  });

  const filtered = (data ?? []).filter((r) =>
    filter === "all" ? true : r.status === filter,
  );

  const pendingCount = (data ?? []).filter(
    (r) => r.status === "pending",
  ).length;

  return (
    <div className="p-4 md:p-6 bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Leave Requests</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Review and manage employee leave
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full text-xs font-medium">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {(["pending", "all", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition border capitalize ${
              filter === f
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* ── Mobile: cards | Desktop: table ── */}

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-3"
            >
              <div className="h-4 bg-gray-100 rounded w-1/2" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            No {filter === "all" ? "" : filter} leave requests found.
          </div>
        ) : (
          filtered.map((r) => (
            <LeaveCard key={r.id} r={r} onReview={setSelectedRequest} />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600">
                Employee
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">Type</th>
              <th className="px-4 py-3 font-semibold text-gray-600">From</th>
              <th className="px-4 py-3 font-semibold text-gray-600">To</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Days</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Reason</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i} className="border-b border-gray-100 animate-pulse">
                  {[...Array(8)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  No {filter === "all" ? "" : filter} leave requests found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const employeeName = r.users.first_name
                  ? `${r.users.first_name} ${r.users.last_name ?? ""}`
                  : r.users.email;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {employeeName}
                      </p>
                      <p className="text-xs text-gray-400">{r.users.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.leave_type}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(r.start_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(r.end_date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-700">
                      {r.total_days}d
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[140px] truncate">
                      {r.reason ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[r.status]}`}
                      >
                        {r.status === "pending" && (
                          <Hourglass className="w-3 h-3" />
                        )}
                        {r.status === "approved" && (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        {r.status === "rejected" && (
                          <XCircle className="w-3 h-3" />
                        )}
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "pending" ? (
                        <button
                          onClick={() => setSelectedRequest(r)}
                          className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition font-medium"
                        >
                          Review
                        </button>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span
                            className={`text-xs font-medium ${
                              r.status === "approved"
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {reviewStampLabel(r)}
                          </span>
                          {r.admin_note && (
                            <span className="text-xs text-gray-400 max-w-[160px] truncate">
                              {r.admin_note}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Review modal ── */}
      {selectedRequest && (
        <ReviewModal
          request={selectedRequest}
          adminId={adminId}
          onClose={() => setSelectedRequest(null)}
          onSuccess={() =>
            queryClient.invalidateQueries({ queryKey: ["all_leave"] })
          }
        />
      )}
    </div>
  );
}
