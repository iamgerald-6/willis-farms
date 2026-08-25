"use client";
import "../../../app/globals.css";
import { ReactNode, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Sidebar from "@/components/Sidebar";
import NavbarDashboard from "@/components/NavbarDashboard";
import QueryProvider from "@/components/QueryProvider";
import ReduxProvider from "@/components/Provider";
import RouteAccessGuard from "@/components/RouteAccessGuard";
import { AuthLayoutSkeleton } from "@/components/skeletons/PageSkeletons";
import { Toaster } from "sonner";
import { AppNavigationProvider } from "@/lib/navigation/appNavigation";
import { ignoreNavigationAbort } from "@/lib/navigation/safeNavigation";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (!session) {
        void ignoreNavigationAbort(
          router.replace(`/login?redirect=${encodeURIComponent(pathname ?? "")}`),
        );
      } else {
        setAuthChecked(true);
      }
    });
    return () => {
      active = false;
    };
  }, [pathname, router]);

  return (
    <html>
      <head>
        <link rel="icon" href="/brand/logo.svg" />
        <title>Wills Farms Management</title>
      </head>
      <body>
        <AppNavigationProvider>
          {!authChecked ? (
            <AuthLayoutSkeleton />
          ) : (
            <ReduxProvider>
              <QueryProvider>
                <Toaster richColors position="top-center" />
                <div className="flex min-h-screen md:h-screen md:overflow-hidden bg-gray-50">
                  <Sidebar
                    mobileOpen={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                  />
                  <div className="flex-1 flex flex-col md:ml-64 min-h-screen md:h-screen md:pt-0">
                    <NavbarDashboard onMenuClick={() => setMobileOpen(true)} />
                    <main className="flex-1 overflow-y-auto bg-gray-50">
                      <RouteAccessGuard>{children}</RouteAccessGuard>
                    </main>
                  </div>
                </div>
              </QueryProvider>
            </ReduxProvider>
          )}
        </AppNavigationProvider>
      </body>
    </html>
  );
}
