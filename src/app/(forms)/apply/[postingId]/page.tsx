import { notFound } from "next/navigation";
import JobApplicationWizard from "./JobApplicationWizard";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchApplicationFormFields } from "@/lib/careers/getApplicationFormFields";
import { isPostingPublic, type JobPosting } from "@/lib/careers/jobPostings";

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

  const fields = await fetchApplicationFormFields(supabaseAdmin);

  return (
    <JobApplicationWizard posting={posting as JobPosting} fields={fields} />
  );
}
