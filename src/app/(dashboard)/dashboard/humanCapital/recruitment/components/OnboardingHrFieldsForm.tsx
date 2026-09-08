"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import {
  resolveOnboardingHrFields,
  type OnboardingHrFieldDef,
} from "@/lib/careers/onboardingHrFormSchema";
import {
  ONBOARDING_DEPARTMENTS_LIST,
  ONBOARDING_LOCATIONS_LIST,
  RECRUITMENT_MODULE_ID,
} from "@/lib/systemDefinitions/onboardingDefaults";
import {
  ONBOARDING_EMPLOYMENT_TYPES_LIST,
  ONBOARDING_HR_FIELDS_LIST,
  ONBOARDING_PAY_FREQUENCIES_LIST,
} from "@/lib/systemDefinitions/onboardingHrDefaults";
import { validateGrossSalaryAgainstBand } from "@/lib/systemDefinitions/salaryRanges";
import { useCompanyEmailDomain } from "@/hooks/useCompanyEmailDomain";
import {
  joinCompanyEmail,
  splitCompanyEmail,
} from "@/lib/systemDefinitions/companyEmailDomain";
import { isSupervisoryRoleLabel } from "@/lib/userRoleAccessControl";
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
  /** When set, only these field keys are rendered (offer tab subset). */
  includeFieldKeys?: string[];
  /** Field keys omitted from Section O (e.g. review-only fields). */
  excludeFieldKeys?: string[];
  /** Field keys shown read-only (e.g. after offer terms saved). */
  readOnlyFields?: string[];
  /** Hide helper text under fields (offer tab). */
  hideFieldHints?: boolean;
};

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
        {value || "—"}
      </div>
    </label>
  );
}

