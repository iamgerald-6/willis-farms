// app/api/content/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
// import { Content } from "@/types";

// Initialize Supabase server client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Destructure fields
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
    } = body;

    // Manual validation for required fields
    if (!title || !category || !description) {
      return NextResponse.json(
        { error: "Missing required fields: title, category, description" },
        { status: 400 }
      );
    }

    // Insert into Supabase
    const { data, error } = await supabase
      .from("content")
      .insert([
        {
          title,
          category,
          sub_category: sub_category ?? null,
          description,
          cover_image_url: cover_image_url ?? null,
          document_url: document_url ?? null,
          document_read_minutes: document_read_minutes ?? null,
          video_url: video_url ?? null,
          video_duration_minutes: video_duration_minutes ?? null,
          created_at: new Date().toISOString(),
          created_by: created_by ?? null,
        },
      ])
      .select(); // return inserted row

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

    return NextResponse.json({ success: true, content: data[0] });
  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
