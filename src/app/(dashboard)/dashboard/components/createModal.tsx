"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Plus } from "lucide-react";
import { User } from "@/types";
import { useDispatch } from "react-redux";
import { addUser } from "@/app/features/userSlice";
import type { AppDispatch } from "@/app/store";
import { QueryObserverResult } from "@tanstack/react-query";

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["employee", "admin", "super_admin"]),
  phone: z.string().optional(),
});

type UserForm = z.infer<typeof userSchema>;

interface Props {
  open: boolean;
  setOpen: (val: boolean) => void;
  refetch: () => Promise<QueryObserverResult<User[], unknown>>;
}

export default function CreateUserModal({ open, setOpen, refetch }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dispatch = useDispatch<AppDispatch>();

  const { register, handleSubmit, reset } = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { role: "employee" },
  });

  const onSubmit = async (data: UserForm) => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/create_user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (result.error) {
        setMessage(result.error);
      } else {
        // ✅ Dispatch directly to Redux
        const newUser: User = {
          id: result.data.user?.id,
          email: data.email,
          phone: data.phone ?? null,
          role: data.role,
          created_at: new Date().toISOString(),
        };
        dispatch(addUser(newUser)); // update global state

        reset({ email: "", password: "", role: "employee", phone: "" });
        setMessage("User created!");
        setOpen(false);
        refetch();
      }
    } catch (err) {
      setMessage("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded shadow w-96">
          <Dialog.Title className="text-lg font-bold mb-4">
            Create New User
          </Dialog.Title>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              {...register("email")}
              className="w-full border p-2 rounded"
            />
            <input
              type="password"
              placeholder="Password"
              {...register("password")}
              className="w-full border p-2 rounded"
            />
            <input
              type="text"
              placeholder="Phone Number"
              {...register("phone")}
              className="w-full border p-2 rounded"
            />
            <select
              {...register("role")}
              className="w-full border p-2 rounded bg-gray-100"
            >
              <option value="employee">Employee</option>
              <option value="admin" disabled className="text-gray-400">
                Admin (Coming Soon)
              </option>
            </select>

            <button
              type="submit"
              className="w-full flex items-center justify-center bg-red-600 text-white py-2 rounded hover:bg-red-700"
              disabled={loading}
            >
              <Plus className="w-4 h-4 mr-1" />{" "}
              {loading ? "Creating..." : "Create User"}
            </button>

            {message && <p className="text-center mt-2">{message}</p>}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
