"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { FormShell } from "@/components/Forms/FormShell";
import DeclineOfferConfirmModal from "./DeclineOfferConfirmModal";

type Props = {
  token: string;
  application: {
    full_name: string;
    role_title: string;
    reference_number: string;
  };
  offerResponse: "pending" | "accepted" | "declined" | null;
  onAccepted: () => void;
};

export default function OfferResponseGate({
  token,
  application,
  offerResponse,
  onAccepted,
}: Props) {
  const [submitting, setSubmitting] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localResponse, setLocalResponse] = useState(offerResponse);
  const [showDeclineModal, setShowDeclineModal] = useState(false);

  const respond = async (response: "accepted" | "declined") => {
    setSubmitting(response === "accepted" ? "accept" : "decline");
    setError(null);
    try {
      const res = await fetch(`/api/careers/onboarding/${token}/offer-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Could not save your response.");
      }
      setLocalResponse(response);
      if (response === "accepted") {
        onAccepted();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(null);
    }
  };

  if (localResponse === "declined") {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Offer declined">
        <div className="text-center py-8 space-y-4">
          <p className="text-sm text-gray-600">
            You have declined the offer for{" "}
            <strong>{application.role_title}</strong> (ref{" "}
            {application.reference_number}). Thank you for letting us know.
          </p>
          <p className="text-xs text-gray-500">
            Our HR team has been notified. If this was a mistake, contact{" "}
            <a href="mailto:info@willsfarms.com" className="text-red-600 hover:underline">
              info@willsfarms.com
            </a>{" "}
            quoting your reference number.
          </p>
        </div>
      </FormShell>
    );
  }

  if (localResponse === "accepted") {
    return null;
  }

  return (
    <>
      <FormShell eyebrow="Wills Farms Ltd." title="Your job offer">
        <div className="space-y-6">
          <p className="text-sm text-gray-600">
            Dear {application.full_name.split(/\s+/)[0] || application.full_name},
            congratulations on your offer for{" "}
            <strong>{application.role_title}</strong> (ref {application.reference_number}).
          </p>
          <p className="text-sm text-gray-600">
            Please confirm whether you <strong>accept</strong> or <strong>decline</strong> this
            offer before starting onboarding.
          </p>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => void respond("accepted")}
              disabled={!!submitting}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 bg-green-700 text-white rounded-xl text-sm font-semibold hover:bg-green-800 disabled:opacity-60"
            >
              {submitting === "accept" && <Loader2 className="w-4 h-4 animate-spin" />}
              Accept offer
            </button>
            <button
              type="button"
              onClick={() => setShowDeclineModal(true)}
              disabled={!!submitting}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 border border-red-200 bg-red-50 text-red-700 rounded-xl text-sm font-semibold hover:bg-red-100 disabled:opacity-60"
            >
              Decline offer
            </button>
          </div>
        </div>
      </FormShell>

      <DeclineOfferConfirmModal
        open={showDeclineModal}
        roleTitle={application.role_title}
        confirming={submitting === "decline"}
        onCancel={() => setShowDeclineModal(false)}
        onConfirm={() => {
          setShowDeclineModal(false);
          void respond("declined");
        }}
      />
    </>
  );
}
