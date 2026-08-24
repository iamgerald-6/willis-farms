"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { User } from "@/types";
import { useDispatch } from "react-redux";
import { addUser } from "@/app/features/userSlice";
import type { AppDispatch } from "@/app/store";
import { QueryObserverResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { useGradeLevelsConfig } from "@/hooks/useGradeLevelsConfig";

const userSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  role: z.enum(["admin", "manager", "employee"]),
  company_id: z.string().min(1, "Company ID is required"),
  job_position: z.string().optional(),
  grade_level: z.string().regex(/^L\d+$/, "Select a valid grade level"),
});

type UserForm = z.infer<typeof userSchema>;

type OnboardedCandidate = {
  application_id: string;
  full_name: string;
  reference_number: string;
  prefill: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    job_position: string;
    grade_level?: string;
    company_id?: string;
    supervisor_id?: string;
  };
  locked_fields: string[];
};

interface Props {
  open: boolean;
  setOpen: (val: boolean) => void;
  refetch: () => Promise<QueryObserverResult<User[], unknown>>;
}

const inputClass =
  "w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500";

const lockedClass =
  "w-full border border-gray-200 p-2.5 rounded-lg text-sm bg-gray-50 text-gray-700 cursor-not-allowed";

export default function CreateUserModal({ open, setOpen, refetch }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const queryClient = useQueryClient();
  const { gradeOptions: gradeLevels } = useGradeLevelsConfig();
  const [selectedOnboardingId, setSelectedOnboardingId] = useState("");
  const [lockedFields, setLockedFields] = useState<Set<string>>(new Set());
  const [pendingSupervisorId, setPendingSupervisorId] = useState<string | null>(
    null,
  );

  const { data: onboardedCandidates = [], isLoading: loadingCandidates } =
    useQuery({
      queryKey: ["onboarded-invite-candidates"],
      queryFn: async () => {
        const res = await api.get("/careers/onboarding/invite-candidates");
        return res.data.data as OnboardedCandidate[];
      },
      enabled: open,
    });

  async function createUser(data: UserForm) {
    const res = await api.post("/create_user", {
      ...data,
      supervisor_id: pendingSupervisorId ?? undefined,
    });
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

  const resetForm = () => {
    setSelectedOnboardingId("");
    setLockedFields(new Set());
    setPendingSupervisorId(null);
    reset({ role: "employee" });
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const applyOnboardedCandidate = (applicationId: string) => {
    setSelectedOnboardingId(applicationId);

    if (!applicationId) {
      setLockedFields(new Set());
      setPendingSupervisorId(null);
      reset({ role: "employee" });
      return;
    }

    const candidate = onboardedCandidates.find(
      (c) => c.application_id === applicationId,
    );
    if (!candidate) return;

    const { prefill, locked_fields } = candidate;
    setLockedFields(new Set(locked_fields));
    setPendingSupervisorId(prefill.supervisor_id ?? null);

    reset({
      first_name: prefill.first_name,
      last_name: prefill.last_name,
      email: prefill.email,
      phone: prefill.phone || undefined,
      job_position: prefill.job_position || undefined,
      company_id: prefill.company_id || "",
      grade_level: (prefill.grade_level as UserForm["grade_level"]) || undefined,
      role: "employee",
    });
  };

  // Re-apply prefill when the onboarded list refreshes (e.g. after HR saves Section O).
  useEffect(() => {
    if (!open || loadingCandidates || !selectedOnboardingId) return;
    applyOnboardedCandidate(selectedOnboardingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loadingCandidates, onboardedCandidates, selectedOnboardingId]);

  const fieldClass = (name: string) =>
    lockedFields.has(name) ? lockedClass : inputClass;

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
      resetForm();
      setOpen(false);
      refetch();
      queryClient.invalidateQueries({
        queryKey: ["onboarded-invite-candidates"],
      });
      toast.success(
        `Invite sent to ${variables.email}! They'll receive an email to set their password.`,
      );
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
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
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Select onboarded candidate (optional)
              </label>
              <select
                value={selectedOnboardingId}
                onChange={(e) => applyOnboardedCandidate(e.target.value)}
                disabled={loadingCandidates}
                className={`${inputClass} bg-white text-gray-700`}
              >
                <option value="">
                  {loadingCandidates
                    ? "Loading onboarded candidates…"
                    : onboardedCandidates.length === 0
                      ? "No onboarded candidates awaiting invite"
                      : "— Enter manually or select from onboarding —"}
                </option>
                {onboardedCandidates.map((c) => (
                  <option key={c.application_id} value={c.application_id}>
                    {c.full_name} · {c.reference_number}
                    {c.prefill.company_id ? ` · ${c.prefill.company_id}` : ""}
                    {c.prefill.email ? ` · ${c.prefill.email}` : ""}
                  </option>
                ))}
              </select>
              {selectedOnboardingId && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Pre-filled from onboarding HR fields — company email and employee ID from
                  Section O. You can edit the email before sending the invite.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  placeholder="First Name"
                  readOnly={lockedFields.has("first_name")}
                  {...register("first_name")}
                  className={fieldClass("first_name")}
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
                  readOnly={lockedFields.has("last_name")}
                  {...register("last_name")}
                  className={fieldClass("last_name")}
                />
                {errors.last_name && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.last_name.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <input
                type="email"
                placeholder="Company email @willsfarms.com"
                {...register("email")}
                className={inputClass}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                {selectedOnboardingId
                  ? "From onboarding HR — this is the address the invite is sent to. Edit if needed."
                  : "Work email for the WillsOne account invite."}
              </p>
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            <input
              type="text"
              placeholder="Phone Number (optional)"
              readOnly={lockedFields.has("phone")}
              {...register("phone")}
              className={fieldClass("phone")}
            />

            <div>
              <input
                type="text"
                placeholder="Employee ID (e.g. WF7-042)"
                readOnly={lockedFields.has("company_id")}
                {...register("company_id")}
                className={fieldClass("company_id")}
              />
              {selectedOnboardingId && (
                <p className="text-[11px] text-gray-500 mt-1">
                  From onboarding HR employee ID — used as the company ID on their account.
                </p>
              )}
              {errors.company_id && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.company_id.message}
                </p>
              )}
            </div>

            <input
              type="text"
              placeholder="Job Position (optional)"
              readOnly={lockedFields.has("job_position")}
              {...register("job_position")}
              className={fieldClass("job_position")}
            />

            <div>
              <select
                {...register("grade_level")}
                disabled={lockedFields.has("grade_level")}
                className={`${fieldClass("grade_level")} bg-white text-gray-700 disabled:cursor-not-allowed`}
              >
                <option value="">Grade Level</option>
                {gradeLevels.map((g) => (
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

            <div>
              <select
                {...register("role")}
                className={`${inputClass} bg-white`}
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
