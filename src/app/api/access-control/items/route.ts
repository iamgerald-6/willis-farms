import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";

/** GET — every Access control item, with its selected actions embedded. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden(
        "System Definitions view access is required to view this list.",
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data, error } = await supabase
      .from("access_control_items")
      .select("*, access_control_item_actions(*)")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST — add a new sidebar item (optionally with its sub-menu item chosen). */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden(
        "System Definitions add access is required to add to this list.",
      );
    }

    const body = await req.json();
    const sidebarItem = (body.sidebar_item as string | undefined)?.trim();
    const sidebarSubmenuItem =
      (body.sidebar_submenu_item as string | undefined)?.trim() || null;

    if (!sidebarItem) {
      return NextResponse.json(
        { error: "sidebar_item is required" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data, error } = await supabase
      .from("access_control_items")
      .insert([
        { sidebar_item: sidebarItem, sidebar_submenu_item: sidebarSubmenuItem },
      ])
      .select("*, access_control_item_actions(*)")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "That item has already been added." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
