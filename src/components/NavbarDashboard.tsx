"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react"; // optional icon library

export default function NavbarDashboard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleDropdown = () => setOpen(!open);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="flex justify-between items-center bg-white shadow p-4 relative">
      <h1 className="text-lg font-bold">Employee Dashboard</h1>

      <div className="flex items-center space-x-4">
        {/* Notification Icon */}
        <div className="relative cursor-pointer">
          <Bell className="w-6 h-6 text-gray-700" />
          {/* Red badge */}
          <span className="absolute top-0 right-0 block w-2 h-2 rounded-full bg-red-600 ring-1 ring-white"></span>
        </div>

        {/* Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={toggleDropdown}
            className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center hover:ring-2 hover:ring-[#C62828]"
          >
            <span className="font-bold text-gray-700">G</span>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-48 bg-white border shadow rounded z-50">
              <button
                className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                onClick={() => alert("Go to Account Settings")}
              >
                Account
              </button>
              <button
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
