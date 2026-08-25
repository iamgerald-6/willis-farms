import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  formatPublicJobTitle,
  isPostingPublic,
  JOB_POSTING_CONTENT_SECTIONS,
  type JobPosting,
} from "@/lib/careers/jobPostings";
import { SectionText } from "@/components/SectionText";

type PageProps = { params: Promise<{ postingId: string }> };

export default async function JobPostingDetailsPage({ params }: PageProps) {
  const { postingId } = await params;
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-gray-900">Service unavailable</h1>
        <p className="mt-3 text-sm text-gray-600">Please try again later.</p>
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

  const job = posting as JobPosting;
  const sections = JOB_POSTING_CONTENT_SECTIONS.filter((section) =>
    (job[section.key] as string | undefined)?.trim(),
  );

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link
          href="/careers"
          className="inline-flex items-center gap-1.5 text-sm text-brand-gray hover:text-brand-red"
        >
          <ArrowLeft className="h-4 w-4" /> Back to job openings
        </Link>

        <h1 className="mt-6 text-2xl font-extrabold text-brand-dark sm:text-3xl">
          {formatPublicJobTitle(job.title)}
        </h1>
        <p className="mt-2 text-sm text-brand-gray">
          {job.location} · {job.employment_type}
        </p>

        {job.description && (
          <p className="mt-6 text-sm leading-relaxed text-brand-gray text-justify">
            {job.description}
          </p>
        )}

        {sections.length > 0 && (
          <div className="mt-10 space-y-8">
            {sections.map((section) => (
              <div key={section.key}>
                <h2 className="text-base font-bold text-brand-dark">{section.label}</h2>
                <div className="mt-3">
                  <SectionText text={job[section.key] as string} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 border-t border-black/5 pt-8">
          <Link
            href={`/apply/${job.id}`}
            className="inline-flex rounded-2xl bg-brand-red px-6 py-3 text-sm font-semibold text-white shadow-soft hover:opacity-90"
          >
            Apply now
          </Link>
        </div>
      </div>
    </div>
  );
}
