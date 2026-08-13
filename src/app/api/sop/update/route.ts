// app/api/sop/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeSopAuditLog } from "@/lib/sopAuditLog";
import { getApiRequestUser } from "@/lib/apiRequestAuth";

export async function PATCH(req: NextRequest) {
  try {
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
