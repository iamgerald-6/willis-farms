"use client";

import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white shadow-md h-screen p-6 flex flex-col">
      <h2 className="text-2xl font-bold mb-6 text-[#C62828]">Dashboard</h2>

      <nav className="flex flex-col space-y-3">
        <Link href="/dashboard" className="hover:bg-gray-100 p-2 rounded">
          Overview
        </Link>
        <Link
          href="/dashboard/training"
          className="hover:bg-gray-100 p-2 rounded"
        >
          Training
        </Link>
        <Link href="/dashboard/users" className="hover:bg-gray-100 p-2 rounded">
          Users
        </Link>

        <Link
          href="/dashboard/content"
          className="hover:bg-gray-100 p-2 rounded"
        >
          Content
        </Link>
        <Link
          href="/dashboard/notifications"
          className="hover:bg-gray-100 p-2 rounded"
        >
          Notifications
        </Link>
      </nav>
    </aside>
  );
}
