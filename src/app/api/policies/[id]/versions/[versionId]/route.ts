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

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

// Edits an existing version's label/notes, and optionally replaces its file
// (the caller uploads the new PDF to Cloudinary client-side first, same as
// the initial upload flow, then passes the new cloudinary_url/public_id
// here). This is a genuine in-place edit — unlike re-uploading under the
// same title/category via POST /api/policies/create_policies, which always
// adds a brand-new version instead of touching an existing one.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const { id, versionId } = await params;
    if (!id || !versionId) {
      return NextResponse.json(
        { error: "Manual ID and version ID are required" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const {
      version_label,
      version_notes,
      cloudinary_public_id,
      cloudinary_url,
      file_name,
      file_size_bytes,
    } = body as {
      version_label?: string;
      version_notes?: string | null;
      cloudinary_public_id?: string;
      cloudinary_url?: string;
      file_name?: string;
      file_size_bytes?: number;
    };

    if (!version_label?.trim()) {
      return NextResponse.json(
        { error: "Version label is required" },
        { status: 400 },
      );
    }

    // ── Confirm the version exists and belongs to this manual ──
    const { data: existingVersion, error: fetchError } = await supabase
      .from("manual_versions")
      .select("id, manual_id, cloudinary_public_id, version_label")
      .eq("id", versionId)
      .eq("manual_id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existingVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // ── Reject a duplicate label against any OTHER version of this manual ──
    const { data: dupVersion } = await supabase
      .from("manual_versions")
      .select("id")
      .eq("manual_id", id)
      .eq("version_label", version_label)
      .neq("id", versionId)
      .maybeSingle();

    if (dupVersion) {
      return NextResponse.json(
        {
          error: `Version "${version_label}" already exists for this manual. Use a different version label.`,
        },
        { status: 409 },
      );
    }

    const replacingFile = !!cloudinary_url && !!cloudinary_public_id;

    const updatePayload: Record<string, unknown> = {
      version_label: version_label.trim(),
      version_notes: version_notes?.trim() || null,
    };
    if (replacingFile) {
      updatePayload.cloudinary_public_id = cloudinary_public_id;
      updatePayload.cloudinary_url = cloudinary_url;
      updatePayload.file_name = file_name;
      updatePayload.file_size_bytes = file_size_bytes ?? null;
    }

    const { data: updated, error: updateError } = await supabase
      .from("manual_versions")
      .update(updatePayload)
      .eq("id", versionId)
      .select()
      .single();

    if (updateError) throw updateError;

    // ── Clean up the old Cloudinary file (best effort) if it was replaced ──
    if (replacingFile && existingVersion.cloudinary_public_id) {
      try {
        await cloudinary.api.delete_resources(
          [existingVersion.cloudinary_public_id],
          { resource_type: "image" },
        );
      } catch (cloudErr) {
        console.warn(
          "[PATCH /api/policies/[id]/versions/[versionId]] Cloudinary cleanup failed:",
          cloudErr,
        );
      }
    }

    // ── Fetch the manual's title for the audit log ──
    const { data: manual } = await supabase
      .from("manuals")
      .select("title")
      .eq("id", id)
      .maybeSingle();

    const apiUser = await getApiRequestUser(req);
    await writePolicyAuditLog({
      manual_id: id,
      manual_title: manual?.title ?? "Untitled manual",
      action: "edited",
      detail: replacingFile
        ? `Version "${existingVersion.version_label}" file replaced`
        : `Version "${existingVersion.version_label}" details updated`,
      performed_by: apiUser?.id ?? null,
      performed_by_name: apiUser?.name ?? null,
    });

    return NextResponse.json({ success: true, version: updated });
  } catch (err: any) {
    console.error("[PATCH /api/policies/[id]/versions/[versionId]]", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}
