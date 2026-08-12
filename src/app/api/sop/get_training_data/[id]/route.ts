import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Params = {
  id: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "ID parameter missing" },
        { status: 400 }
      );
    }

    // 2. Fetch from Supabase
    const { data, error } = await supabaseAdmin
      .from("content")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    let created_by_name: string | null = null;
    if (data.created_by) {
      const { data: creator } = await supabaseAdmin
        .from("users")
        .select("first_name, last_name")
        .eq("user_id", data.created_by)
        .maybeSingle();
      created_by_name = creator
        ? `${creator.first_name} ${creator.last_name}`.trim()
        : "Unknown";
    }

    // 3. Return the data object directly so res.data.data maps perfectly
    return NextResponse.json({ ...data, created_by_name });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
