"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
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
import { isValidName, sanitizeNameInput } from "@/lib/validation";
import { useGradeLevelsConfig } from "@/hooks/useGradeLevelsConfig";
import { useCompanyEmailDomain } from "@/hooks/useCompanyEmailDomain";
import {
  joinCompanyEmail,
  splitCompanyEmail,
} from "@/lib/systemDefinitions/companyEmailDomain";

const userSchema = z.object({
  first_name: z
    .string()
    .min(1, "First name is required")
    .refine(isValidName, "First name must contain letters only"),
  last_name: z
    .string()
    .min(1, "Last name is required")
    .refine(isValidName, "Last name must contain letters only"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  role: z.enum(["admin", "manager", "employee"]),
  company_id: z.string().min(1, "Company ID is required"),
  job_position: z.string().optional(),
  grade_level: z.string().min(1, "Select a valid grade level"),
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
    delivery_email: string;
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
  const { domain: companyEmailDomain } = useCompanyEmailDomain();
  const [selectedOnboardingId, setSelectedOnboardingId] = useState("");
  const [inviteDeliveryEmail, setInviteDeliveryEmail] = useState("");
  const [deliveryEmailError, setDeliveryEmailError] = useState("");
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
      application_id: selectedOnboardingId || undefined,
      invite_delivery_email: inviteDeliveryEmail || undefined,
    });
    return res.data;
  }

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { role: "employee" },
  });

  const resetForm = () => {
    setSelectedOnboardingId("");
    setInviteDeliveryEmail("");
    setDeliveryEmailError("");
    setLockedFields(new Set());
    setPendingSupervisorId(null);
    reset({ role: "employee" });
  };

  const isManualInvite = !selectedOnboardingId;

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const applyOnboardedCandidate = (applicationId: string) => {
    setSelectedOnboardingId(applicationId);

    if (!applicationId) {
      setLockedFields(new Set());
      setPendingSupervisorId(null);
      setInviteDeliveryEmail("");
      reset({ role: "employee" });
      return;
    }

    const candidate = onboardedCandidates.find(
      (c) => c.application_id === applicationId,
    );
    if (!candidate) return;

    const { prefill, locked_fields } = candidate;
    setLockedFields(
      new Set([...locked_fields, "first_name", "last_name", "company_id", "email"]),
    );
    setPendingSupervisorId(prefill.supervisor_id ?? null);
    setInviteDeliveryEmail(prefill.delivery_email ?? "");

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

  const watchedEmail = watch("email");
  const watchedFirstName = watch("first_name");
  const watchedLastName = watch("last_name");
  const watchedCompanyId = watch("company_id");
  const emailLocal = splitCompanyEmail(watchedEmail, companyEmailDomain).local;
  const emailLocked = lockedFields.has("email");

  const { data: suggestedFields } = useQuery({
    queryKey: [
      "invite-suggest-fields",
      watchedFirstName?.trim(),
      watchedLastName?.trim(),
    ],
    queryFn: async () => {
      const res = await api.get("/create_user/suggest-fields", {
        params: {
          first_name: watchedFirstName?.trim() ?? "",
          last_name: watchedLastName?.trim() ?? "",
        },
      });
      return res.data.data as {
        employee_id: string;
        company_email: string | null;
      };
    },
    enabled: open && isManualInvite,
  });

  useEffect(() => {
    if (!open || !isManualInvite || !suggestedFields) return;

    if (suggestedFields.employee_id) {
      setValue("company_id", suggestedFields.employee_id, {
        shouldValidate: true,
      });
    }
    if (suggestedFields.company_email) {
      setValue("email", suggestedFields.company_email, {
        shouldValidate: true,
      });
    }
  }, [open, isManualInvite, suggestedFields, setValue]);

  const { data: existingUsers = [] } = useQuery({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data as User[];
    },
    enabled: open,
  });

  const emailTaken = useMemo(() => {
    const normalized = watchedEmail?.trim().toLowerCase();
    if (!normalized) return false;
    return existingUsers.some((user) => user.email.trim().toLowerCase() === normalized);
  }, [existingUsers, watchedEmail]);

  const regenerateUsername = async () => {
    if (!watchedFirstName?.trim() || !watchedLastName?.trim()) {
      toast.error("Enter first and last name first.");
      return;
    }

    try {
      const res = await api.get("/create_user/suggest-fields", {
        params: {
          first_name: watchedFirstName.trim(),
          last_name: watchedLastName.trim(),
        },
      });
      const company_email = res.data.data?.company_email as string | null;
      if (company_email) {
        setValue("email", company_email, { shouldValidate: true });
        toast.success("Username regenerated.");
      } else {
        toast.error("Could not suggest a username — check first and last name.");
      }
    } catch {
      toast.error("Could not regenerate username.");
    }
  };

  const companyIdTaken = useMemo(() => {
    const normalized = watchedCompanyId?.trim().toUpperCase();
    if (!normalized || !isManualInvite) return false;
    return existingUsers.some(
      (user) => user.company_id?.trim().toUpperCase() === normalized,
    );
  }, [existingUsers, watchedCompanyId, isManualInvite]);

  const deliveryEmailInvalid = useMemo(() => {
    if (!isManualInvite || !inviteDeliveryEmail.trim()) return false;
    return !z.string().email().safeParse(inviteDeliveryEmail.trim()).success;
  }, [inviteDeliveryEmail, isManualInvite]);

  const fieldClass = (name: string) =>
    lockedFields.has(name) ? lockedClass : inputClass;

  const bindNameField = (name: "first_name" | "last_name") => {
    const registration = register(name);
    return {
      ...registration,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        const cleaned = sanitizeNameInput(e.target.value);
        e.target.value = cleaned;
        registration.onChange(e);
      },
    };
  };

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
      queryClient.invalidateQueries({
        queryKey: ["recruitment-employees"],
      });
      toast.success(
        `Invite sent${inviteDeliveryEmail ? ` to ${inviteDeliveryEmail}` : ""}! They sign in with ${variables.email} after setting their password.`,
      );
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      const message =
        error?.response?.data?.error ?? "Server error. Please try again.";
      toast.error(message);
    },
  });

  const onSubmit = (data: UserForm) => {
    if (isManualInvite) {
      const delivery = inviteDeliveryEmail.trim();
      if (!delivery) {
        setDeliveryEmailError("Personal email is required to send the invite.");
        return;
      }
      if (!z.string().email().safeParse(delivery).success) {
        setDeliveryEmailError("Enter a valid personal email address.");
        return;
      }
      setDeliveryEmailError("");
    }
    mutate(data);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-xl shadow-lg w-[480px] max-h-[90vh] overflow-y-auto">
          <Dialog.Title className="text-lg font-bold text-gray-900 mb-1">
            Invite New User
          </Dialog.Title>
          <p className="text-sm text-gray-500 mb-6">
            {isManualInvite
              ? "For users not on onboarding: enter their personal email for delivery. A company login username and employee ID are generated automatically."
              : "For new hires from onboarding: the set-password invite goes to their application email; they sign in with their company username from HR."}
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
                  Pre-filled from onboarding — WillsOne username from Section O company
                  email. The set-password invite goes to their job application email.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  placeholder="First Name"
                  readOnly={lockedFields.has("first_name")}
                  {...bindNameField("first_name")}
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
                  {...bindNameField("last_name")}
                  className={fieldClass("last_name")}
                />
                {errors.last_name && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.last_name.message}
                  </p>
                )}
              </div>
            </div>

            {isManualInvite && (
              <div>
                <input
                  type="email"
                  placeholder="Personal email (invite delivery)"
                  value={inviteDeliveryEmail}
                  onChange={(e) => {
                    setInviteDeliveryEmail(e.target.value);
                    if (deliveryEmailError) setDeliveryEmailError("");
                  }}
                  className={inputClass}
                />
                {(deliveryEmailError || deliveryEmailInvalid) && (
                  <p className="text-red-500 text-xs mt-1">
                    {deliveryEmailError ||
                      "Enter a valid personal email address."}
                  </p>
                )}
              </div>
            )}

            <div>
              <input type="hidden" {...register("email")} />
              <div className="flex gap-2">
                <div
                  className={`flex min-w-0 flex-1 items-stretch overflow-hidden rounded-lg border border-gray-200 ${
                    emailLocked
                      ? "bg-gray-50"
                      : "bg-white focus-within:ring-2 focus-within:ring-red-500"
                  }`}
                >
                  <input
                    type="text"
                    placeholder="l.akoto"
                    readOnly={emailLocked}
                    value={emailLocal}
                    onChange={(e) => {
                      const nextLocal = e.target.value
                        .replace(/@.*/g, "")
                        .toLowerCase();
                      setValue(
                        "email",
                        joinCompanyEmail(nextLocal, companyEmailDomain) || "",
                        { shouldValidate: true },
                      );
                    }}
                    className={`min-w-0 flex-1 border-0 px-3 py-2.5 text-sm focus:outline-none focus:ring-0 ${
                      emailLocked ? "bg-gray-50 text-gray-700 cursor-not-allowed" : ""
                    }`}
                  />
                  <span className="flex shrink-0 items-center border-l border-gray-100 bg-gray-50/80 px-3 py-2.5 text-sm italic text-gray-400 select-none">
                    @{companyEmailDomain}
                  </span>
                </div>
                {isManualInvite && (
                  <button
                    type="button"
                    onClick={regenerateUsername}
                    className="shrink-0 px-3 py-2.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Regenerate
                  </button>
                )}
              </div>
              {selectedOnboardingId && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Login username (company email). Set-password invite goes to{" "}
                  {inviteDeliveryEmail || "their application email"}.
                </p>
              )}
              {emailTaken && (
                <p className="text-amber-700 text-xs mt-1">
                  This username is already taken — edit it or regenerate.
                </p>
              )}
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
              {selectedOnboardingId ? (
                <p className="text-[11px] text-gray-500 mt-1">
                  From onboarding HR employee ID — used as the company ID on their account.
                </p>
              ) : (
                <p className="text-[11px] text-gray-500 mt-1">
                  Auto-generated employee ID — same sequence as HR onboarding. Edit if needed.
                </p>
              )}
              {companyIdTaken && (
                <p className="text-amber-700 text-xs mt-1">
                  This employee ID is already in use — choose another.
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
              disabled={
                isPending ||
                emailTaken ||
                companyIdTaken ||
                deliveryEmailInvalid ||
                (isManualInvite && !inviteDeliveryEmail.trim())
              }
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
