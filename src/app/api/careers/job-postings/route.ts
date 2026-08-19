import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchJobPostingOptions } from "@/lib/careers/jobPostingOptions";

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const options = await fetchJobPostingOptions(supabaseAdmin);
    return NextResponse.json({ success: true, data: options });
  } catch (err) {
    console.error("[GET /api/careers/job-postings]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
