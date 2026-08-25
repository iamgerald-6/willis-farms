import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@/types";
import { applyResolvedSupervisorToAppraisal } from "./supervisorDisplay";

const USER_FIELDS =
  "user_id, first_name, last_name, email, supervisor_id, company_id";

export async function fetchUsersForSupervisorResolution(
  supabase: SupabaseClient,
): Promise<User[]> {
  const { data } = await supabase.from("users").select(USER_FIELDS);
  return (data ?? []) as User[];
}

export async function enrichAppraisalWithSupervisor<
  T extends {
    company_id?: string | null;
    employee_user_id?: string | null;
    immediate_supervisor?: string | null;
    supervisor_email?: string | null;
    supervisor_id?: string | null;
  },
>(supabase: SupabaseClient, appraisal: T): Promise<T> {
  const users = await fetchUsersForSupervisorResolution(supabase);
  return applyResolvedSupervisorToAppraisal(appraisal, users);
}

export async function enrichAppraisalsWithSupervisor<
  T extends {
    company_id?: string | null;
    employee_user_id?: string | null;
    immediate_supervisor?: string | null;
    supervisor_email?: string | null;
    supervisor_id?: string | null;
  },
>(supabase: SupabaseClient, rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const users = await fetchUsersForSupervisorResolution(supabase);
  return rows.map((row) => applyResolvedSupervisorToAppraisal(row, users));
}
