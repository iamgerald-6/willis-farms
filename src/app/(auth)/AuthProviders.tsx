"use client";

import { AppNavigationProvider } from "@/lib/navigation/appNavigation";

export default function AuthProviders({ children }: { children: React.ReactNode }) {
  return <AppNavigationProvider>{children}</AppNavigationProvider>;
}
