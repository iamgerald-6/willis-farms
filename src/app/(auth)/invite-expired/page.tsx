"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function ExpiredLinkCard() {
  const searchParams = useSearchParams();
  const isRecovery = searchParams?.get("type") === "recovery";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow w-full max-w-md text-center">
        <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-6">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {isRecovery ? "Reset link expired" : "Invite link expired"}
        </h1>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          {isRecovery
            ? "This password reset link is no longer valid. Reset links can only be opened once, and they expire after a short time."
            : "This invite link is no longer valid. It may have already been used or has expired after 24 hours."}
        </p>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left mb-6">
          <p className="text-sm text-red-700 font-medium mb-1">
            What to do next
          </p>
          <p className="text-sm text-red-600 leading-relaxed">
            {isRecovery
              ? "Request a new reset link below. Open the newest email — older reset links stop working as soon as a new one is sent."
              : "Contact your administrator and ask them to resend your invite. A fresh link will be sent to your email."}
          </p>
        </div>

        {isRecovery ? (
          <Link
            href="/forgot-password"
            className="block w-full bg-[#C62828] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Request a new reset link
          </Link>
        ) : (
          <Link
            href="/login"
            className="block w-full bg-[#C62828] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Back to login
          </Link>
        )}

        <p className="text-xs text-gray-400 mt-6">Wills Farms · Staff Portal</p>
      </div>
    </div>
  );
}

export default function InviteExpiredPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#C62828]" />
        </div>
      }
    >
      <ExpiredLinkCard />
    </Suspense>
  );
}
