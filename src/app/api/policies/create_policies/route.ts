import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writePolicyAuditLog } from "@/lib/policyAuditLog";
import { getApiRequestUser } from "@/lib/apiRequestAuth";
import { getAuthorizedSiteIds } from "@/lib/siteAccess";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    // Real caller identity, verified server-side — previously this route
    // trusted whatever `uploaded_by` the client sent with no check that the
    // caller actually WAS that person (same gap fixed earlier this session
    // in post_promotions).
    const authedUser = await getApiRequestUser(req);
    if (!authedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const {
      title,
      category,
      description,
      version_label,
      version_notes,
      cloudinary_public_id,
      cloudinary_url,
      file_name,
      file_size_bytes,
      // Which site(s) this manual applies to — omitted/empty means "all
      // sites" (see docs/multi-site/add-site-tagging-policies-sop.sql).
      // Only applied when the manual itself is first created, not when
      // adding a further version to an existing manual.
      site_ids,
    } = body;
    // The authenticated caller's own id is the only source of truth for who
    // uploaded this — the request body no longer supplies it.
    const uploaded_by = authedUser.id;

    // ── Validate required fields ──
    if (
      !title ||
      !category ||
      !version_label ||
      !cloudinary_url ||
      !file_name
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: title, category, version_label, cloudinary_url, file_name",
        },
        { status: 400 },
      );
    }

    // ── Check if manual with same title + category already exists ──
    const { data: existing, error: lookupError } = await supabase
      .from("manuals")
      .select("id")
      .eq("title", title)
      .eq("category", category)
      .maybeSingle();

    if (lookupError) throw lookupError;

    let manualId: string;

    if (existing) {
      // Manual exists — just add a new version. Same site rule as editing
      // SOP content: a SITE-scoped caller can only add to a manual that's
      // untagged (visible to everyone) or already tagged to their own site.
      const callerAuthorization = getAuthorizedSiteIds(authedUser);
      if (callerAuthorization.scope !== "ALL_SITES") {
        const { data: existingTags } = await supabase
          .from("manual_sites")
          .select("site_id")
          .eq("manual_id", existing.id);
        const tags = (existingTags ?? []).map((r) => r.site_id);
        const allowed =
          tags.length === 0 ||
          (callerAuthorization.siteId != null && tags.includes(callerAuthorization.siteId));
        if (!allowed) {
          return NextResponse.json(
            { error: "Forbidden — this manual isn't tagged to a site you have access to." },
            { status: 403 },
          );
        }
      }
      manualId = existing.id;
    } else {
      // Create the manual row first
      const { data: newManual, error: manualError } = await supabase
        .from("manuals")
        .insert({
          title,
          category,
          description: description ?? null,
          created_by: uploaded_by,
        })
        .select("id")
        .single();

      if (manualError) throw manualError;
      manualId = newManual.id;

      // A SITE-scoped caller can only tag a manual to their own site — "All
      // Sites" and tagging other sites is an ALL_SITES/headquarters-only
      // ability. Whatever the client sent is overridden here rather than
      // trusted, same as the SOP upload route.
      const authorization = getAuthorizedSiteIds(authedUser);
      const resolvedSiteIds =
        authorization.scope === "ALL_SITES"
          ? Array.isArray(site_ids)
            ? site_ids
            : []
          : authorization.siteId != null
            ? [authorization.siteId]
            : [];

      if (resolvedSiteIds.length > 0) {
        const { error: sitesError } = await supabase
          .from("manual_sites")
          .insert(resolvedSiteIds.map((siteId: number) => ({ manual_id: manualId, site_id: siteId })));
        if (sitesError) throw sitesError;
      }
    }

    // ── Check version label isn't a duplicate for this manual ──
    const { data: dupVersion } = await supabase
      .from("manual_versions")
      .select("id")
      .eq("manual_id", manualId)
      .eq("version_label", version_label)
      .maybeSingle();

    if (dupVersion) {
      return NextResponse.json(
        {
          error: `Version "${version_label}" already exists for this manual. Use a different version label.`,
        },
        { status: 409 },
      );
    }

    // ── Insert the version ──
    const { data: version, error: versionError } = await supabase
      .from("manual_versions")
      .insert({
        manual_id: manualId,
        version_label,
        cloudinary_public_id,
        cloudinary_url,
        file_name,
        file_size_bytes: file_size_bytes ?? null,
        version_notes: version_notes ?? null,
        uploaded_by,
      })
      .select()
      .single();

    if (versionError) throw versionError;

    // Prefer the caller identity resolved server-side from the Supabase
    // session over the client-supplied uploaded_by — matches the SOP audit
    // log's writeSopAuditLog call pattern.
    const apiUser = await getApiRequestUser(req);

    await writePolicyAuditLog({
      manual_id: manualId,
      manual_title: title,
      action: existing ? "version_added" : "added",
      detail: existing ? `Version "${version_label}" added` : null,
      performed_by: apiUser?.id ?? uploaded_by,
      performed_by_name: apiUser?.name ?? null,
    });

    return NextResponse.json(
      { success: true, manual_id: manualId, version },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("[POST /api/manuals]", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}
