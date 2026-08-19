import { notFound } from "next/navigation";
import JobApplicationWizard from "@/app/(forms)/apply/[postingId]/JobApplicationWizard";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchApplicationFormFields } from "@/lib/careers/getApplicationFormFields";
import { isPostingPublic, type JobPosting } from "@/lib/careers/jobPostings";
import type { ApplicationFormData } from "@/lib/careers/applicationFormSchema";

type PageProps = { params: Promise<{ token: string }> };

export default async function ApplyDraftPage({ params }: PageProps) {
  const { token } = await params;
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return (
      <div className="max-w-lg mx-auto py-20 px-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Service unavailable</h1>
      </div>
    );
  }

  const { data: draft, error } = await supabaseAdmin
    .from("job_applications")
    .select("*, job_postings(*)")
    .eq("draft_token", token)
    .eq("submission_status", "draft")
    .maybeSingle();

  if (error || !draft?.job_postings) {
    notFound();
  }

  const posting = draft.job_postings as JobPosting;
  if (!isPostingPublic(posting)) {
    return (
      <div className="max-w-lg mx-auto py-20 px-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Posting closed</h1>
        <p className="text-sm text-gray-600 mt-3">
          This job is no longer accepting applications.
        </p>
      </div>
    );
  }

  const fields = await fetchApplicationFormFields(supabaseAdmin);

  return (
    <JobApplicationWizard
      posting={posting}
      fields={fields}
      initialValues={(draft.application_form_data ?? {}) as ApplicationFormData}
      draftToken={token}
    />
  );
}
