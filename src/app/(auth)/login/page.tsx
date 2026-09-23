"use client";

import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ignoreNavigationAbort } from "@/lib/navigation/safeNavigation";
import { hasLocalSupabaseSession } from "@/lib/auth/hasLocalSupabaseSession";
import { checkStaffAccountBlock } from "@/lib/auth/verifyStaffAccount";
import PasswordInput, { inputClass } from "../components/PasswordInput";
import { staffAuthBlockMessage } from "@/lib/staffAccount";

const LoginSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-100">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#C62828]" />
  </div>
);

const SESSION_CHECK_TIMEOUT_MS = 10_000;
const SESSION_CHECK_HARD_LIMIT_MS = 12_000;

class SessionCheckTimeoutError extends Error {
  constructor() {
    super("SESSION_CHECK_TIMEOUT");
    this.name = "SessionCheckTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new SessionCheckTimeoutError()), ms);
    }),
  ]);
}

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const raw = searchParams?.get("redirect") ?? "";
  const redirectTo = raw.startsWith("/") ? raw : "/dashboard";
  const passwordReset = searchParams?.get("reset") === "success";
  const passwordSetup = searchParams?.get("setup") === "success";
  const fromPasswordFlow = passwordReset || passwordSetup;

  // Always start as "guest" so SSR and the first client render match (localStorage
  // is unavailable on the server). Promote to "checking" in useLayoutEffect when
  // a local token exists, before paint, then confirm with getSession().
  const [screen, setScreen] = useState<"checking" | "guest">("guest");

  useLayoutEffect(() => {
    if (fromPasswordFlow) return;
    if (hasLocalSupabaseSession()) {
      setScreen("checking");
    }
  }, [fromPasswordFlow]);

  useEffect(() => {
    if (fromPasswordFlow) return;
    if (!hasLocalSupabaseSession()) return;

    let active = true;

    const fallBackToGuest = async (timedOut: boolean) => {
      if (timedOut) {
        toast.error("Session check timed out. Please sign in again.");
      }
      try {
        await supabase.auth.signOut();
      } catch {
        // Best-effort — still show the login form even if sign-out fails.
      }
      if (active) setScreen("guest");
    };

    (async () => {
      try {
        // getUser() (not getSession()) on purpose — it revalidates against
        // Supabase Auth instead of trusting whatever's cached in localStorage.
        const { data, error } = await withTimeout(
          supabase.auth.getUser(),
          SESSION_CHECK_TIMEOUT_MS,
        );
        if (!active) return;
        if (error || !data.user) {
          setScreen("guest");
          return;
        }

        try {
          const block = await withTimeout(
            checkStaffAccountBlock(),
            SESSION_CHECK_TIMEOUT_MS,
          );
          if (!active) return;
          if (block) {
            await supabase.auth.signOut();
            if (!active) return;
            toast.error(staffAuthBlockMessage(block));
            setScreen("guest");
            return;
          }
        } catch (staffCheckError) {
          if (staffCheckError instanceof SessionCheckTimeoutError) {
            await fallBackToGuest(true);
            return;
          }
          // Network hiccup — fall through to the dashboard; RouteAccessGuard
          // will re-check and handle it from there.
        }

        if (!active) return;
        void ignoreNavigationAbort(router.replace(redirectTo));
      } catch (err) {
        if (!active) return;
        await fallBackToGuest(err instanceof SessionCheckTimeoutError);
      }
    })();

    return () => {
      active = false;
    };
  }, [redirectTo, router, fromPasswordFlow]);

  // Belt-and-braces: never leave the user on the checking spinner indefinitely.
  useEffect(() => {
    if (fromPasswordFlow || screen !== "checking") return;

    const timer = setTimeout(() => {
      setScreen((current) => {
        if (current !== "checking") return current;
        toast.error("Session check timed out. Please sign in again.");
        void supabase.auth.signOut().catch(() => {});
        return "guest";
      });
    }, SESSION_CHECK_HARD_LIMIT_MS);

    return () => clearTimeout(timer);
  }, [fromPasswordFlow, screen]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  if (screen === "checking") {
    return <LoginSpinner />;
  }

  const onSubmit = async (data: LoginForm) => {
    // signInWithPassword() normally resolves to { error } even on failure,
    // but a genuine network/DNS blip reaching Supabase can make the
    // underlying fetch throw instead. react-hook-form's handleSubmit()
    // doesn't catch rejections from this handler, so an uncaught throw here
    // surfaced directly in the console as a raw "TypeError: Load failed" —
    // this try/catch turns that into a normal, user-facing toast instead.
    let signInError: { message: string } | null = null;
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      signInError = error;
    } catch {
      toast.error(
        "Could not reach the login server. Check your connection and try again.",
      );
      return;
    }

    if (signInError) {
      toast.error(signInError.message);
      return;
    }

    try {
      const block = await checkStaffAccountBlock();
      if (block) {
        await supabase.auth.signOut();
        toast.error(staffAuthBlockMessage(block));
        return;
      }
    } catch {
      await supabase.auth.signOut();
      toast.error("Could not verify your account. Try again.");
      return;
    }

    void ignoreNavigationAbort(router.replace(redirectTo));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 w-full max-w-sm space-y-4"
      >
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Staff login</h1>
          <p className="text-sm text-gray-500 mt-1">
            Wills Farms management portal
          </p>
        </div>

        {(passwordReset || passwordSetup) && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
            {passwordReset
              ? "Your password was updated. Sign in with your new password."
              : "Your account is ready. Sign in with your email and password."}
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@willsfarms.com"
            {...register("email")}
            className={inputClass}
          />
          {errors.email && (
            <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="text-xs font-semibold text-gray-500 uppercase tracking-wide"
            >
              Password
            </label>
          </div>
          <Controller
            name="password"
            control={control}
            render={({ field }) => (
              <PasswordInput
                id="password"
                value={field.value}
                onChange={field.onChange}
                placeholder="Password"
                autoComplete="current-password"
              />
            )}
          />
          {errors.password && (
            <p className="text-sm text-red-600 mt-1">
              {errors.password.message}
            </p>
          )}
        </div>
        <Link
          href="/forgot-password"
          className="text-xs font-medium text-[#C62828] hover:underline"
        >
          Forgot password?
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-[#C62828] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSpinner />}>
      <LoginForm />
    </Suspense>
  );
}
