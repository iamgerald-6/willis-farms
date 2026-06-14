"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { User } from "@/types";
import { useDispatch } from "react-redux";
import { addUser } from "@/app/features/userSlice";
import type { AppDispatch } from "@/app/store";
import { QueryObserverResult } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";

const userSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  role: z.enum(["admin", "manager", "employee"]),
  company_id: z.string().min(1, "Company ID is required"),
  job_position: z.string().optional(),
  grade_level: z.enum(["L1", "L2", "L3", "L4", "L5", "L6", "L7"]),
});

type UserForm = z.infer<typeof userSchema>;

interface Props {
  open: boolean;
  setOpen: (val: boolean) => void;
  refetch: () => Promise<QueryObserverResult<User[], unknown>>;
}

const GRADE_LEVELS = [
  { value: "L1", label: "L1 – Junior Swine Technician" },
  { value: "L2", label: "L2 – Swine Technician" },
  { value: "L3", label: "L3 – Senior Swine Technician" },
  { value: "L4", label: "L4 – Herd Supervisor/Manager" },
  { value: "L5", label: "L5 – Assistant Farm Manager – Breeding" },
  { value: "L6", label: "L6 – Breeding Farm Manager" },
  { value: "L7", label: "L7 – Operations/Production Manager" },
];

export default function CreateUserModal({ open, setOpen, refetch }: Props) {
  const dispatch = useDispatch<AppDispatch>();

  async function createUser(data: UserForm) {
    const res = await api.post("/create_user", data);
    return res.data;
  }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { role: "employee" },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: createUser,
    onSuccess: (result, variables) => {
      const newUser: User = {
        id: result.data.id,
        user_id: result.data.user_id,
        email: variables.email,
        phone: variables.phone ?? null,
        role: variables.role,
        first_name: variables.first_name,
        last_name: variables.last_name,
        company_id: variables.company_id,
        grade_level: variables.grade_level ?? null,
        job_position: variables.job_position ?? null,
        created_at: new Date().toISOString(),
      };
      dispatch(addUser(newUser));
      reset();
      setOpen(false);
      refetch();
      toast.success(
        `Invite sent to ${variables.email}! They'll receive an email to set their password.`
      );
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error ?? "Server error. Please try again.";
      toast.error(message);
    },
  });

  const onSubmit = (data: UserForm) => mutate(data);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-xl shadow-lg w-[480px] max-h-[90vh] overflow-y-auto">
          <Dialog.Title className="text-lg font-bold text-gray-900 mb-1">
            Invite New User
          </Dialog.Title>
          <p className="text-sm text-gray-500 mb-6">
            An invite email will be sent. The user sets their own password via
            the link.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  placeholder="First Name"
                  {...register("first_name")}
                  className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                {errors.first_name && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.first_name.message}
                  </p>
                )}
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Last Name"
                  {...register("last_name")}
                  className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                {errors.last_name && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.last_name.message}
                  </p>
                )}
              </div>
            </div>

            {/* Email */}
            <div>
              <input
                type="email"
                placeholder="Email Address"
                {...register("email")}
                className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Phone */}
            <input
              type="text"
              placeholder="Phone Number (optional)"
              {...register("phone")}
              className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />

            {/* Company ID */}
            <div>
              <input
                type="text"
                placeholder="Employee ID"
                {...register("company_id")}
                className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {errors.company_id && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.company_id.message}
                </p>
              )}
            </div>

            {/* Job Position */}
            <input
              type="text"
              placeholder="Job Position (optional)"
              {...register("job_position")}
              className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />

            <div>
              <select
                {...register("grade_level")}
                className="w-full border border-gray-200 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-700"
              >
                <option value="">Grade Level</option>
                {GRADE_LEVELS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
              {errors.grade_level && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.grade_level.message}
                </p>
              )}
            </div>

            {/* Role */}
            <div>
              <select
                {...register("role")}
                className="w-full border border-gray-200 p-2.5 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
              {errors.role && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.role.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex items-center justify-center bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {isPending ? "Sending Invite..." : "Send Invite"}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
