import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

const skillLogSchema = z.object({
  employee_id: z.string().uuid("Please select a valid user"),
  section_name: z.string().min(2, "Section name is required"),
  skill_name: z.string().min(3, "Skill description is required"),
  signoff_stage: z.enum([
    "Observed",
    "Performed Under Supervision",
    "Performed Consistently to Standard",
  ]),
  proficiency_level: z.number().min(1).max(5),
  comments: z.string().optional(),
});

type SkillLogFormValues = z.infer<typeof skillLogSchema>;

interface User {
  id: string;
  name: string;
  grade_level: number;
}

interface Props {
  currentUser: User; // The active user filling out the form
  allUsers: User[]; // Population array for the selection dropdown
  onSuccessCallback?: () => void;
}

export const SkillLogForm: React.FC<Props> = ({
  currentUser,
  allUsers,
  onSuccessCallback,
}) => {
  const queryClient = useQueryClient();

  // Guardrail: Fail early if a Grade 1 or 2 tries to render this form
  if (currentUser.grade_level < 3) {
    return (
      <div className="bg-red-50 border-l-4 border-[#C62828] p-4 rounded text-sm text-red-900 font-medium">
        Access Denied: Only staff at Grade Level 3 or above can sign off
        technical logs.
      </div>
    );
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SkillLogFormValues>({
    resolver: zodResolver(skillLogSchema),
    defaultValues: {
      signoff_stage: "Observed",
      proficiency_level: 3,
    },
  });

  const { mutate: submitSkillLog, isPending } = useMutation({
    mutationFn: async (values: SkillLogFormValues) => {
      if (values.employee_id === currentUser.id) {
        throw new Error(
          "Self-validation blocked. You cannot evaluate your own skills log.",
        );
      }

      const response = await axios.post("/api/skill-logs/create", {
        ...values,
        supervisor_id: currentUser.id,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-logs"] });
      reset();
      if (onSuccessCallback) onSuccessCallback();
    },
    onError: (err: any) => {
      alert(err.message || "Failed to record sign-off entry");
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => submitSkillLog(data))}
      className="bg-white border-t-4 border-[#C62828] shadow-md rounded-lg p-6 max-w-2xl mx-auto"
    >
      <div className="mb-6 border-b pb-2">
        <h2 className="text-xl font-bold text-gray-900">
          Wills Farms Breeding Operations
        </h2>
        <p className="text-sm text-[#C62828] font-medium">
          Technical Skills Verification Panel
        </p>
      </div>

      {/* Target User Dropdown */}
      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Select User to Evaluate
        </label>
        <select
          {...register("employee_id")}
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-[#C62828]"
        >
          <option value="">-- Select Team Member --</option>
          {allUsers.map((u) => (
            <option key={u.id} value={u.id} disabled={u.id === currentUser.id}>
              {u.name} (Grade {u.grade_level}){" "}
              {u.id === currentUser.id ? "- Self (Blocked)" : ""}
            </option>
          ))}
        </select>
        {errors.employee_id && (
          <p className="text-[#C62828] text-xs mt-1">
            {errors.employee_id.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Operational Section
          </label>
          <select
            {...register("section_name")}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-[#C62828]"
          >
            <option value="">-- Select Section --</option>
            <option value="GP Breeding & Farrowing">
              GP Breeding & Farrowing
            </option>
            <option value="Feed Preparation">
              Feed Preparation (Milling & Mixing)
            </option>
            <option value="Daily Barn Cleaning">
              Daily Barn Cleaning & Sanitation
            </option>
            <option value="Herd Health & Biosecurity">
              Herd Health & Biosecurity Protocol
            </option>
          </select>
          {errors.section_name && (
            <p className="text-[#C62828] text-xs mt-1">
              {errors.section_name.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Sign-Off Stage
          </label>
          <select
            {...register("signoff_stage")}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-[#C62828]"
          >
            <option value="Observed">1. Observed</option>
            <option value="Performed Under Supervision">
              2. Performed Under Supervision
            </option>
            <option value="Performed Consistently to Standard">
              3. Performed Consistently to Standard
            </option>
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Skill / Competency Observed
        </label>
        <input
          type="text"
          placeholder="e.g., Safely administers scheduled clinical doses"
          {...register("skill_name")}
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-[#C62828]"
        />
        {errors.skill_name && (
          <p className="text-[#C62828] text-xs mt-1">
            {errors.skill_name.message}
          </p>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Proficiency Rating (1 - 5 Scale)
        </label>
        <div className="flex gap-4 items-center mt-1">
          {[1, 2, 3, 4, 5].map((num) => (
            <label key={num} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                value={num}
                {...register("proficiency_level", { valueAsNumber: true })}
                className="accent-[#C62828]"
              />
              <span className="text-sm font-medium text-gray-700">{num}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Supervisor Comments
        </label>
        <textarea
          rows={3}
          placeholder="Add operational notes or specific feedback..."
          {...register("comments")}
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-[#C62828]"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="bg-[#C62828] text-white font-semibold px-6 py-2 rounded shadow hover:bg-red-800 transition duration-150 disabled:bg-gray-400"
        >
          {isPending ? "Submitting..." : "Finalize Sign-Off Log Entry"}
        </button>
      </div>
    </form>
  );
};
