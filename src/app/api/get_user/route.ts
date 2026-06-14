import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const { data, error } = await supabaseAdmin.from("users").select("*");

    if (error) {
      return NextResponse.json([], { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json([], { status: 500 });
  }
}
