"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import PasswordInput from "@/app/(auth)/components/PasswordInput";

export default function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const email = session?.user?.email ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error("Session expired. Please sign in again.");
      return;
    }

    if (!currentPassword) {
      toast.error("Enter your current password.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      toast.error("New password must be different from your current password.");
      return;
    }

    setLoading(true);

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (verifyError) {
      toast.error("Current password is incorrect.");
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setLoading(false);

    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated successfully.");
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-lg">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-800">Change password</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Enter your current password, then choose a new one.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label
            htmlFor="current-password"
            className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
          >
            Current password
          </label>
          <PasswordInput
            id="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="Current password"
            autoComplete="current-password"
          />
        </div>

        <div>
          <label
            htmlFor="new-password"
            className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
          >
            New password
          </label>
          <PasswordInput
            id="new-password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Min. 6 characters"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label
            htmlFor="confirm-new-password"
            className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
          >
            Confirm new password
          </label>
          <PasswordInput
            id="confirm-new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Repeat new password"
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !currentPassword}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#C62828] text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
