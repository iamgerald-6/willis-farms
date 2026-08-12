"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { inputClass } from "../components/PasswordInput";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

type ForgotForm = z.infer<typeof schema>;

export default function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<ForgotForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: ForgotForm) => {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: data.email.trim().toLowerCase() }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(body.error ?? "Could not send reset email.");
      return;
    }

    setSent(true);
    toast.success("Password reset email sent.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 w-full max-w-md">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>

        <div className="">
          <h1 className="text-2xl font-bold text-gray-900">Forgot password</h1>
        </div>

        {sent ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              A password reset link was sent to{" "}
              <span className="font-medium text-gray-900">
                {getValues("email")}
              </span>
              . Check your inbox and spam folder.
            </p>
            <p className="text-xs text-gray-400">
              After setting a new password you will need to sign in again.
            </p>
            <Link
              href="/login"
              className="inline-block text-sm font-medium text-[#C62828] hover:underline"
            >
              Return to login
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-6">
              Enter your login email. Only active staff accounts can reset a
              password here. If you have not finished setting up your account,
              contact your administrator to resend your setup email.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
                >
                  Login email
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
                  <p className="text-sm text-red-600 mt-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#C62828] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {isSubmitting ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
