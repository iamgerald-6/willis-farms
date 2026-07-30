"use client";

import { User } from "@/types";

export default function OwnerSelect({
  users,
  value,
  onChange,
}: {
  users: User[];
  value: string | null;
  onChange: (userId: string) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border-2 border-red-600 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none"
    >
      <option value="" disabled>
        Select owner…
      </option>
      {users.map((u) => (
        <option key={u.user_id} value={u.user_id}>
          {u.first_name} {u.last_name}
        </option>
      ))}
    </select>
  );
}
