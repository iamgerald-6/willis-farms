import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, jsonUnauthorized, jsonForbidden } from "@/lib/apiRequestAuth";
import { assertSiteAccess, getAuthorizedSiteIds } from "@/lib/siteAccess";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Params = {
  id: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    // Same bar as the SOP list itself — any authenticated employee can
    // read a single document. This previously had no auth check at all.
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "ID parameter missing" },
        { status: 400 }
      );
    }

    // A SITE-scoped caller can only read content that's untagged (visible
    // to everyone) or tagged to their own site — same rule as the list.
    if (getAuthorizedSiteIds(caller).scope !== "ALL_SITES") {
      const { data: existingTags } = await supabaseAdmin
        .from("content_sites")
        .select("site_id")
        .eq("content_id", id);
      const tags = (existingTags ?? []).map((r) => r.site_id);
      const allowed = tags.length === 0 || tags.some((t) => assertSiteAccess(caller, t));
      if (!allowed) {
        return jsonForbidden("Forbidden — this content isn't tagged to a site you have access to.");
      }
    }

    // 2. Fetch from Supabase
    const { data, error } = await supabaseAdmin
      .from("content")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    let created_by_name: string | null = null;
    if (data.created_by) {
      const { data: creator } = await supabaseAdmin
        .from("users")
        .select("first_name, last_name")
        .eq("user_id", data.created_by)
        .maybeSingle();
      created_by_name = creator
        ? `${creator.first_name} ${creator.last_name}`.trim()
        : "Unknown";
    }

    // 3. Return the data object directly so res.data.data maps perfectly
    return NextResponse.json({ ...data, created_by_name });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
