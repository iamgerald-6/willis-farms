"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, KeyRound } from "lucide-react";
import PasswordInput from "./PasswordInput";
import {
  authLinkFetch,
  closeAuthLinkSession,
  getAuthLinkClient,
  openAuthLinkSession,
  readAuthLinkFromUrl,
  stripAuthLinkFromUrl,
  type AuthLinkKind,
} from "@/lib/auth/authLinkClient";
import { staffAuthBlockMessage } from "@/lib/staffAccount";
import { maskEmail } from "@/lib/utils";

type StaffCheck =
  | { ok: true; alreadyVerified: boolean }
  | { ok: false; message: string };

async function validateStaffAccount(accessToken: string): Promise<StaffCheck> {
  try {
    const res = await authLinkFetch("/api/me", accessToken);
    if (!res.ok) {
      return {
        ok: false,
        message: "Could not verify your account. Contact an administrator.",
      };
    }

    const data = (await res.json()) as {
      staff_account_exists?: boolean;
      is_disabled?: boolean;
      email_verified?: boolean;
    };

    if (!data.staff_account_exists) {
      return { ok: false, message: staffAuthBlockMessage("not_found") };
    }
    if (data.is_disabled) {
      return { ok: false, message: staffAuthBlockMessage("disabled") };
    }
    return { ok: true, alreadyVerified: !!data.email_verified };
  } catch {
    return {
      ok: false,
      message: "Could not verify your account. Contact an administrator.",
    };
  }
}

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [passwordDone, setPasswordDone] = useState(false);
  /** True when an already-active account is resetting, false for first-time setup. */
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");

  /** The link's own token — the only identity this page is allowed to act on. */
  const linkTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      const link = readAuthLinkFromUrl();

      if (link.status === "expired" || link.status === "missing") {
        const kind: AuthLinkKind =
          link.status === "expired" ? link.kind : "unknown";
        router.replace(`/invite-expired?type=${kind}`);
        return;
      }

      const opened = await openAuthLinkSession(link.params);
      stripAuthLinkFromUrl();

      if ("error" in opened) {
        router.replace(`/invite-expired?type=${link.params.kind}`);
        return;
      }

      const { user, accessToken } = opened.session;
      const staff = await validateStaffAccount(accessToken);

      if (!staff.ok) {
        await closeAuthLinkSession();
        toast.error(staff.message);
        router.replace("/login");
        return;
      }

      if (cancelled) return;

      linkTokenRef.current = accessToken;
      setAccountEmail(user.email ?? "");
      setIsPasswordReset(staff.alreadyVerified);
      setReady(true);
    };

    void start();

    return () => {
      cancelled = true;
    };
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

    const accessToken = linkTokenRef.current;
    if (!accessToken) {
      toast.error("This link has expired. Request a new one.");
      router.replace("/invite-expired");
      return;
    }

    setLoading(true);

    try {
      const { error } = await getAuthLinkClient().auth.updateUser({ password });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (!isPasswordReset) {
        const res = await authLinkFetch(
          "/api/account/complete-onboarding",
          accessToken,
          { method: "POST" },
        );
        if (!res.ok) {
          toast.error(
            "Password saved but the account could not be activated. Contact an administrator.",
          );
          return;
        }
      }

      linkTokenRef.current = null;
      setPasswordDone(true);
      void closeAuthLinkSession();
    } finally {
      setLoading(false);
    }
  };

  if (!ready && !passwordDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#C62828]" />
      </div>
    );
  }

  if (passwordDone) {
    const loginHref = isPasswordReset
      ? "/login?reset=success"
      : "/login?setup=success";

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 w-full max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isPasswordReset ? "Password updated" : "Account ready"}
          </h1>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            {isPasswordReset
              ? "Your new password is saved. Sign in with your email and new password."
              : "Your password is set. Sign in with your email and password to access the dashboard."}
          </p>
          <button
            type="button"
            onClick={() => router.replace(loginHref)}
            className="w-full bg-[#C62828] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 w-full max-w-md">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-[#C62828]" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isPasswordReset ? "Reset your password" : "Set your password"}
          </h1>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {isPasswordReset
            ? "Choose a new password. You will sign in separately afterward."
            : "Welcome! Choose a password to activate your account, then sign in."}
        </p>

        {accountEmail && (
          <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Setting the password for
            </p>
            <p className="text-sm font-medium text-gray-900 break-all">
              {maskEmail(accountEmail)}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
            >
              {isPasswordReset ? "New password" : "Password"}
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              placeholder="Min. 6 characters"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label
              htmlFor="confirm"
              className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
            >
              Confirm password
            </label>
            <PasswordInput
              id="confirm"
              value={confirm}
              onChange={setConfirm}
              placeholder="Repeat password"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#C62828] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {loading
              ? "Saving…"
              : isPasswordReset
                ? "Save new password"
                : "Save password"}
          </button>
        </form>
      </div>
    </div>
  );
}
