"use client";

import type { OnboardingFormData } from "@/lib/careers/onboardingTypes";

type Props = {
  formData: OnboardingFormData;
};

function formatYesNo(value: string | undefined): string | null {
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  return null;
}

function field(label: string, value: string | null | undefined) {
  if (!value?.trim()) return null;
  return { label, value: value.trim() };
}

export default function OnboardingProfileReview({ formData }: Props) {
  const personal = formData.personal ?? {};
  const emergency = formData.emergency ?? {};
  const nextOfKin = formData.next_of_kin ?? {};
  const payment = formData.payment ?? {};
  const medical = formData.medical ?? {};
  const bio = formData.biosecurity ?? {};
  const declarations = formData.declarations ?? {};

  const sections: { title: string; items: { label: string; value: string }[] }[] = [
    {
      title: "Personal details",
      items: [
        field("Middle name(s)", personal.middle_names),
        field("SSNIT number", personal.ssnit_number),
        field("Region", personal.region),
        field("Residential address", personal.residential_address),
        field("Ghana Post GPS", personal.gps_address),
      ].filter(Boolean) as { label: string; value: string }[],
    },
    {
      title: "Emergency contact",
      items: [
        field("Name", emergency.full_name),
        field("Relationship", emergency.relationship),
        field("Phone", emergency.phone),
        field("Address", emergency.address),
      ].filter(Boolean) as { label: string; value: string }[],
    },
    {
      title: "Next of kin",
      items: [
        field("Name", nextOfKin.full_name),
        field("Relationship", nextOfKin.relationship),
        field("Phone", nextOfKin.phone),
        field("Address", nextOfKin.address),
      ].filter(Boolean) as { label: string; value: string }[],
    },
    {
      title: "Payment details",
      items: [
        field("Payment method", payment.method),
        field("Bank name", payment.bank_name),
        field("Account name", payment.account_name),
        field("Account number", payment.account_number),
        field("Mobile money network", payment.momo_network),
        field("Mobile money registered name", payment.momo_registered_name),
        field("Mobile money number", payment.momo_number),
      ].filter(Boolean) as { label: string; value: string }[],
    },
    {
      title: "Medical",
      items: [
        field("Blood group", medical.blood_group),
        field("Allergies", medical.allergies),
        field("Medical conditions", medical.conditions),
      ].filter(Boolean) as { label: string; value: string }[],
    },
    {
      title: "Biosecurity",
      items: [
        field(
          "Household pigs or pig contact outside work",
          formatYesNo(bio.household_pigs),
        ),
        field(
          "Household member works at pig farm/market/slaughter",
          formatYesNo(bio.household_pig_work),
        ),
        field(
          "Visited another swine site in past 12 months",
          formatYesNo(bio.visited_swine_site_12m),
        ),
        field(
          "Travelled to ASF-affected region in past 30 days",
          formatYesNo(bio.asf_travel_30d),
        ),
        field("Biosecurity commitment", bio.commitment_initials ? "Yes" : null),
        field("Additional details", bio.details),
      ].filter(Boolean) as { label: string; value: string }[],
    },
    {
      title: "Consent & signature",
      items: [
        field("Data processing consent", declarations.data_consent ? "Yes" : null),
        field("Signature (typed name)", declarations.signature_name),
        field("Signature date", declarations.signature_date),
      ].filter(Boolean) as { label: string; value: string }[],
    },
  ].filter((section) => section.items.length > 0);

  if (sections.length === 0) {
    return (
      <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-4">
        No onboarding details on file yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.title} className="break-inside-avoid">
          <div className="border-b border-gray-200 pb-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {section.items.map((item) => (
              <div
                key={item.label}
                className={
                  item.label.includes("address") ||
                  item.label.includes("conditions") ||
                  item.label.includes("details")
                    ? "sm:col-span-2"
                    : ""
                }
              >
                <p className="text-xs text-gray-400">{item.label}</p>
                <p className="font-medium text-gray-900 mt-0.5 whitespace-pre-wrap">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
