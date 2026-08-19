import CareersPageClient from "./CareersPageClient";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  isPostingPublic,
  syncExpiredPostings,
  type JobPosting,
} from "@/lib/careers/jobPostings";

export default async function CareersPage() {
  let postings: JobPosting[] = [];

  const supabaseAdmin = getSupabaseAdmin();
  if (supabaseAdmin) {
    await syncExpiredPostings(supabaseAdmin).catch(() => undefined);

    const { data } = await supabaseAdmin
      .from("job_postings")
      .select("*")
      .order("created_at", { ascending: false });

    postings = (data ?? []).filter((row) =>
      isPostingPublic(row as JobPosting),
    ) as JobPosting[];
  }

  return <CareersPageClient postings={postings} />;
}
