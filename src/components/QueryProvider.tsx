"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // The QueryClient is a single long-lived instance shared across the whole
  // app, so it survives client-side navigation from /login to /dashboard —
  // logging out and back in as a DIFFERENT user in the same tab does not
  // remount this provider. Without this, any query cached under a key that
  // doesn't itself encode the viewer (e.g. ["tm-tasks", projectId]) can
  // briefly — or, if the new session never refetches it, persistently —
  // show the previous user's data to the next person who logs in. Clearing
  // everything on every sign-in/sign-out closes that gap: each session
  // starts from an empty cache and only ever populates it with requests
  // made under its own auth token.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        queryClient.clear();
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
