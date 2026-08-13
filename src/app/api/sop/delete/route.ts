// app/api/content/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeSopAuditLog } from "@/lib/sopAuditLog";
import { getApiRequestUser } from "@/lib/apiRequestAuth";

export async function DELETE(req: NextRequest) {
  try {
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

    // ── Delete from Supabase ───────────────────────────────────────────────
    const { error } = await supabase.from("content").delete().in("id", safeIds);

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
      safeIds.map((id) =>
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
      deleted: safeIds.length,
      message:
        safeIds.length === 1
          ? "Content deleted successfully."
          : `${safeIds.length} items deleted successfully.`,
    });
  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
