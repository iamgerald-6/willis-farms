import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("content")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const creatorIds = [
      ...new Set(
        (data ?? [])
          .map((c) => c.created_by)
          .filter((id): id is string => !!id),
      ),
    ];
    let creatorNameById: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: creators } = await supabaseAdmin
        .from("users")
        .select("user_id, first_name, last_name")
        .in("user_id", creatorIds);
      creatorNameById = Object.fromEntries(
        (creators ?? []).map((u) => [
          u.user_id,
          `${u.first_name} ${u.last_name}`.trim(),
        ]),
      );
    }
    const enriched = (data ?? []).map((c) => ({
      ...c,
      created_by_name: c.created_by
        ? (creatorNameById[c.created_by] ?? "Unknown")
        : null,
    }));
    return NextResponse.json({ data: enriched });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
