"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type Props = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Optional back link shown above the eyebrow, e.g. back to job postings. */
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
};

export function FormShell({ eyebrow, title, subtitle, backHref, backLabel, children }: Props) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-5">
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-700 mb-3"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {backLabel ?? "Back"}
            </Link>
          )}
          <div className="flex items-center gap-3">
            <Image
              src="/brand/logo.svg"
              alt="Wills Farms Ltd."
              width={40}
              height={40}
              className="shrink-0"
            />
            <div>
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                {eyebrow}
              </p>
              <h1 className="text-lg font-bold text-gray-900">{title}</h1>
              {subtitle && (
                <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}

export function usePreventBrowserBack(active = true) {
  useEffect(() => {
    if (!active) return;
    window.history.pushState(null, "", window.location.href);
    const onPopState = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active]);
}
