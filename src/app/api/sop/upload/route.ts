// app/api/content/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeSopAuditLog } from "@/lib/sopAuditLog";
import { getApiRequestUser } from "@/lib/apiRequestAuth";

const DEFAULT_COVER = "/images/breedfeed.webp";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();

    const {
      title,
      category,
      sub_category,
      description,
      cover_image_url,
      document_url,
      document_read_minutes,
      video_url,
      video_duration_minutes,
      created_by,
      performed_by_name,
    } = body;

    if (!title || !category || !description) {
      return NextResponse.json(
        { error: "Missing required fields: title, category, description" },
        { status: 400 }
      );
    }

    // Prefer the caller identity resolved server-side from the Supabase
    // session (Authorization header, attached automatically by src/lib/api.ts)
    // over whatever the client sent in the body — more reliable than relying
    // on the frontend's own currentUser lookup having resolved in time.
    const apiUser = await getApiRequestUser(req);
    const resolvedCreatedBy = apiUser?.id ?? created_by ?? null;
    const resolvedPerformedByName = apiUser?.name ?? performed_by_name ?? null;

    const { data, error } = await supabase
      .from("content")
      .insert([
        {
          title,
          category,
          sub_category: sub_category ?? null,
          description,
          // Fall back to default cover if none was uploaded
          cover_image_url: cover_image_url || DEFAULT_COVER,
          document_url: document_url ?? null,
          document_read_minutes: document_read_minutes ?? null,
          video_url: video_url ?? null,
          video_duration_minutes: video_duration_minutes ?? null,
          created_at: new Date().toISOString(),
          created_by: resolvedCreatedBy,
        },
      ])
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to create content" },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "Content insertion returned no data" },
        { status: 500 }
      );
    }

    await writeSopAuditLog({
      content_id: data[0].id,
      content_title: data[0].title,
      action: "added",
      performed_by: resolvedCreatedBy,
      performed_by_name: resolvedPerformedByName,
    });

    return NextResponse.json({ success: true, content: data[0] });
  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
