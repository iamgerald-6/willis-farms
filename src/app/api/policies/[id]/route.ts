import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import { CLOUDINARY_CLOUD_NAME } from "@/lib/cloudinary";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
