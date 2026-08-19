import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import { CLOUDINARY_CLOUD_NAME } from "@/lib/cloudinary";
import { writePolicyAuditLog } from "@/lib/policyAuditLog";
import { getApiRequestUser } from "@/lib/apiRequestAuth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Manual ID is required" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { title, category, description } = body as {
      title?: string;
      category?: string;
      description?: string | null;
    };

    if (!title?.trim() || !category?.trim()) {
      return NextResponse.json(
        { error: "Title and category are required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("manuals")
      .update({
        title: title.trim(),
        category,
        description: description?.trim() || null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json(
        { error: "Failed to update manual" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    }

    const apiUser = await getApiRequestUser(req);

    await writePolicyAuditLog({
      manual_id: id,
      manual_title: data.title,
      action: "edited",
      detail: "Title / category / description updated",
      performed_by: apiUser?.id ?? null,
      performed_by_name: apiUser?.name ?? null,
    });

    return NextResponse.json({ success: true, manual: data });
  } catch (err: any) {
    console.error("[PATCH /api/policies/[id]]", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}

cloudinary.config({
  // Same shared cloud name every upload flow uses (src/lib/cloudinary.ts) —
  // this previously read the env var directly with a non-null assertion,
  // which would crash instead of falling back if it were ever unset.
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Manual ID is required" },
        { status: 400 },
      );
    }

    // ── Confirm manual exists ──
    const { data: manual, error: manualError } = await supabase
      .from("manuals")
      .select("id, title")
      .eq("id", id)
      .maybeSingle();

    if (manualError) throw manualError;
    if (!manual) {
      return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    }

    // ── Collect all Cloudinary public_ids before deleting ──
    const { data: versions, error: versionsError } = await supabase
      .from("manual_versions")
      .select("cloudinary_public_id")
      .eq("manual_id", id);

    if (versionsError) throw versionsError;

    const publicIds = (versions ?? []).map((v) => v.cloudinary_public_id);

    // ── Delete from Supabase (cascade removes versions) ──
    const { error: deleteError } = await supabase
      .from("manuals")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    // Fire-and-forget: policy_audit_log has no FK to manuals, deliberately,
    // so the "deleted" entry survives the row being gone (see
    // docs/policies/policy-audit-log.sql).
    const apiUser = await getApiRequestUser(req);
    await writePolicyAuditLog({
      manual_id: id,
      manual_title: manual.title,
      action: "deleted",
      performed_by: apiUser?.id ?? null,
      performed_by_name: apiUser?.name ?? null,
    });

    // ── Clean up Cloudinary (best effort — don't fail if this errors) ──
    if (publicIds.length > 0) {
      try {
        await cloudinary.api.delete_resources(publicIds, {
          resource_type: "image", // PDFs are uploaded as resource_type: "image"
        });
      } catch (cloudErr) {
        console.warn(
          "[DELETE /api/manuals] Cloudinary cleanup failed:",
          cloudErr,
        );
        // Don't throw — DB row is already deleted, log and move on
      }
    }

    return NextResponse.json({
      success: true,
      deleted_manual_id: id,
      cloudinary_public_ids_removed: publicIds,
    });
  } catch (err: any) {
    console.error("[DELETE /api/manuals/[id]]", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}
