"use client";

import { useState } from "react";
import { KeyRound, User } from "lucide-react";
import ProfileSection from "./components/ProfileSection";
import ChangePasswordSection from "./components/ChangePasswordSection";

type SettingsTab = "profile" | "password";

const TABS: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "password", label: "Change password", icon: KeyRound },
];

export default function AccountSettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("profile");

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Account Settings</h2>
        <p className="text-sm text-gray-500 mt-1">
          View your profile and update your password.
        </p>
      </div>

      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit flex-wrap">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === id
                ? "bg-red-600 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "profile" ? <ProfileSection /> : <ChangePasswordSection />}
    </div>
  );
}
