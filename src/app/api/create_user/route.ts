import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, password, role, phone } = await req.json();

    if (!email || !password || !role) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // 1️⃣ Create user in Supabase Auth
    // Step 1: Create user in Supabase Auth
    const { data, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // or true if you want auto-verified
        user_metadata: { role },
      });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const authUser = data!.user;

    // 2️⃣ Insert into your `users` table
    const { data: tableUser, error: tableError } = await supabaseAdmin
      .from("users")
      .insert([
        {
          user_id: authUser.id, // UID from Auth
          email,
          phone: phone ?? null,
          role,
          created_at: new Date().toISOString(),
          first_name: null, // for later profile setup
          last_name: null, // for later profile setup
          email_verified: false, // initially false
          email_confirm: false, // initially false
        },
      ])
      .select()
      .single();

    if (tableError) {
      return NextResponse.json({ error: tableError.message }, { status: 400 });
    }

    return NextResponse.json({ data: tableUser });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
