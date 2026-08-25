"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import NavigationAbortGuard from "@/components/NavigationAbortGuard";

const STACK_LIMIT = 50;

type AppNavigationContextValue = {
  /** In-app back only — does not block the browser back button. */
  goBack: (fallback?: string) => void;
};

const AppNavigationContext = createContext<AppNavigationContextValue | null>(
  null,
);

/**
 * Tracks in-app navigation so dashboard "Back" buttons can return to the
 * previous screen. Browser back/forward is left to normal history — we do
 * not intercept popstate or push extra history entries.
 */
export function AppNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const stackRef = useRef<string[]>([]);
  const previousPathRef = useRef<string | null>(null);
  const skipStackPushRef = useRef(false);

  useEffect(() => {
    const current = pathname ?? "/";

    if (previousPathRef.current === null) {
      previousPathRef.current = current;
      return;
    }

    if (previousPathRef.current !== current) {
      if (!skipStackPushRef.current) {
        stackRef.current.push(previousPathRef.current);
        if (stackRef.current.length > STACK_LIMIT) {
          stackRef.current.shift();
        }
      } else {
        skipStackPushRef.current = false;
      }
      previousPathRef.current = current;
    }
  }, [pathname]);

  const goBack = useCallback(
    (fallback = "/dashboard") => {
      const target = stackRef.current.pop() ?? fallback;
      skipStackPushRef.current = true;
      router.push(target);
    },
    [router],
  );

  return (
    <AppNavigationContext.Provider value={{ goBack }}>
      <NavigationAbortGuard />
      {children}
    </AppNavigationContext.Provider>
  );
}

export function useAppNavigation(): AppNavigationContextValue {
  const ctx = useContext(AppNavigationContext);
  if (!ctx) {
    throw new Error("useAppNavigation must be used within AppNavigationProvider");
  }
  return ctx;
}
