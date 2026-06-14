import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    // ── Fetch manuals ──
    let manualQuery = supabase
      .from("manuals")
      .select("id, title, category, description, created_at")
      .order("created_at", { ascending: false });

    if (category) manualQuery = manualQuery.eq("category", category);

    const { data: manuals, error: manualsError } = await manualQuery;
    if (manualsError) throw manualsError;
    if (!manuals || manuals.length === 0) {
      return NextResponse.json({ manuals: [] });
    }

    const manualIds = manuals.map((m) => m.id);

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
        versions, // sorted newest → oldest
      };
    });

    return NextResponse.json({ manuals: result });
  } catch (err: any) {
    console.error("[GET /api/manuals]", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}
