"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";

// 5-minute increments, 30-60 minutes.
const DURATION_OPTIONS = [30, 35, 40, 45, 50, 55, 60];

export type PostingOverviewRow = { label: string; value: string };

type Props = {
  postingId: string;
  /** Read-only summary of this posting's own org-structure fields — Position, Sites, Business units, Departments/divisions, Sections, Grade levels, Employment Type (Salary, Salary Band, and Age are deliberately left out). */
  overview: PostingOverviewRow[];
  initialDescription?: string | null;
  initialPanelMembers?: string | null;
  initialDurationMinutes?: number | null;
  readOnly?: boolean;
  /** Called after a successful save — the caller returns to the postings table. */
  onDone: () => void;
};

export default function PostingInterviewSetup({
  postingId,
  overview,
  initialDescription,
  initialPanelMembers,
  initialDurationMinutes,
  readOnly = false,
  onDone,
}: Props) {
  const [description, setDescription] = useState(initialDescription ?? "");
  const [panelMembers, setPanelMembers] = useState(initialPanelMembers ?? "");
  const [durationMinutes, setDurationMinutes] = useState<number | "">(
    initialDurationMinutes ?? "",
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      return api.patch(`/careers/postings/${postingId}`, {
        interview_description: description.trim(),
        interview_panel_members: panelMembers.trim(),
        interview_duration_minutes: durationMinutes === "" ? null : durationMinutes,
      });
    },
    onSuccess: () => {
      toast.success("Interview setup saved.");
      onDone();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save interview setup.");
    },
  });

  return (
    <div className="space-y-4">
      {overview.length > 0 && (
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Overview
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-gray-600">
            {overview.map((row) => (
              <p key={row.label}>
                {row.label}: <span className="font-medium text-gray-800">{row.value}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-xs font-medium text-gray-600">Description</span>
        <textarea
          className="w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 mt-1 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:text-gray-500"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={readOnly}
          placeholder="Describe what this interview will cover…"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-gray-600">Recommended panel members</span>
        <textarea
          className="w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 mt-1 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:text-gray-500"
          rows={2}
          value={panelMembers}
          onChange={(e) => setPanelMembers(e.target.value)}
          disabled={readOnly}
          placeholder="e.g. Herd Supervisor (chair), Breeding Farm Manager, Veterinarian"
        />
      </label>

      <label className="block max-w-xs">
        <span className="text-xs font-medium text-gray-600">Approximate duration</span>
        <select
          className="w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 mt-1 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:text-gray-500"
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value ? Number(e.target.value) : "")}
          disabled={readOnly}
        >
          <option value="">Select duration…</option>
          {DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minutes
            </option>
          ))}
        </select>
      </label>

      {!readOnly && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save and return to postings
          </button>
        </div>
      )}
    </div>
  );
}
