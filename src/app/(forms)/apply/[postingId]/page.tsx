import { notFound } from "next/navigation";
import JobApplicationWizard from "./JobApplicationWizard";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchApplicationFormContext } from "@/lib/careers/getApplicationFormFields";
import { stepLabelFor } from "@/lib/systemDefinitions/applicationFormConfig";
import { isPostingPublic, type JobPosting } from "@/lib/careers/jobPostings";

// Always fetch the posting and form fields fresh — this page has no
// generateStaticParams, so Next would otherwise cache the first render of
// each posting indefinitely and keep serving it after job postings or
// application-form settings (e.g. referee fields) change in the database.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ postingId: string }> };

export default async function ApplyPage({ params }: PageProps) {
  const { postingId } = await params;
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return (
      <div className="max-w-lg mx-auto py-20 px-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Service unavailable</h1>
        <p className="text-sm text-gray-600 mt-3">Please try again later.</p>
      </div>
    );
  }

  const { data: posting, error } = await supabaseAdmin
    .from("job_postings")
    .select("*")
    .eq("id", postingId)
    .maybeSingle();

  if (error || !posting || !isPostingPublic(posting as JobPosting)) {
    notFound();
  }

  const formContext = await fetchApplicationFormContext(supabaseAdmin);
  const stepLabels = Object.fromEntries(
    formContext.steps.map((stepId) => [stepId, stepLabelFor(stepId, formContext.config)]),
  );

  return (
    <JobApplicationWizard
      posting={posting as JobPosting}
      fields={formContext.fields}
      steps={formContext.steps}
      stepLabels={stepLabels}
      formConfig={formContext.config}
    />
  );
}
