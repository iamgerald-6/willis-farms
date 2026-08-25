"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import { ignoreNavigationAbort } from "@/lib/navigation/safeNavigation";
import { hasLocalSupabaseSession } from "@/lib/auth/hasLocalSupabaseSession";
import PasswordInput, { inputClass } from "../components/PasswordInput";
import { staffAuthBlockMessage, type StaffAuthBlockReason } from "@/lib/staffAccount";

const LoginSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-100">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#C62828]" />
  </div>
);

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

  // "checking": might already be signed in, hold off rendering the form.
  // "guest": confirmed no session — safe to show the form immediately.
  const [screen, setScreen] = useState<"checking" | "guest">(
    fromPasswordFlow || !hasLocalSupabaseSession() ? "guest" : "checking",
  );

  useEffect(() => {
    if (fromPasswordFlow) return;
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) {
        void ignoreNavigationAbort(router.replace(redirectTo));
      } else {
        setScreen("guest");
      }
    });
    return () => {
      active = false;
    };
  }, [redirectTo, router, fromPasswordFlow]);

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
      const res = await api.get("/me");
      const block = res.data?.auth_block as StaffAuthBlockReason | null | undefined;

      if (!res.data?.staff_account_exists) {
        await supabase.auth.signOut();
        toast.error(staffAuthBlockMessage("not_found"));
        return;
      }
      if (block === "disabled" || res.data?.is_disabled) {
        await supabase.auth.signOut();
        toast.error(staffAuthBlockMessage("disabled"));
        return;
      }
      if (block === "pending" || !res.data?.email_verified) {
        await supabase.auth.signOut();
        toast.error(staffAuthBlockMessage("pending"));
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
