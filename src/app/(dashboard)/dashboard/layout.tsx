import "../../../app/globals.css";
import { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import NavbarDashboard from "@/components/NavbarDashboard";
import QueryProvider from "@/components/QueryProvider";
import ReduxProvider from "@/components/Provider";
import { Toaster } from "sonner";
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <ReduxProvider>
          <QueryProvider>
            <Toaster richColors position="top-center" />
            <div className="flex h-screen">
              <Sidebar />
              <div className="flex-1 flex flex-col">
                <NavbarDashboard />
                <main className="flex-1 p-6 bg-gray-100">{children}</main>
              </div>
            </div>
          </QueryProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
