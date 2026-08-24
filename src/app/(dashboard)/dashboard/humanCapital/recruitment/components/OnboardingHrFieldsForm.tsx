"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import {
  resolveOnboardingHrFields,
  type OnboardingHrFieldDef,
} from "@/lib/careers/onboardingHrFormSchema";
import { gradeLevelToRank } from "@/lib/careers/hrEmployeeDefaults";
import {
  ONBOARDING_DEPARTMENTS_L1L6_LIST,
  ONBOARDING_DEPARTMENTS_L7_LIST,
  ONBOARDING_LOCATIONS_LIST,
  RECRUITMENT_MODULE_ID,
} from "@/lib/systemDefinitions/onboardingDefaults";
import {
  ONBOARDING_EMPLOYMENT_TYPES_LIST,
  ONBOARDING_HR_FIELDS_LIST,
} from "@/lib/systemDefinitions/onboardingHrDefaults";
import { useGradeLevelsConfig } from "@/hooks/useGradeLevelsConfig";
import {
  eligibleSupervisorsForEmployee,
} from "@/lib/supervisorAssignment";
import type { SystemOption } from "@/lib/systemDefinitions";
import type { User } from "@/types";

function toDateInputValue(value: string | undefined | null): string {
  if (!value?.trim()) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

type OnboardingHrFieldsFormProps = {
  hrData: OnboardingHrData;
  setHrData: React.Dispatch<React.SetStateAction<OnboardingHrData>>;
  onGradeChange?: () => void;
  onEmployeeIdChange?: () => void;
  onCompanyEmailChange?: () => void;
};

export default function OnboardingHrFieldsForm({
  hrData,
  setHrData,
  onGradeChange,
  onEmployeeIdChange,
  onCompanyEmailChange,
}: OnboardingHrFieldsFormProps) {
  const { data: hrFields = [] } = useQuery({
    queryKey: ["onboarding-hr-fields"],
    queryFn: async () => {
      const res = await api.get("/system-definitions/options", {
        params: {
          module_id: RECRUITMENT_MODULE_ID,
          option_list: ONBOARDING_HR_FIELDS_LIST,
        },
      });
      return resolveOnboardingHrFields((res.data.data ?? []) as SystemOption[]);
    },
  });

  const { data: optionLists } = useQuery({
    queryKey: ["onboarding-hr-option-lists"],
    queryFn: async () => {
      const lists = [
        ONBOARDING_LOCATIONS_LIST,
        ONBOARDING_DEPARTMENTS_L1L6_LIST,
        ONBOARDING_DEPARTMENTS_L7_LIST,
        ONBOARDING_EMPLOYMENT_TYPES_LIST,
      ] as const;
      const entries = await Promise.all(
        lists.map(async (option_list) => {
          const res = await api.get("/system-definitions/options", {
            params: { module_id: RECRUITMENT_MODULE_ID, option_list },
          });
          const rows = (res.data.data ?? []) as { label: string; is_active?: boolean }[];
          return [
            option_list,
            rows.filter((o) => o.is_active !== false).map((o) => o.label),
          ] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, string[]>;
    },
  });

  const { config: gradeConfig, gradeOptions } = useGradeLevelsConfig();

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const employeeGradeStub = useMemo(
    () => ({
      user_id: "pending",
      role: "employee" as const,
      grade_level: hrData.grade_level ?? null,
    }),
    [hrData.grade_level],
  );

  const eligibleSupervisors = useMemo(() => {
    if (!hrData.grade_level) return [];
    return eligibleSupervisorsForEmployee(
      employeeGradeStub,
      allUsers,
      gradeConfig,
    );
  }, [allUsers, employeeGradeStub, gradeConfig, hrData.grade_level]);

  // Clear supervisor when grade changes and current pick is no longer valid.
  useEffect(() => {
    if (!hrData.supervisor_id) return;
    const stillValid = eligibleSupervisors.some(
      (u) => u.user_id === hrData.supervisor_id,
    );
    if (!stillValid) {
      setHrData((prev) => ({
        ...prev,
        supervisor_id: undefined,
        supervisor_name: undefined,
      }));
    }
  }, [eligibleSupervisors, hrData.supervisor_id, setHrData]);

  const departmentOptions = useMemo(() => {
    const lists = optionLists ?? {};
    const rank = gradeLevelToRank(hrData.grade_level, gradeConfig ?? undefined);
    if (rank != null && rank >= 7) {
      return lists[ONBOARDING_DEPARTMENTS_L7_LIST] ?? [];
    }
    return lists[ONBOARDING_DEPARTMENTS_L1L6_LIST] ?? [];
  }, [hrData.grade_level, optionLists, gradeConfig]);

  const locationOptions = optionLists?.[ONBOARDING_LOCATIONS_LIST] ?? [];
  const employmentTypeOptions = optionLists?.[ONBOARDING_EMPLOYMENT_TYPES_LIST] ?? [];

  const placementFields = hrFields.filter((f) => f.group === "placement");
  const hrGroupFields = hrFields.filter((f) => f.group === "hr");
  const notesFields = hrFields.filter((f) => f.group === "notes");

  const setField = (key: string, value: string | undefined) => {
    setHrData((prev) => ({ ...prev, [key]: value }));
  };

  const renderField = (field: OnboardingHrFieldDef) => {
    const key = field.fieldKey as keyof OnboardingHrData;
    const value = String(hrData[key] ?? "");
    const spanClass = field.colSpan === "full" ? "sm:col-span-2" : "";

    if (
      field.fieldType === "supervisor" ||
      field.fieldKey === "supervisor_id" ||
      (field.fieldKey === "supervisor_name" && field.fieldType === "text")
    ) {
      const selectedId = hrData.supervisor_id ?? "";
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          {!hrData.grade_level ? (
            <p className="mt-1 text-xs text-amber-600 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              Select a grade level first to see eligible supervisors.
            </p>
          ) : (
            <select
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              value={selectedId}
              onChange={(e) => {
                const sup = eligibleSupervisors.find(
                  (u) => u.user_id === e.target.value,
                );
                setHrData((prev) => ({
                  ...prev,
                  supervisor_id: sup?.user_id,
                  supervisor_name: sup
                    ? `${sup.first_name} ${sup.last_name}`.trim()
                    : undefined,
                }));
              }}
            >
              <option value="">
                {eligibleSupervisors.length === 0
                  ? "No eligible supervisors for this grade"
                  : "Select supervisor…"}
              </option>
              {eligibleSupervisors.map((sup) => (
                <option key={sup.user_id} value={sup.user_id}>
                  {sup.first_name} {sup.last_name}
                  {sup.grade_level ? ` (${sup.grade_level})` : ""}
                </option>
              ))}
            </select>
          )}
          {field.hint && (
            <p className="text-[11px] text-gray-400 mt-1">{field.hint}</p>
          )}
        </label>
      );
    }

    if (field.fieldType === "grade_level") {
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <select
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            value={hrData.grade_level ?? ""}
            onChange={(e) => {
              onGradeChange?.();
              setHrData((prev) => ({ ...prev, grade_level: e.target.value || undefined }));
            }}
          >
            <option value="">Select grade level…</option>
            {gradeOptions.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.fieldType === "department") {
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <select
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            value={hrData.department ?? ""}
            onChange={(e) => setField("department", e.target.value || undefined)}
          >
            <option value="">Select department…</option>
            {departmentOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.fieldType === "employment_type") {
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <select
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            value={hrData.employment_type ?? ""}
            onChange={(e) => setField("employment_type", e.target.value || undefined)}
          >
            <option value="">Select employment type…</option>
            {employmentTypeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.fieldType === "work_location") {
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <select
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            value={hrData.work_location ?? ""}
            onChange={(e) => setField("work_location", e.target.value || undefined)}
          >
            <option value="">Select work location…</option>
            {locationOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.fieldType === "date") {
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <input
            type="date"
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={toDateInputValue(value)}
            onChange={(e) => setField(field.fieldKey, e.target.value || undefined)}
          />
        </label>
      );
    }

    if (field.fieldType === "textarea") {
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <textarea
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            rows={3}
            value={value}
            onChange={(e) => setField(field.fieldKey, e.target.value)}
          />
        </label>
      );
    }

    if (field.fieldType === "select") {
      const opts = field.options ?? [];
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <select
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            value={value}
            onChange={(e) => setField(field.fieldKey, e.target.value || undefined)}
          >
            <option value="">Select…</option>
            {opts.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
    }

    return (
      <label key={field.id} className={`block ${spanClass}`}>
        <span className="text-xs text-gray-500">{field.label}</span>
        <input
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={value}
          onChange={(e) => {
            if (field.fieldKey === "employee_id") onEmployeeIdChange?.();
            if (field.fieldKey === "company_email") onCompanyEmailChange?.();
            setField(field.fieldKey, e.target.value);
          }}
        />
        {field.hint && <p className="text-[11px] text-gray-400 mt-1">{field.hint}</p>}
      </label>
    );
  };

  return (
    <>
      {placementFields.length > 0 && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-800">Employment placement</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {placementFields.map(renderField)}
          </div>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {hrGroupFields.map(renderField)}
      </div>
      {notesFields.map((field) => (
        <div key={field.id} className="mt-3">
          {renderField(field)}
        </div>
      ))}
    </>
  );
}
