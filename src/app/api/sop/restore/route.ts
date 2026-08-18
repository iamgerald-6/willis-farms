// app/api/sop/restore/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeSopAuditLog } from "@/lib/sopAuditLog";
import { getApiRequestUser } from "@/lib/apiRequestAuth";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { id, performed_by, performed_by_name } = body as {
      id: string;
      performed_by?: string;
      performed_by_name?: string;
    };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("content")
      .update({ archived_at: null })
      .eq("id", id)
      .select();

    if (error) {
      console.error("Supabase restore error:", error);
      return NextResponse.json(
        { error: "Failed to restore content" },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "Content not found" },
        { status: 404 },
      );
    }

    const apiUser = await getApiRequestUser(req);

    await writeSopAuditLog({
      content_id: id,
      content_title: data[0].title,
      action: "restored",
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
