import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
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
      uploaded_by, // pass the user_id (UUID) from the frontend session
    } = body;

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

    if (!uploaded_by) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      // Manual exists — just add a new version
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
