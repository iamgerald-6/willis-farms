"use client";

import { useEffect } from "react";
import { isNavigationAbortError } from "@/lib/navigation/safeNavigation";

/** Prevents dev overlay noise when back/forward cancels in-flight fetches. */
export default function NavigationAbortGuard() {
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isNavigationAbortError(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () =>
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);
  return null;
}
