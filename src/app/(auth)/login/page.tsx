"use client";

import { Suspense, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type LoginForm = z.infer<typeof loginSchema>;

// ── Reads the ?redirect param so it must live inside <Suspense> ──────────────
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Only allow internal paths to prevent open-redirect attacks
  const raw = searchParams.get("redirect") ?? "";
  const redirectTo = raw.startsWith("/") ? raw : "/dashboard";

  // If already logged in, skip the login screen
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(redirectTo);
    });
  }, [redirectTo, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    try {
      const res = await api.get("/me");
      if (res.data?.is_disabled) {
        await supabase.auth.signOut();
        alert("Your account has been disabled. Contact an administrator.");
        return;
      }
    } catch {
      // If /me fails, RouteAccessGuard will still enforce on dashboard
    }

    router.push(redirectTo);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white p-6 rounded shadow w-full max-w-sm space-y-4"
      >
        <h1 className="text-xl font-semibold text-center">Login</h1>

        <div>
          <input
            {...register("email")}
            placeholder="Email"
            className="w-full border p-2 rounded"
          />
          {errors.email && (
            <p className="text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <input
            type="password"
            {...register("password")}
            placeholder="Password"
            className="w-full border p-2 rounded"
          />
          {errors.password && (
            <p className="text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-[#C62828] text-white py-2 rounded"
        >
          {isSubmitting ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#C62828]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
