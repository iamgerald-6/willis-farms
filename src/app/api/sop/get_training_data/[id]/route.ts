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

    // 3. Return the data object directly so res.data.data maps perfectly
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
