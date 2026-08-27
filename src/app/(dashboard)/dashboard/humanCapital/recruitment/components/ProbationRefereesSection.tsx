"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { RefereeReferenceFormData } from "@/lib/careers/refereeReferenceTypes";
import RefereeReferenceDetailModal from "./RefereeReferenceDetailModal";

type RefereeRow = {
  referee_index: number;
  referee_name: string;
  referee_email: string;
  relationship: string;
  phone: string;
  invite_sent_at: string | null;
  submitted_at: string | null;
  form_data: Record<string, unknown>;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Accra",
  });
}

export default function ProbationRefereesSection({
  userId,
  applicationId,
}: {
  userId: string;
  applicationId: string | null;
}) {
  const queryClient = useQueryClient();
  const [viewReferee, setViewReferee] = useState<RefereeRow | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["hr-reference", applicationId],
    queryFn: async () => {
      const res = await api.get("/careers/onboarding/hr-reference", {
        params: { application_id: applicationId },
      });
      return res.data.data as { referees: RefereeRow[] };
    },
    enabled: Boolean(applicationId),
  });

  const sendInvites = useMutation({
    mutationFn: () =>
      api.post("/careers/employees/referee-invites", { user_id: userId }),
    onSuccess: (res) => {
      toast.success(res.data.message ?? "Referee emails sent.");
      queryClient.invalidateQueries({ queryKey: ["hr-reference", applicationId] });
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast.error(e?.response?.data?.error ?? "Could not send referee emails.");
    },
  });

  if (!applicationId) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-900">
        No linked job application — referee emails cannot be sent for this employee.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading referees…
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-red-600">Could not load referee status.</p>
    );
  }

  const referees = data?.referees ?? [];

  if (referees.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No referees with valid emails were found on this employee&apos;s job application.
      </div>
    );
  }

  const anyInviteSent = referees.some((r) => r.invite_sent_at);
  const allSubmitted = referees.every((r) => r.submitted_at);

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">Referee references</p>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            Referees from the job application. Send them a link to complete their
            confidential reference. Mark the employee <strong>Permanent</strong> once
            references are in and probation is complete.
          </p>
        </div>

        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
          {referees.map((ref) => {
            const submitted = Boolean(ref.submitted_at);
            const invited = Boolean(ref.invite_sent_at);

            return (
              <li
                key={ref.referee_index}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-3 bg-gray-50/50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    Referee {ref.referee_index}: {ref.referee_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {ref.relationship ? `${ref.relationship} · ` : ""}
                    {ref.referee_email}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      submitted
                        ? "bg-green-100 text-green-800"
                        : invited
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {submitted
                      ? `Submitted${formatDate(ref.submitted_at) ? ` · ${formatDate(ref.submitted_at)}` : ""}`
                      : invited
                        ? `Invited${formatDate(ref.invite_sent_at) ? ` · ${formatDate(ref.invite_sent_at)}` : ""}`
                        : "Not sent"}
                  </span>
                  {submitted && (
                    <button
                      type="button"
                      onClick={() => setViewReferee(ref)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      View reference
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => sendInvites.mutate()}
          disabled={sendInvites.isPending || allSubmitted}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 bg-white border border-gray-200 text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60"
        >
          {sendInvites.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Mail className="w-4 h-4" />
          )}
          {sendInvites.isPending
            ? "Sending…"
            : allSubmitted
              ? "All referees submitted"
              : anyInviteSent
                ? "Resend referee emails"
                : "Send referee emails"}
        </button>

        {anyInviteSent && !allSubmitted && (
          <p className="text-[11px] text-gray-500">
            Already invited referees who have not submitted yet will receive a fresh link.
            Completed references are skipped.
          </p>
        )}
      </div>

      {viewReferee && (
        <RefereeReferenceDetailModal
          refereeName={viewReferee.referee_name}
          refereeIndex={viewReferee.referee_index}
          submittedAt={viewReferee.submitted_at}
          formData={viewReferee.form_data as RefereeReferenceFormData}
          onClose={() => setViewReferee(null)}
        />
      )}
    </>
  );
}
