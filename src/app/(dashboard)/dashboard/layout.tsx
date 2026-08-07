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

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      } else {
        setAuthChecked(true);
      }
    });
  }, [pathname, router]);

  return (
    <html>
      <head>
        <link rel="icon" href="/brand/logo.svg" />
        <title>Wills Farms Management</title>
      </head>
      <body>
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
      </body>
    </html>
  );
}
