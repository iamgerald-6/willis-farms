"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false); // show form only once auth state is resolved

  useEffect(() => {
    // Supabase processes the invite/recovery token from the URL hash automatically.
    // Wait for the auth state to settle, then decide what to show.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") {
        // Check if this page was reached from an invite/recovery link (hash contains a token)
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const isTokenLink =
          hash.includes("access_token") ||
          hash.includes("type=invite") ||
          hash.includes("type=recovery");

        if (isTokenLink) {
          // Supabase is processing the token — show the form
          setReady(true);
        } else {
          // No invite token in URL — check if the user already has a session
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
              // Already logged in: go straight to the dashboard
              router.replace("/dashboard");
            } else {
              // Not logged in and no invite token — send to login
              router.replace("/login");
            }
          });
        }
      }

      if (event === "SIGNED_IN") {
        // Token was processed; user is now signed in — show the set-password form
        setReady(true);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success("Password set! Taking you to the dashboard…");
    setTimeout(() => router.push("/dashboard"), 1500);
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2">Set your password</h1>
        <p className="text-sm text-gray-500 mb-6">
          Welcome! Choose a password to activate your account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              className="w-full border p-2 rounded"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              className="w-full border p-2 rounded"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Set Password & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
