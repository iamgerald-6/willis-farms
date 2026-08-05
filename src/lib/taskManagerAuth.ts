import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getApiRequestUser,
  requireSeniorManagement as requireSeniorManagementShared,
  type ApiRequestUser,
} from "@/lib/apiRequestAuth";

/** @deprecated use ApiRequestUser from apiRequestAuth */
export type RequestUser = ApiRequestUser;

export async function getRequestUser(req: NextRequest): Promise<ApiRequestUser | null> {
  return getApiRequestUser(req);
}

export async function requireSeniorManagement(
  req: NextRequest,
): Promise<ApiRequestUser | null> {
  return requireSeniorManagementShared(req);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin =
  url && key
    ? createClient(url, key, { auth: { persistSession: false } })
    : (null as unknown as ReturnType<typeof createClient>);
