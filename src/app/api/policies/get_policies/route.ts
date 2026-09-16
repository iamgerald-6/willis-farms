import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, jsonUnauthorized } from "@/lib/apiRequestAuth";
import { getAuthorizedSiteIds } from "@/lib/siteAccess";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  try {
    // Policies/manuals have no separate "view" gate — any authenticated
    // employee can read the list. This previously had no auth check at all.
    const caller = await requireAuth(req);
    if (!caller) return jsonUnauthorized();

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const includeArchived = searchParams.get("include_archived") === "true";

    // ── Fetch manuals ──
    let manualQuery = supabase
      .from("manuals")
      .select("id, title, category, description, created_at, archived_at")
      .order("created_at", { ascending: false });

    if (category) manualQuery = manualQuery.eq("category", category);
    if (!includeArchived) manualQuery = manualQuery.is("archived_at", null);

    const { data: manuals, error: manualsError } = await manualQuery;
    if (manualsError) throw manualsError;
    if (!manuals || manuals.length === 0) {
      return NextResponse.json({ manuals: [] });
    }

    const manualIds = manuals.map((m) => m.id);

    // ── Fetch site tags for these manuals (empty for a manual = all sites) ──
    const { data: siteTagRows } = await supabase
      .from("manual_sites")
      .select("manual_id, site_id")
      .in("manual_id", manualIds);

    const siteIdsByManual: Record<string, number[]> = {};
    for (const row of siteTagRows ?? []) {
      (siteIdsByManual[row.manual_id] ??= []).push(row.site_id);
    }

    // ── Fetch all versions for these manuals in one query ──
    const { data: allVersions, error: versionsError } = await supabase
      .from("manual_versions")
      .select(
        "id, manual_id, version_label, cloudinary_url, file_name, file_size_bytes, version_notes, uploaded_by, uploaded_at",
      )
      .in("manual_id", manualIds)
      .order("uploaded_at", { ascending: false });

    if (versionsError) throw versionsError;

    // ── Fetch uploader names from users table ──
    const uploaderIds = [
      ...new Set(allVersions?.map((v) => v.uploaded_by) ?? []),
    ];

    const { data: uploaders, error: uploadersError } = await supabase
      .from("users")
      .select("user_id, first_name, last_name")
      .in("user_id", uploaderIds);

    if (uploadersError) throw uploadersError;

    const uploaderMap: Record<string, string> = {};
    for (const u of uploaders ?? []) {
      uploaderMap[u.user_id] = `${u.first_name} ${u.last_name}`.trim();
    }

    // ── Group versions by manual_id ──
    const versionsByManual: Record<string, typeof allVersions> = {};
    for (const v of allVersions ?? []) {
      if (!versionsByManual[v.manual_id]) versionsByManual[v.manual_id] = [];
      versionsByManual[v.manual_id].push(v);
    }

    // ── Shape the response ──
    const result = manuals.map((m) => {
      const versions = (versionsByManual[m.id] ?? []).map((v) => ({
        version_id: v.id,
        version_label: v.version_label,
        cloudinary_url: v.cloudinary_url,
        file_name: v.file_name,
        file_size_bytes: v.file_size_bytes,
        version_notes: v.version_notes,
        uploaded_by_id: v.uploaded_by,
        uploaded_by_name: uploaderMap[v.uploaded_by] ?? "Unknown",
        uploaded_at: v.uploaded_at,
      }));

      return {
        manual_id: m.id,
        title: m.title,
        category: m.category,
        description: m.description,
        created_at: m.created_at,
        archived_at: m.archived_at ?? null,
        // [] means "all sites" — see docs/multi-site/add-site-tagging-policies-sop.sql.
        site_ids: siteIdsByManual[m.id] ?? [],
        versions, // sorted newest → oldest
      };
    });

    // The site tag on each manual was previously computed but never
    // enforced — every caller got every manual back regardless of tag. An
    // untagged manual ([]) is visible to everyone; a tagged one is only
    // visible to headquarters or to a caller placed at one of its tagged
    // sites.
    const authorization = getAuthorizedSiteIds(caller);
    const visible =
      authorization.scope === "ALL_SITES"
        ? result
        : result.filter(
            (m) =>
              m.site_ids.length === 0 ||
              (authorization.siteId != null && m.site_ids.includes(authorization.siteId)),
          );

    return NextResponse.json({ manuals: visible });
  } catch (err: any) {
    console.error("[GET /api/manuals]", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}
