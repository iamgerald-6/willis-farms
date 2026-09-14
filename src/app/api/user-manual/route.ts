import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApiRequestUser } from "@/lib/apiRequestAuth";
import { hasSystemAccessByRoleLabel } from "@/lib/userRoleAccessControl";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET /api/user-manual — any authenticated user. Returns the current
// version (the most recently uploaded row) plus a short history of older
// ones, same shape idea as Policies' manual_versions but for a single
// document rather than a library.
export async function GET(req: NextRequest) {
  try {
    const user = await getApiRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: versions, error } = await supabase
      .from("user_manual_versions")
      .select(
        "id, cloudinary_url, cloudinary_public_id, file_name, file_size_bytes, version_label, version_notes, uploaded_by, uploaded_at",
      )
      .order("uploaded_at", { ascending: false })
      .limit(10);
    if (error) throw error;

    const uploaderIds = [...new Set((versions ?? []).map((v) => v.uploaded_by))];
    const { data: uploaders } = await supabase
      .from("users")
      .select("user_id, first_name, last_name")
      .in("user_id", uploaderIds.length > 0 ? uploaderIds : ["00000000-0000-0000-0000-000000000000"]);
    const uploaderMap: Record<string, string> = {};
    for (const u of uploaders ?? []) {
      uploaderMap[u.user_id] = `${u.first_name} ${u.last_name}`.trim();
    }

    const result = (versions ?? []).map((v) => ({
      version_id: v.id,
      cloudinary_url: v.cloudinary_url,
      file_name: v.file_name,
      file_size_bytes: v.file_size_bytes,
      version_label: v.version_label,
      version_notes: v.version_notes,
      uploaded_by_name: uploaderMap[v.uploaded_by] ?? "Unknown",
      uploaded_at: v.uploaded_at,
    }));

    return NextResponse.json({
      current: result[0] ?? null,
      history: result.slice(1),
    });
  } catch (err: any) {
    console.error("[GET /api/user-manual]", err);
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 });
  }
}

// POST /api/user-manual — System Administrator or Super Admin only. Records
// a new version after the client has already uploaded the file to
// Cloudinary (same client-upload-then-record-metadata flow as Policies),
// but unlike Policies' create route, this one actually checks the caller's
// role server-side rather than trusting the button was hidden client-side.
export async function POST(req: NextRequest) {
  try {
    const user = await getApiRequestUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasSystemAccessByRoleLabel(user.role)) {
      return NextResponse.json(
        { error: "Forbidden — only System Administrator can update the User Manual." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const {
      cloudinary_public_id,
      cloudinary_url,
      file_name,
      file_size_bytes,
      version_label,
      version_notes,
    } = body;

    if (!cloudinary_url || !file_name || !version_label) {
      return NextResponse.json(
        { error: "Missing required fields: cloudinary_url, file_name, version_label" },
        { status: 400 },
      );
    }

    const { data: version, error } = await supabase
      .from("user_manual_versions")
      .insert({
        cloudinary_public_id: cloudinary_public_id ?? null,
        cloudinary_url,
        file_name,
        file_size_bytes: file_size_bytes ?? null,
        version_label,
        version_notes: version_notes ?? null,
        uploaded_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, version }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/user-manual]", err);
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status: 500 });
  }
}
