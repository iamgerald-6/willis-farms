import MedicalExamWizard from "./MedicalExamWizard";
import type { MedicalFormResponses, MedicalFormSchema, MedicalReferralData } from "@/lib/medical/medicalFormSchema";

type PageProps = { params: Promise<{ token: string }> };

async function loadExamination(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/medical/${token}`, { cache: "no-store" });
  return res;
}

export default async function MedicalExamPage({ params }: PageProps) {
  const { token } = await params;
  const res = await loadExamination(token);

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-sm font-semibold text-gray-800">Link unavailable</p>
          <p className="text-xs text-gray-500 mt-2">{json.error ?? "This medical examination link is no longer valid."}</p>
        </div>
      </div>
    );
  }

  const json = await res.json();
  const { examination, read_only } = json.data as {
    examination: {
      form_schema: MedicalFormSchema;
      referral_data: MedicalReferralData;
      form_responses: MedicalFormResponses;
    };
    read_only: boolean;
  };

  return (
    <MedicalExamWizard
      token={token}
      initialSchema={examination.form_schema}
      initialResponses={examination.form_responses}
      initialReferral={examination.referral_data}
      readOnly={read_only}
    />
  );
}
