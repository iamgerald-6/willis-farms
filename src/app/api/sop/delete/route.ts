// app/api/content/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeSopAuditLog } from "@/lib/sopAuditLog";
import { getApiRequestUser, requireSopManageAccess } from "@/lib/apiRequestAuth";
import { assertSiteAccess, getAuthorizedSiteIds } from "@/lib/siteAccess";

export async function DELETE(req: NextRequest) {
  try {
    const authedUser = await requireSopManageAccess(req);
    if (!authedUser) {
      return NextResponse.json({ error: "Forbidden — you don't have access to SOP Management." }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { contentIds, performed_by, performed_by_name } = body as {
      contentIds: string[];
      performed_by?: string;
      performed_by_name?: string;
    };

    // ── Validation ─────────────────────────────────────────────────────────
    // ── Validation ─────────────────────────────────────────────────────────
    if (!contentIds || !Array.isArray(contentIds) || contentIds.length === 0) {
      return NextResponse.json(
        { error: "contentIds must be a non-empty array" },
        { status: 400 }
      );
    }

    // Convert numbers/strings safely and trim them
    const safeIds = contentIds
      .map((id) => String(id).trim())
      .filter((id) => id !== "" && id !== "undefined" && id !== "null");

    if (safeIds.length === 0) {
      return NextResponse.json(
        { error: "No valid content IDs provided" },
        { status: 400 }
      );
    }

    // Snapshot titles before deleting — sop_audit_log has no FK to content,
    // deliberately, so the "deleted" entry survives the row being gone, but
    // that means the title has to be captured now or never.
    const { data: toDelete } = await supabase
      .from("content")
      .select("id, title")
      .in("id", safeIds);
    const titleById = new Map(
      (toDelete ?? []).map((c) => [c.id, c.title as string]),
    );

    // A SITE-scoped caller can only delete content that's untagged
    // (visible to everyone) or already tagged to their own site — checked
    // per-id since a bulk request could mix content from multiple sites.
    let deletableIds = safeIds;
    if (getAuthorizedSiteIds(authedUser).scope !== "ALL_SITES") {
      const { data: siteTagRows } = await supabase
        .from("content_sites")
        .select("content_id, site_id")
        .in("content_id", safeIds);
      const tagsByContent: Record<string, number[]> = {};
      for (const row of siteTagRows ?? []) {
        (tagsByContent[row.content_id] ??= []).push(row.site_id);
      }
      deletableIds = safeIds.filter((id) => {
        const tags = tagsByContent[id] ?? [];
        return tags.length === 0 || tags.some((t) => assertSiteAccess(authedUser, t));
      });
      if (deletableIds.length === 0) {
        return NextResponse.json(
          { error: "Forbidden — none of this content is tagged to a site you have access to." },
          { status: 403 },
        );
      }
    }

    // ── Delete from Supabase ───────────────────────────────────────────────
    const { error } = await supabase.from("content").delete().in("id", deletableIds);

    if (error) {
      console.error("Supabase delete error:", error);
      return NextResponse.json(
        { error: "Failed to delete content" },
        { status: 500 }
      );
    }

    const apiUser = await getApiRequestUser(req);
    const resolvedPerformedBy = apiUser?.id ?? performed_by;
    const resolvedPerformedByName = apiUser?.name ?? performed_by_name;

    await Promise.all(
      deletableIds.map((id) =>
        writeSopAuditLog({
          content_id: id,
          content_title: titleById.get(id) ?? "Untitled SOP",
          action: "deleted",
          performed_by: resolvedPerformedBy,
          performed_by_name: resolvedPerformedByName,
        }),
      ),
    );

    return NextResponse.json({
      success: true,
      deleted: deletableIds.length,
      message:
        deletableIds.length === 1
          ? "Content deleted successfully."
          : `${deletableIds.length} items deleted successfully.`,
    });
  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
