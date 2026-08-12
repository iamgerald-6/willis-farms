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
import { supabase } from "@/lib/supabaseClient";

const AUTH_PATHS = ["/login", "/forgot-password", "/set-password"];
const STACK_LIMIT = 50;

type AppNavigationContextValue = {
  goBack: (fallback?: string) => void;
};

const AppNavigationContext = createContext<AppNavigationContextValue | null>(
  null,
);

function isAuthPath(path: string): boolean {
  return AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

async function authRedirectTarget(path: string): Promise<string | null> {
  if (!isAuthPath(path)) return null;

  // /set-password is driven entirely by the one-time token in its own URL, not
  // by the browser session, so it validates itself.
  if (path.startsWith("/set-password")) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  return "/dashboard";
}

export function AppNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const stackRef = useRef<string[]>([]);
  const previousPathRef = useRef<string | null>(null);
  const skipStackPushRef = useRef(false);
  const pinnedPathRef = useRef<string>("");

  useEffect(() => {
    const current = pathname ?? "/";
    pinnedPathRef.current = current;

    if (previousPathRef.current === null) {
      previousPathRef.current = current;
    } else if (previousPathRef.current !== current) {
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

    window.history.pushState({ appNav: true }, "", window.location.href);
  }, [pathname]);

  useEffect(() => {
    const onPopState = () => {
      const stayOn = pinnedPathRef.current;
      window.history.pushState({ appNav: true }, "", stayOn);
      router.replace(stayOn);

      void (async () => {
        const redirect = await authRedirectTarget(stayOn);
        if (redirect && redirect !== stayOn) {
          pinnedPathRef.current = redirect;
          window.history.replaceState({ appNav: true }, "", redirect);
          router.replace(redirect);
        }
      })();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      const stayOn = pinnedPathRef.current;
      router.replace(stayOn);
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

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
