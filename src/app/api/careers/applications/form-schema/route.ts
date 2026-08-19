import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchApplicationFormFields } from "@/lib/careers/getApplicationFormFields";

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const fields = await fetchApplicationFormFields(supabaseAdmin);
    return NextResponse.json({ success: true, data: fields });
  } catch (err) {
    console.error("[GET /api/careers/applications/form-schema]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
