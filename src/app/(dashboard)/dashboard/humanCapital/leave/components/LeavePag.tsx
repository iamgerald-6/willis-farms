"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import api from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  XCircle,
  Hourglass,
  Plus,
  X,
  Loader2,
} from "lucide-react";

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
}

interface LeaveBalance {
  total: number;
  used: number;
  remaining: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const LEAVE_TYPES = [
  "Annual",
  "Sick",
  "Emergency",
  "Maternity/Paternity",
  "Unpaid",
  "Other",
] as const;

const STATUS_STYLES = {
  pending: {
    bg: "bg-amber-50 text-amber-700 border border-amber-200",
    icon: <Hourglass className="w-3.5 h-3.5" />,
    label: "Pending",
  },
  approved: {
    bg: "bg-green-50 text-green-700 border border-green-200",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    label: "Approved",
  },
  rejected: {
    bg: "bg-red-50 text-red-700 border border-red-200",
    icon: <XCircle className="w-3.5 h-3.5" />,
    label: "Rejected",
  },
};

// ─── Schema ───────────────────────────────────────────────────────────────────
const leaveSchema = z
  .object({
    leave_type: z.enum(LEAVE_TYPES, {
      error: "Leave type is required",
    }),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
    reason: z.string().optional(),
  })
  .refine((d) => new Date(d.start_date) <= new Date(d.end_date), {
    message: "End date must be after start date",
    path: ["end_date"],
  })
  .refine(
    (d) => {
      if (d.leave_type === "Other")
        return !!d.reason && d.reason.trim().length > 0;
      return true;
    },
    { message: "Reason is required for Other leave type", path: ["reason"] }
  );

type LeaveFormValues = z.infer<typeof leaveSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcWorkingDays(start: string, end: string): number {
  if (!start || !end) return 0;
  let count = 0;
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function inputCls(hasError?: boolean) {
  return [
    "w-full border rounded-lg px-3 py-2 text-sm transition",
    "focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent",
    hasError ? "border-red-300 bg-red-50" : "border-gray-200 bg-white",
  ].join(" ");
}

// ─── Apply Leave Modal ────────────────────────────────────────────────────────
function ApplyLeaveModal({
  userId,
  onClose,
  onSuccess,
}: {
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<LeaveFormValues>({
    resolver: zodResolver(leaveSchema),
  });

  const startDate = watch("start_date");
  const endDate = watch("end_date");
  const leaveType = watch("leave_type");
  const totalDays = calcWorkingDays(startDate, endDate);

  // ── useMutation for POST ───────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (payload: {
      user_id: string;
      leave_type: string;
      reason: string | null;
      start_date: string;
      end_date: string;
      total_days: number;
    }) => api.post("/leave/apply", payload),
    onSuccess: () => {
      toast.success("Leave request submitted successfully!");
      reset();
      onSuccess();
      onClose();
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.error ?? "Server error. Please try again."
      );
    },
  });

  const onSubmit = (data: LeaveFormValues) => {
    if (totalDays < 1) {
      toast.error("Please select a valid date range.");
      return;
    }
    mutation.mutate({
      user_id: userId,
      leave_type: data.leave_type,
      reason: data.reason || null,
      start_date: data.start_date,
      end_date: data.end_date,
      total_days: totalDays,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Apply for Leave
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Fill in the details below
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Leave type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Leave Type <span className="text-red-500">*</span>
            </label>
            <select
              {...register("leave_type")}
              className={inputCls(!!errors.leave_type)}
            >
              <option value="">Select leave type</option>
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {errors.leave_type && (
              <p className="text-xs text-red-500 mt-1">
                {errors.leave_type.message}
              </p>
            )}
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                min={new Date().toISOString().split("T")[0]}
                {...register("start_date")}
                className={inputCls(!!errors.start_date)}
              />
              {errors.start_date && (
                <p className="text-xs text-red-500 mt-1">
                  {errors.start_date.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                min={startDate || new Date().toISOString().split("T")[0]}
                {...register("end_date")}
                className={inputCls(!!errors.end_date)}
              />
              {errors.end_date && (
                <p className="text-xs text-red-500 mt-1">
                  {errors.end_date.message}
                </p>
              )}
            </div>
          </div>

          {/* Days calculated */}
          {totalDays > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-2.5 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-700 font-medium">
                {totalDays} working day{totalDays !== 1 ? "s" : ""} requested
              </p>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Reason{" "}
              {leaveType === "Other" ? (
                <span className="text-red-500">*</span>
              ) : (
                <span className="text-gray-400">(optional)</span>
              )}
            </label>
            <textarea
              rows={3}
              placeholder="Add any additional details..."
              {...register("reason")}
              className={`${inputCls(!!errors.reason)} resize-none`}
            />
            {errors.reason && (
              <p className="text-xs text-red-500 mt-1">
                {errors.reason.message}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LeavePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // ── Session ───────────────────────────────────────────────────────────────
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const userId = session?.user?.id;

  // ── Fetch leave data ──────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["my_leave", userId],
    queryFn: async () => {
      const res = await api.get(`/leave/my?user_id=${userId}`);
      return res.data as { data: LeaveRequest[]; balance: LeaveBalance };
    },
    enabled: !!userId,
  });

  const requests = data?.data ?? [];
  const balance = data?.balance ?? { total: 30, used: 0, remaining: 30 };
  const balancePct = Math.min((balance.used / balance.total) * 100, 100);

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Leave</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage your leave requests
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-red-600 text-white flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" /> Apply for Leave
        </button>
      </div>

      {/* ── Balance cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            <p className="text-xs text-gray-400 font-medium">Total Days</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{balance.total}</p>
          <p className="text-xs text-gray-400 mt-1">Annual allowance</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-red-400" />
            <p className="text-xs text-gray-400 font-medium">Days Used</p>
          </div>
          <p className="text-3xl font-bold text-red-600">{balance.used}</p>
          <p className="text-xs text-gray-400 mt-1">Approved this year</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <p className="text-xs text-gray-400 font-medium">Remaining</p>
          </div>
          <p className="text-3xl font-bold text-green-600">
            {balance.remaining}
          </p>
          <p className="text-xs text-gray-400 mt-1">Days left this year</p>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700">
            Annual Leave Usage
          </p>
          <p className="text-xs text-gray-400">
            {balance.used} of {balance.total} days
          </p>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${
              balancePct >= 90
                ? "bg-red-600"
                : balancePct >= 60
                ? "bg-amber-500"
                : "bg-green-500"
            }`}
            style={{ width: `${balancePct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {balance.remaining} working days remaining for{" "}
          {new Date().getFullYear()}
        </p>
      </div>

      {/* ── Leave history table ── */}
      <div className="overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600">Type</th>
              <th className="px-4 py-3 font-semibold text-gray-600">From</th>
              <th className="px-4 py-3 font-semibold text-gray-600">To</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Days</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Reason</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Admin Note
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="border-b border-gray-100 animate-pulse">
                  {[...Array(7)].map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : requests.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  No leave requests yet. Click <strong>Apply for Leave</strong>{" "}
                  to get started.
                </td>
              </tr>
            ) : (
              requests.map((r) => {
                const s = STATUS_STYLES[r.status];
                return (
                  <tr
                    key={r.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {r.leave_type}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(r.start_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(r.end_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">
                      {r.total_days}d
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">
                      {r.reason ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg}`}
                      >
                        {s.icon} {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate">
                      {r.admin_note ?? "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal ── */}
      {modalOpen && userId && (
        <ApplyLeaveModal
          userId={userId}
          onClose={() => setModalOpen(false)}
          onSuccess={() =>
            queryClient.invalidateQueries({ queryKey: ["my_leave"] })
          }
        />
      )}
    </div>
  );
}
