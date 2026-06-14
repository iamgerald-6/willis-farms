import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const {
      email,
      role,
      phone,
      first_name,
      last_name,
      company_id,
      job_position,
      grade_level,
    } = await req.json();

    if (!email || !role || !first_name || !last_name || !company_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (role === "super_admin") {
      return NextResponse.json({ error: "Invalid role" }, { status: 403 });
    }

    const validRoles = ["admin", "manager", "employee"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const { data, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { role },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/set-password`,
      });

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    const authUser = data.user;

    const { data: tableUser, error: tableError } = await supabaseAdmin
      .from("users")
      .insert([
        {
          user_id: authUser.id,
          email,
          phone: phone ?? null,
          role,
          first_name,
          last_name,
          company_id,
          grade_level,
          job_position: job_position ?? null,
          created_at: new Date().toISOString(),
          email_verified: false,
          email_confirm: false,
        },
      ])
      .select()
      .single();

    if (tableError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      return NextResponse.json({ error: tableError.message }, { status: 400 });
    }

    return NextResponse.json({ data: tableUser });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