export default function OnboardingHrFieldsForm({
  hrData,
  setHrData,
  onGradeChange,
  onEmployeeIdChange,
  onCompanyEmailChange,
  includeFieldKeys,
  excludeFieldKeys = [],
  readOnlyFields = [],
  hideFieldHints = false,
}: OnboardingHrFieldsFormProps) {
  const readOnlySet = useMemo(() => new Set(readOnlyFields), [readOnlyFields]);
  const shouldShowHint = (hint?: string) => Boolean(!hideFieldHints && hint?.trim());
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
      const lists = [ONBOARDING_EMPLOYMENT_TYPES_LIST, ONBOARDING_PAY_FREQUENCIES_LIST] as const;
      const [entries, orgLists] = await Promise.all([
        Promise.all(
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
        ),
        // Work location / Department are live from the Organizational
        // Structure Sites / Departments catalog, not a hand-typed list —
        // see fetchOnboardingSiteAndDepartmentLabels.
        api.get("/careers/onboarding/org-lists"),
      ]);
      const out = Object.fromEntries(entries) as Record<string, string[]>;
      out[ONBOARDING_LOCATIONS_LIST] = orgLists.data?.data?.sites ?? [];
      out[ONBOARDING_DEPARTMENTS_LIST] = orgLists.data?.data?.departments ?? [];
      return out;
    },
  });

  const { domain: companyEmailDomain } = useCompanyEmailDomain();
  const salaryGhsTouched = useRef(false);

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  // Assigned supervisor is scoped to whoever currently holds the "Reporting
  // to" role/title picked above — not a grade-based lookup — since HR is
  // choosing which specific person (among possibly several with the same
  // title) this hire will actually report to. Only currently-employed staff
  // (not disabled) are eligible.
  const eligibleSupervisors = useMemo(() => {
    const roleTitle = hrData.reporting_to?.trim();
    if (!roleTitle) return [];
    return allUsers
      .filter((u) => !u.is_disabled && u.job_position?.trim() === roleTitle)
      .sort((a, b) => {
        const nameA = `${a.first_name} ${a.last_name}`.trim();
        const nameB = `${b.first_name} ${b.last_name}`.trim();
        return nameA.localeCompare(nameB);
      });
  }, [allUsers, hrData.reporting_to]);

  // Clear supervisor when the reporting-to role changes and current pick is
  // no longer among the people holding that role.
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

  const departmentOptions = optionLists?.[ONBOARDING_DEPARTMENTS_LIST] ?? [];

  // Real position titles currently held by staff with the Supervisory Role
  // User role — not the recruitment job-postings catalog, since "Reporting
  // to" should reflect who's actually in the org today, not a hypothetical
  // opening. Onboarding only ever assigns a new hire's supervisor to someone
  // with Supervisory Role (narrower than Manage User's pool, which also
  // allows Executive Role / Human Resource) — see
  // canBeAssignedAsSupervisorAtOnboardingByRoleLabel. HR picks the
  // applicable one per offer.
  const reportingToOptions = useMemo(() => {
    const titles = allUsers
      .filter((u) => !u.is_disabled && isSupervisoryRoleLabel(u.user_role_label))
      .map((u) => u.job_position?.trim())
      .filter((title): title is string => Boolean(title));
    return [...new Set(titles)].sort((a, b) => a.localeCompare(b));
  }, [allUsers]);

  const locationOptions = optionLists?.[ONBOARDING_LOCATIONS_LIST] ?? [];
  const employmentTypeOptions = optionLists?.[ONBOARDING_EMPLOYMENT_TYPES_LIST] ?? [];
  const payFrequencyOptions = optionLists?.[ONBOARDING_PAY_FREQUENCIES_LIST] ?? [];

  const excludeSet = useMemo(() => new Set(excludeFieldKeys), [excludeFieldKeys]);

  const fieldAllowed = (fieldKey: string) =>
    !excludeSet.has(fieldKey) &&
    (!includeFieldKeys || includeFieldKeys.includes(fieldKey));

  const placementFields = hrFields.filter(
    (f) => f.group === "placement" && fieldAllowed(f.fieldKey),
  );
  const hrGroupFields = hrFields.filter(
    (f) => f.group === "hr" && fieldAllowed(f.fieldKey),
  );
  const notesFields = hrFields.filter(
    (f) => f.group === "notes" && fieldAllowed(f.fieldKey),
  );

  const setField = (key: string, value: string | undefined) => {
    setHrData((prev) => ({ ...prev, [key]: value }));
  };

  const renderField = (field: OnboardingHrFieldDef) => {
    const key = field.fieldKey as keyof OnboardingHrData;
    const value = String(hrData[key] ?? "");
    const spanClass = field.colSpan === "full" ? "sm:col-span-2" : "";

    if (readOnlySet.has(field.fieldKey)) {
      return (
        <div key={field.id} className={spanClass}>
          <ReadOnlyValue label={field.label} value={value} />
        </div>
      );
    }

    if (
      field.fieldType === "supervisor" ||
      field.fieldKey === "supervisor_id" ||
      (field.fieldKey === "supervisor_name" && field.fieldType === "text")
    ) {
      const selectedId = hrData.supervisor_id ?? "";
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          {!hrData.reporting_to?.trim() ? (
            <p className="mt-1 text-xs text-amber-600 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              Select who this hire reports to first to see who currently holds that role.
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
                  ? "No one currently holds that role"
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
          {shouldShowHint(field.hint) && (
            <p className="text-[11px] text-gray-400 mt-1">{field.hint}</p>
          )}
        </label>
      );
    }

    if (field.fieldType === "grade_level") {
      // Grade level now always comes from the application's linked job
      // posting (see resolveOfferTermsFromPosting / postingLockedFields in
      // OfferTermsPanel) — every posting requires one. This form no longer
      // offers a manual L1–L7 select; a legacy application with nothing set
      // just shows a plain notice instead of letting HR pick from the old
      // "Grade levels & linked roles" system.
      return (
        <div key={field.id} className={spanClass}>
          {hrData.grade_level ? (
            <ReadOnlyValue label={field.label} value={hrData.grade_level} />
          ) : (
            <label className="block">
              <span className="text-xs text-gray-500">{field.label}</span>
              <p className="mt-1 text-xs text-amber-600 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                Not set on the linked job posting — add a Grade level there.
              </p>
            </label>
          )}
        </div>
      );
    }

    if (field.fieldType === "salary_tier") {
      // Same as grade level — sourced from the posting's own Salary field
      // (see resolveOfferTermsFromPosting), never manually picked here.
      return (
        <div key={field.id} className={spanClass}>
          {hrData.salary_tier ? (
            <ReadOnlyValue label={field.label} value={hrData.salary_tier} />
          ) : (
            <label className="block">
              <span className="text-xs text-gray-500">{field.label}</span>
              <p className="mt-1 text-xs text-amber-600 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                Not set on the linked job posting — add a Salary there.
              </p>
              {shouldShowHint(field.hint) && (
                <p className="text-[11px] text-gray-400 mt-1">{field.hint}</p>
              )}
            </label>
          )}
        </div>
      );
    }

    if (field.fieldType === "salary_range") {
      // Sourced exclusively from the linked job posting's Salary field.
      // Left blank (no legacy grade-tier substitution) when the posting
      // has no salary band.
      const rangeText = hrData.salary_range?.trim() || "";
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <div className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {rangeText || "Not set on the linked job posting."}
          </div>
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

    if (field.fieldType === "reporting_to") {
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <select
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            value={hrData.reporting_to ?? ""}
            onChange={(e) => setField("reporting_to", e.target.value || undefined)}
          >
            <option value="">
              {reportingToOptions.length === 0
                ? "No senior staff positions found"
                : "Select who this hire reports to…"}
            </option>
            {reportingToOptions.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </select>
          {shouldShowHint(field.hint) && (
            <p className="text-[11px] text-gray-400 mt-1">{field.hint}</p>
          )}
        </label>
      );
    }

    if (field.fieldType === "pay_frequency") {
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <select
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            value={hrData.pay_frequency ?? ""}
            onChange={(e) => setField("pay_frequency", e.target.value || undefined)}
          >
            <option value="">Select pay frequency…</option>
            {payFrequencyOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {shouldShowHint(field.hint) && (
            <p className="text-[11px] text-gray-400 mt-1">{field.hint}</p>
          )}
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
          <span className="text-xs text-gray-500">
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <textarea
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            rows={3}
            value={value}
            required={field.required}
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

    if (field.fieldKey === "company_email") {
      const { local } = splitCompanyEmail(value, companyEmailDomain);
      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <div className="mt-1 flex w-full items-stretch overflow-hidden rounded-lg border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-red-500">
            <input
              className="min-w-0 flex-1 border-0 px-3 py-2 text-sm focus:outline-none focus:ring-0"
              value={local}
              placeholder="l.akoto"
              onChange={(e) => {
                onCompanyEmailChange?.();
                const nextLocal = e.target.value.replace(/@.*/g, "").toLowerCase();
                setField(
                  "company_email",
                  joinCompanyEmail(nextLocal, companyEmailDomain) || undefined,
                );
              }}
            />
            <span className="flex shrink-0 items-center border-l border-gray-100 bg-gray-50/80 px-3 py-2 text-sm italic text-gray-400 select-none">
              @{companyEmailDomain}
            </span>
          </div>
          {shouldShowHint(field.hint) && (
            <p className="text-[11px] text-gray-400 mt-1">{field.hint}</p>
          )}
        </label>
      );
    }

    if (field.fieldKey === "salary_ghs") {
      // The posting's own Salary field (salary_band_min/max) is the sole
      // source of truth for a validation band. If the posting has no band,
      // there's nothing to validate against — skip band validation rather
      // than falling back to the old grade-level pay-tier table.
      const hasPostingBand = hrData.salary_band_min != null || hrData.salary_band_max != null;
      const bandCheck = hasPostingBand
        ? validateGrossSalaryAgainstBand(value, hrData.salary_band_min, hrData.salary_band_max)
        : { valid: true, message: null };
      const bandText = hrData.salary_range?.trim() || "";

      return (
        <label key={field.id} className={`block ${spanClass}`}>
          <span className="text-xs text-gray-500">{field.label}</span>
          <input
            type="text"
            inputMode="decimal"
            className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white ${
              value.trim() && !bandCheck.valid
                ? "border-red-300 focus:ring-red-200"
                : "border-gray-200"
            }`}
            value={value}
            placeholder="Enter gross salary"
            onChange={(e) => {
              salaryGhsTouched.current = true;
              setField("salary_ghs", e.target.value);
            }}
          />
          {bandText && (
            <p className="text-[11px] text-gray-500 mt-1">
              Must be within {bandText}
            </p>
          )}
          {value.trim() && !bandCheck.valid && bandCheck.message && (
            <p className="text-[11px] text-red-600 mt-1">{bandCheck.message}</p>
          )}
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
            setField(field.fieldKey, e.target.value);
          }}
        />
        {shouldShowHint(field.hint) && <p className="text-[11px] text-gray-400 mt-1">{field.hint}</p>}
      </label>
    );
  };

  return (
    <>
      {includeFieldKeys ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[...placementFields, ...hrGroupFields, ...notesFields]
            .sort(
              (a, b) =>
                includeFieldKeys.indexOf(a.fieldKey) -
                includeFieldKeys.indexOf(b.fieldKey),
            )
            .map(renderField)}
        </div>
      ) : (
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
      )}
    </>
  );
}
