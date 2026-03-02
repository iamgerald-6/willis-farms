"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return;
      }

      setEmail(data.user.email ?? null);
      setRole(data.user.user_metadata?.role ?? null);
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  if (loading) return <p>Loading...</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {role === "super_admin" && (
        <>
          <div className="bg-white shadow rounded p-4">Total Users</div>
          <div className="bg-white shadow rounded p-4">Recent Uploads</div>
          <div className="bg-white shadow rounded p-4">Notifications</div>
        </>
      )}
      {role === "user" && (
        <>
          <div className="bg-white shadow rounded p-4">Learning Content</div>
          <div className="bg-white shadow rounded p-4">Available Forms</div>
        </>
      )}
    </div>
  );
}
