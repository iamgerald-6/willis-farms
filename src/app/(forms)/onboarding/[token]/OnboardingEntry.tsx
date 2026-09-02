"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import OnboardingWizard from "./OnboardingWizard";
import OfferResponseGate from "./OfferResponseGate";
import { FormShell } from "@/components/Forms/FormShell";
import type { OnboardingFlatValues, OnboardingFormField } from "@/lib/careers/onboardingFormSchema";

type ApplicationInfo = {
  full_name: string;
  email: string;
  phone: string;
  role_title: string;
  reference_number: string;
};

type Props = {
  token: string;
  application: ApplicationInfo;
  applicationFormData?: Record<string, unknown> | null;
  initialFlat: OnboardingFlatValues;
  fields: OnboardingFormField[];
  optionLists: Record<string, string[]>;
  expiresAt: string;
  offerResponse: "pending" | "accepted" | "declined" | null;
  /** From email "Start onboarding" or after Accept — skip the on-site gate. */
  autoStart?: boolean;
};

export default function OnboardingEntry(props: Props) {
  const [offerAccepted, setOfferAccepted] = useState(
    props.offerResponse === "accepted",
  );
  const [autoStarting, setAutoStarting] = useState(false);
  const [autoStartError, setAutoStartError] = useState<string | null>(null);

  const declined = props.offerResponse === "declined" && !offerAccepted;

  useEffect(() => {
    if (!props.autoStart || offerAccepted || declined || props.offerResponse === "declined") {
      return;
    }
    if (props.offerResponse === "accepted") {
      setOfferAccepted(true);
      return;
    }

    let cancelled = false;
    setAutoStarting(true);
    setAutoStartError(null);

    void (async () => {
      try {
        const res = await fetch(`/api/careers/onboarding/${props.token}/offer-response`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response: "accepted" }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? "Could not record your acceptance.");
        }
        if (!cancelled) setOfferAccepted(true);
      } catch (e) {
        if (!cancelled) {
          setAutoStartError(e instanceof Error ? e.message : "Something went wrong.");
        }
      } finally {
        if (!cancelled) setAutoStarting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.autoStart, props.token, props.offerResponse, offerAccepted, declined]);

  if (declined) {
    return (
      <OfferResponseGate
        token={props.token}
        application={props.application}
        offerResponse="declined"
        onAccepted={() => setOfferAccepted(true)}
      />
    );
  }

  if (autoStarting) {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Starting onboarding">
        <p className="text-sm text-gray-500 flex items-center justify-center gap-2 py-10">
          <Loader2 className="w-4 h-4 animate-spin" />
          Please wait…
        </p>
      </FormShell>
    );
  }

  if (autoStartError) {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Could not start onboarding">
        <p className="text-sm text-red-600 text-center py-6">{autoStartError}</p>
      </FormShell>
    );
  }

  if (!offerAccepted && !props.autoStart) {
    return (
      <OfferResponseGate
        token={props.token}
        application={props.application}
        offerResponse={props.offerResponse ?? "pending"}
        onAccepted={() => setOfferAccepted(true)}
      />
    );
  }

  if (!offerAccepted) {
    return (
      <FormShell eyebrow="Wills Farms Ltd." title="Starting onboarding">
        <p className="text-sm text-gray-500 flex items-center justify-center gap-2 py-10">
          <Loader2 className="w-4 h-4 animate-spin" />
          Please wait…
        </p>
      </FormShell>
    );
  }

  return <OnboardingWizard {...props} />;
}
