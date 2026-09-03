import type { SystemOption } from "./types";
import { RECRUITMENT_MODULE_ID } from "./recruitmentDefaults";

export const ONBOARDING_HR_FIELDS_LIST = "careers.onboardingHrFields";
export const ONBOARDING_EMPLOYMENT_TYPES_LIST = "careers.onboardingEmploymentTypes";
export const ONBOARDING_PAY_FREQUENCIES_LIST = "careers.payFrequencies";

export type OnboardingHrFieldGroup = "placement" | "hr" | "notes";

export type OnboardingHrFieldType =
  | "text"
  | "date"
  | "textarea"
  | "select"
  | "grade_level"
  | "department"
  | "employment_type"
  | "work_location"
  | "supervisor"
  | "salary_tier"
  | "salary_range"
  | "pay_frequency"
  | "reporting_to";

function hrField(
  id: string,
  label: string,
  fieldKey: string,
  sortOrder: number,
  rules: Record<string, unknown>,
): SystemOption {
  return {
    id,
    module_id: RECRUITMENT_MODULE_ID,
    option_list: ONBOARDING_HR_FIELDS_LIST,
    label,
    legacy_value: fieldKey,
    sort_order: sortOrder,
    is_active: true,
    rules: rules as SystemOption["rules"],
  };
}

/** Git defaults for HR Section O fields (not shown on candidate onboarding link). */
export function getDefaultOnboardingHrFields(): SystemOption[] {
  return [
    hrField(
      "opt:recruitment:hr:position_title",
      "Position title",
      "position_title",
      0,
      { fieldKey: "position_title", fieldType: "text", group: "placement", required: false },
    ),
    hrField(
      "opt:recruitment:hr:department",
      "Department / division",
      "department",
      1,
      { fieldKey: "department", fieldType: "department", group: "placement", required: false },
    ),
    hrField(
      "opt:recruitment:hr:employment_type",
      "Employment type",
      "employment_type",
      2,
      { fieldKey: "employment_type", fieldType: "employment_type", group: "placement", required: false },
    ),
    hrField(
      "opt:recruitment:hr:work_location",
      "Farm site / work location",
      "work_location",
      3,
      { fieldKey: "work_location", fieldType: "work_location", group: "placement", required: false },
    ),
    hrField(
      "opt:recruitment:hr:reporting_to",
      "Reporting to",
      "reporting_to",
      4,
      {
        fieldKey: "reporting_to",
        fieldType: "reporting_to",
        group: "placement",
        required: true,
        hint: "Position title of the manager this hire reports to — drawn from staff currently holding a manager/admin/super-admin role.",
      },
    ),
    hrField(
      "opt:recruitment:hr:grade_level",
      "Grade / level",
      "grade_level",
      10,
      { fieldKey: "grade_level", fieldType: "grade_level", group: "hr", required: false, colSpan: "full" },
    ),
    hrField(
      "opt:recruitment:hr:employee_id",
      "Employee ID assigned",
      "employee_id",
      11,
      {
        fieldKey: "employee_id",
        fieldType: "text",
        group: "hr",
        hint: "Company-wide sequential ID — e.g. WF-00042",
      },
    ),
    hrField(
      "opt:recruitment:hr:company_email",
      "Company email assigned",
      "company_email",
      12,
      {
        fieldKey: "company_email",
        fieldType: "text",
        group: "hr",
        hint: "e.g. l.akoto or m.oofuso — first initial, optional middle initial, then surname",
      },
    ),
    hrField(
      "opt:recruitment:hr:salary_tier",
      "Salary tier",
      "salary_tier",
      13,
      {
        fieldKey: "salary_tier",
        fieldType: "salary_tier",
        group: "hr",
      },
    ),
    hrField(
      "opt:recruitment:hr:supervisor_id",
      "Assigned supervisor",
      "supervisor_id",
      14,
      {
        fieldKey: "supervisor_id",
        fieldType: "supervisor",
        group: "hr",
        hint: "Pick from staff who can supervise this grade (L4+ and strictly senior). Set grade level first.",
      },
    ),
    hrField(
      "opt:recruitment:hr:salary_ghs",
      "Gross salary (GHS)",
      "salary_ghs",
      15,
      {
        fieldKey: "salary_ghs",
        fieldType: "text",
        group: "hr",
      },
    ),
    hrField(
      "opt:recruitment:hr:pay_frequency",
      "Pay frequency",
      "pay_frequency",
      16,
      {
        fieldKey: "pay_frequency",
        fieldType: "pay_frequency",
        group: "hr",
      },
    ),
    hrField(
      "opt:recruitment:hr:fitness_determination",
      "Fitness determination",
      "fitness_determination",
      17,
      { fieldKey: "fitness_determination", fieldType: "text", group: "hr" },
    ),
    hrField(
      "opt:recruitment:hr:start_date",
      "Start date",
      "start_date",
      17.5,
      {
        fieldKey: "start_date",
        fieldType: "date",
        group: "hr",
        required: true,
        hint: "Effective employment start date — used throughout the offer letter as both the appointment date and Position Details start date.",
      },
    ),
    hrField(
      "opt:recruitment:hr:notice_period",
      "Notice period",
      "notice_period",
      19,
      {
        fieldKey: "notice_period",
        fieldType: "text",
        group: "hr",
        required: true,
        hint: "e.g. \"3 months\" — used in the offer letter's Terms of Employment clause.",
      },
    ),
    hrField(
      "opt:recruitment:hr:working_hours",
      "Working hours",
      "working_hours",
      20,
      {
        fieldKey: "working_hours",
        fieldType: "text",
        group: "hr",
        required: true,
        hint: "e.g. \"40 hours per week, Monday to Sunday with one day off duty.\"",
      },
    ),
    hrField(
      "opt:recruitment:hr:acceptance_deadline",
      "Offer acceptance deadline",
      "acceptance_deadline",
      21,
      { fieldKey: "acceptance_deadline", fieldType: "date", group: "hr", required: true },
    ),
    hrField(
      "opt:recruitment:hr:basic_salary_ghs",
      "Basic salary (GHS)",
      "basic_salary_ghs",
      22,
      { fieldKey: "basic_salary_ghs", fieldType: "text", group: "hr", required: true },
    ),
    hrField(
      "opt:recruitment:hr:housing_allowance",
      "Housing allowance",
      "housing_allowance",
      23,
      {
        fieldKey: "housing_allowance",
        fieldType: "text",
        group: "hr",
        required: true,
        hint: "Amount, or how it's provided — e.g. \"Provided by the Company upon signing a Housing Agreement.\"",
      },
    ),
    hrField(
      "opt:recruitment:hr:medical_allowance",
      "Medical allowance",
      "medical_allowance",
      24,
      { fieldKey: "medical_allowance", fieldType: "text", group: "hr", required: true },
    ),
    hrField(
      "opt:recruitment:hr:social_security_contribution",
      "Social security contribution",
      "social_security_contribution",
      25,
      {
        fieldKey: "social_security_contribution",
        fieldType: "text",
        group: "hr",
        required: true,
        hint: "SSNIT deduction amount for Annex 1 of the offer letter.",
      },
    ),
    hrField(
      "opt:recruitment:hr:income_tax",
      "Income tax",
      "income_tax",
      26,
      { fieldKey: "income_tax", fieldType: "text", group: "hr", required: true },
    ),
    hrField(
      "opt:recruitment:hr:net_payable",
      "Net payable",
      "net_payable",
      27,
      { fieldKey: "net_payable", fieldType: "text", group: "hr", required: true },
    ),
    hrField(
      "opt:recruitment:hr:medical_referral_issued",
      "Medical referral issued on",
      "medical_referral_issued",
      18,
      { fieldKey: "medical_referral_issued", fieldType: "date", group: "hr" },
    ),
    hrField(
      "opt:recruitment:hr:salary_range",
      "Salary band",
      "salary_range",
      29,
      {
        fieldKey: "salary_range",
        fieldType: "salary_range",
        group: "notes",
        colSpan: "full",
      },
    ),
    hrField(
      "opt:recruitment:hr:hr_notes",
      "HR notes",
      "hr_notes",
      31,
      { fieldKey: "hr_notes", fieldType: "textarea", group: "notes", colSpan: "full", required: false },
    ),
  ];
}

