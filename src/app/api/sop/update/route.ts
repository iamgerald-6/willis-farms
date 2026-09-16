// app/api/sop/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeSopAuditLog } from "@/lib/sopAuditLog";
import { getApiRequestUser, requireSopManageAccess } from "@/lib/apiRequestAuth";
import { getAuthorizedSiteIds } from "@/lib/siteAccess";

export async function PATCH(req: NextRequest) {
  try {
    const authedUser = await requireSopManageAccess(req);
    if (!authedUser) {
      return NextResponse.json({ error: "Forbidden — you don't have access to SOP Management." }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();

    const {
      id,
      title,
      category,
      sub_category,
      description,
      cover_image_url,
      document_url,
      document_read_minutes,
      video_url,
      video_duration_minutes,
      performed_by,
      performed_by_name,
      // Present (even as []) => replace this content's site tags. Absent =>
      // leave the current tagging untouched. [] => "all sites".
      site_ids,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 },
      );
    }

    if (!title || !category || !description) {
      return NextResponse.json(
        { error: "Missing required fields: title, category, description" },
        { status: 400 },
      );
    }

    // A SITE-scoped caller can only edit content that's untagged (visible
    // to everyone) or already tagged to their own site — same rule as
    // everywhere else. Being able to manage SOPs doesn't mean any site.
    const authorization = getAuthorizedSiteIds(authedUser);
    if (authorization.scope !== "ALL_SITES") {
      const { data: existingTags } = await supabase
        .from("content_sites")
        .select("site_id")
        .eq("content_id", id);
      const tags = (existingTags ?? []).map((r) => r.site_id);
      const allowed =
        tags.length === 0 ||
        (authorization.siteId != null && tags.includes(authorization.siteId));
      if (!allowed) {
        return NextResponse.json(
          { error: "Forbidden — this content isn't tagged to a site you have access to." },
          { status: 403 },
        );
      }
    }

    const { data, error } = await supabase
      .from("content")
      .update({
        title,
        category,
        sub_category: sub_category ?? null,
        description,
        cover_image_url: cover_image_url ?? null,
        document_url: document_url ?? null,
        document_read_minutes: document_read_minutes ?? null,
        video_url: video_url ?? null,
        video_duration_minutes: video_duration_minutes ?? null,
      })
      .eq("id", id)
      .select();

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json(
        { error: "Failed to update content" },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "Content not found" },
        { status: 404 },
      );
    }

    if (Array.isArray(site_ids)) {
      // Same override as upload — a SITE-scoped caller can only re-tag
      // content to their own site, never "All Sites" or another site.
      const resolvedSiteIds =
        authorization.scope === "ALL_SITES"
          ? site_ids
          : authorization.siteId != null
            ? [authorization.siteId]
            : [];

      const { error: clearError } = await supabase
        .from("content_sites")
        .delete()
        .eq("content_id", id);
      if (clearError) {
        console.error("Supabase content_sites clear error:", clearError);
      } else if (resolvedSiteIds.length > 0) {
        const { error: sitesError } = await supabase
          .from("content_sites")
          .insert(resolvedSiteIds.map((siteId: number) => ({ content_id: id, site_id: siteId })));
        if (sitesError) {
          console.error("Supabase content_sites insert error:", sitesError);
        }
      }
    }

    // Prefer the caller identity resolved server-side from the Supabase
    // session over the client-supplied performed_by/performed_by_name.
    const apiUser = await getApiRequestUser(req);

    await writeSopAuditLog({
      content_id: id,
      content_title: data[0].title,
      action: "edited",
      performed_by: apiUser?.id ?? performed_by,
      performed_by_name: apiUser?.name ?? performed_by_name,
    });

    return NextResponse.json({ success: true, content: data[0] });
  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
