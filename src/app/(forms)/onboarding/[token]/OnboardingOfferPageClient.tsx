"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
};

export default function OnboardingOfferPageClient({ token, application }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const response = searchParams.get("response");
  const [status, setStatus] = useState<
    "confirm_decline" | "loading" | "accepted" | "declined" | "error"
  >(() => {
    if (response === "decline") return "confirm_decline";
    if (response === "accept") return "loading";
    return "error";
  });
  const [error, setError] = useState<string | null>(
    response === "accept" || response === "decline"
      ? null
      : "Invalid link. Use Accept offer or Decline offer from your email.",
  );

  const submitResponse = async (apiResponse: "accepted" | "declined") => {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(`/api/careers/onboarding/${token}/offer-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: apiResponse }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Could not save your response.");
      }
      setStatus(apiResponse);
      if (apiResponse === "accepted") {
        setTimeout(() => router.replace(`/onboarding/${token}?start=1`), 800);
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  useEffect(() => {
    if (response === "accept") {
      void submitResponse("accepted");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response, token]);

  if (status === "confirm_decline") {
    return (
      <>
        <FormShell eyebrow="Wills Farms Ltd." title="Decline offer">
          <p className="text-sm text-gray-600 text-center py-6">
            Please confirm that you want to decline your offer for{" "}
            <strong>{application.role_title}</strong>.
          </p>
        </FormShell>
        <DeclineOfferConfirmModal
          open
          roleTitle={application.role_title}
          onCancel={() => router.replace(`/onboarding/${token}`)}
          onConfirm={() => void submitResponse("declined")}
        />
      </>
    );
  }

  if (status === "loading") {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Saving your response">
        <p className="text-sm text-gray-500 flex items-center justify-center gap-2 py-10">
          <Loader2 className="w-4 h-4 animate-spin" />
          Please wait…
        </p>
      </FormShell>
    );
  }

  if (status === "accepted") {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Offer accepted">
        <div className="text-center py-8 space-y-4">
          <p className="text-sm text-gray-600">
            Thank you for accepting the offer for{" "}
            <strong>{application.role_title}</strong>. Taking you to onboarding…
          </p>
        </div>
      </FormShell>
    );
  }

  if (status === "declined") {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Offer declined">
        <div className="text-center py-8 space-y-4">
          <p className="text-sm text-gray-600">
            You have declined the offer for{" "}
            <strong>{application.role_title}</strong>. Our HR team has been notified.
          </p>
          <p className="text-xs text-gray-500">
            Contact{" "}
            <a href="mailto:info@willsfarms.com" className="text-red-600 hover:underline">
              info@willsfarms.com
            </a>{" "}
            if this was a mistake.
          </p>
        </div>
      </FormShell>
    );
  }

  return (
    <FormShell eyebrow="Wills Farms Ltd." title="Offer response">
      <p className="text-sm text-gray-600 text-center py-10">
        {error ?? "Something went wrong."}
      </p>
    </FormShell>
  );
}
