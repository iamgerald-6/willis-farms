"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

const inputClass =
  "w-full border border-gray-200 p-2.5 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

export interface AccountProfile {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  grade_level: string | null;
  job_position: string | null;
  phone: string | null;
  company_id: string | null;
  auth_only?: boolean;
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-sm text-gray-900 break-all">{value?.trim() || "—"}</p>
    </div>
  );
}

export default function ProfileSection() {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [initialized, setInitialized] = useState(false);

  const { data: profile, isLoading } = useQuery<AccountProfile>({
    queryKey: ["account_profile"],
    queryFn: async () => {
      const res = await api.get("/account/profile");
      return res.data;
    },
  });

  useEffect(() => {
    if (!profile || initialized) return;
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setInitialized(true);
  }, [profile, initialized]);

  const nameDirty =
    !!profile &&
    !profile.auth_only &&
    (firstName.trim() !== (profile.first_name ?? "").trim() ||
      lastName.trim() !== (profile.last_name ?? "").trim());

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.patch("/account/profile", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Name updated.");
      queryClient.invalidateQueries({ queryKey: ["account_profile"] });
      queryClient.invalidateQueries({ queryKey: ["get_users"] });
      setInitialized(false);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Failed to update name.");
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <p className="text-sm text-gray-500 py-8 text-center">
        Could not load your profile.
      </p>
    );
  }

  const roleLabel = profile.role?.replace(/_/g, " ") ?? "—";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-semibold text-gray-800">Your profile</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Account information linked to your staff login.
          </p>
        </div>

        <div className="p-5 space-y-5">
          {profile.auth_only ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ReadOnlyField label="Email" value={profile.email} />
              <ReadOnlyField label="Role" value={roleLabel} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="profile-first-name"
                    className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5"
                  >
                    First name
                  </label>
                  <input
                    id="profile-first-name"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="profile-last-name"
                    className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5"
                  >
                    Last name
                  </label>
                  <input
                    id="profile-last-name"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {nameDirty && (
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C62828] text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {saveMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Save name
                </button>
              )}

              <div className="border-t border-gray-100 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
                <ReadOnlyField label="Login email" value={profile.email} />
                <ReadOnlyField label="Role" value={roleLabel} />
                <ReadOnlyField label="Grade level" value={profile.grade_level} />
                <ReadOnlyField
                  label="Job position"
                  value={profile.job_position}
                />
                <ReadOnlyField label="Phone" value={profile.phone} />
                <ReadOnlyField label="Company ID" value={profile.company_id} />
              </div>
            </>
          )}

          <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
            To change your login email, contact an administrator via User
            Management.
          </p>
        </div>
      </div>
    </div>
  );
}
