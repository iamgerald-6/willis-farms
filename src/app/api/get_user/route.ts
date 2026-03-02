import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ✅ Server-side only key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin.from("users").select("*");

    if (error) {
      return NextResponse.json([], { status: 400 });
    }

    return NextResponse.json(data); // <-- return the array directly
  } catch (err) {
    return NextResponse.json([], { status: 500 });
  }
}
