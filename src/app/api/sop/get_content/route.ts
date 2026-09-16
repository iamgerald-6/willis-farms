import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, jsonUnauthorized } from "@/lib/apiRequestAuth";
import { getAuthorizedSiteIds } from "@/lib/siteAccess";
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
export async function GET(req: NextRequest) {
  try {
    // SOPs are general company knowledge with no separate "view" gate — any
    // authenticated employee can read the list (only creating/editing is
    // restricted, see requireSopManageAccess). This previously had no auth
    // check at all.
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();
    const { data, error } = await supabaseAdmin
      .from("content")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const creatorIds = [
      ...new Set(
        (data ?? [])
          .map((c) => c.created_by)
          .filter((id): id is string => !!id),
      ),
    ];
    let creatorNameById: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: creators } = await supabaseAdmin
        .from("users")
        .select("user_id, first_name, last_name")
        .in("user_id", creatorIds);
      creatorNameById = Object.fromEntries(
        (creators ?? []).map((u) => [
          u.user_id,
          `${u.first_name} ${u.last_name}`.trim(),
        ]),
      );
    }
    const contentIds = (data ?? []).map((c) => c.id);
    const siteIdsByContent: Record<string, number[]> = {};
    if (contentIds.length > 0) {
      const { data: siteTagRows } = await supabaseAdmin
        .from("content_sites")
        .select("content_id, site_id")
        .in("content_id", contentIds);
      for (const row of siteTagRows ?? []) {
        (siteIdsByContent[row.content_id] ??= []).push(row.site_id);
      }
    }

    const enriched = (data ?? []).map((c) => ({
      ...c,
      created_by_name: c.created_by
        ? (creatorNameById[c.created_by] ?? "Unknown")
        : null,
      // [] means "all sites" — see docs/multi-site/add-site-tagging-policies-sop.sql.
      site_ids: siteIdsByContent[c.id] ?? [],
    }));

    // The site tag on each SOP was previously computed but never enforced —
    // every caller got every SOP back regardless of tag. An untagged SOP
    // ([]) is visible to everyone; a tagged one is only visible to
    // headquarters or to a caller placed at one of its tagged sites.
    const authorization = getAuthorizedSiteIds(caller);
    const visible =
      authorization.scope === "ALL_SITES"
        ? enriched
        : enriched.filter(
            (c) =>
              c.site_ids.length === 0 ||
              (authorization.siteId != null && c.site_ids.includes(authorization.siteId)),
          );

    return NextResponse.json({ data: visible });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
