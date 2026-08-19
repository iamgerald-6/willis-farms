"use client";

import { Suspense } from "react";
import ApplySuccessPage from "./ApplySuccessPage";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
          Loading…
        </div>
      }
    >
      <ApplySuccessPage />
    </Suspense>
  );
}