function employmentTypeOption(id: string, label: string, sortOrder: number): SystemOption {
  return {
    id,
    module_id: RECRUITMENT_MODULE_ID,
    option_list: ONBOARDING_EMPLOYMENT_TYPES_LIST,
    label,
    legacy_value: label,
    sort_order: sortOrder,
    is_active: true,
    rules: {},
  };
}

export function getDefaultOnboardingEmploymentTypes(): SystemOption[] {
  return [
    employmentTypeOption("opt:recruitment:emp:full_time", "Full-time", 0),
    employmentTypeOption("opt:recruitment:emp:part_time", "Part-time", 1),
    employmentTypeOption("opt:recruitment:emp:casual", "Casual", 2),
    employmentTypeOption("opt:recruitment:emp:contract", "Fixed-term contract", 3),
    employmentTypeOption("opt:recruitment:emp:intern", "Intern / attachment", 4),
  ];
}

function payFrequencyOption(id: string, label: string, sortOrder: number): SystemOption {
  return {
    id,
    module_id: RECRUITMENT_MODULE_ID,
    option_list: ONBOARDING_PAY_FREQUENCIES_LIST,
    label,
    legacy_value: label,
    sort_order: sortOrder,
    is_active: true,
    rules: {},
  };
}

export function getDefaultPayFrequencies(): SystemOption[] {
  return [
    payFrequencyOption("opt:recruitment:pay:weekly", "Weekly", 0),
    payFrequencyOption("opt:recruitment:pay:monthly", "Monthly", 1),
    payFrequencyOption("opt:recruitment:pay:hourly", "Hourly", 2),
  ];
}
