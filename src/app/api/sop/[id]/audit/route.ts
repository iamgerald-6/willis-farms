// app/api/sop/[id]/audit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, jsonUnauthorized, jsonForbidden } from "@/lib/apiRequestAuth";
import { assertSiteAccess, getAuthorizedSiteIds } from "@/lib/siteAccess";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Same bar as the SOP list itself (get_content) — any authenticated
  // employee can view a document's history. This previously had no auth
  // check at all.
  const caller = await requireAuth(req);
  if (!caller) return jsonUnauthorized();

  const { id } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // A SITE-scoped caller can only view the history of content that's
  // untagged (visible to everyone) or tagged to their own site — same rule
  // as the SOP list itself.
  if (getAuthorizedSiteIds(caller).scope !== "ALL_SITES") {
    const { data: existingTags } = await supabase
      .from("content_sites")
      .select("site_id")
      .eq("content_id", id);
    const tags = (existingTags ?? []).map((r) => r.site_id);
    const allowed = tags.length === 0 || tags.some((t) => assertSiteAccess(caller, t));
    if (!allowed) {
      return jsonForbidden("Forbidden — this content isn't tagged to a site you have access to.");
    }
  }

  const { data, error } = await supabase
    .from("sop_audit_log")
    .select("*")
    .eq("content_id", id)
    .order("performed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [] });
}
