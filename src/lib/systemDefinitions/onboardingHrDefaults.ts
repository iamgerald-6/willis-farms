import type { SystemOption } from "./types";
import { RECRUITMENT_MODULE_ID } from "./recruitmentDefaults";

export const ONBOARDING_HR_FIELDS_LIST = "careers.onboardingHrFields";
export const OFFER_TERMS_FIELDS_LIST = "careers.offerTermsFields";
export const ONBOARDING_EMPLOYMENT_TYPES_LIST = "careers.onboardingEmploymentTypes";
export const ONBOARDING_PAY_FREQUENCIES_LIST = "careers.payFrequencies";
export const ONBOARDING_NOTICE_PERIOD_FREQUENCIES_LIST =
  "careers.noticePeriodFrequencies";

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
  | "notice_period_frequency"
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
        hint: "Staff with Supervisory Role, Executive Role, or Human Resource — the person this hire will report to.",
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
        hint: "Pick the specific person currently holding the \"Reporting to\" role selected above. Set that first.",
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
        hint: "Numeric value only — e.g. \"12\". Pair with Notice period frequency.",
      },
    ),
    hrField(
      "opt:recruitment:hr:notice_period_frequency",
      "Notice period frequency",
      "notice_period_frequency",
      19.5,
      {
        fieldKey: "notice_period_frequency",
        fieldType: "notice_period_frequency",
        group: "hr",
        required: true,
        hint: "Unit for the notice period — e.g. \"Week(s)\".",
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

function offerField(
  id: string,
  label: string,
  fieldKey: string,
  fieldType: OnboardingHrFieldType,
  sortOrder: number,
  extraRules: Record<string, unknown> = {},
): SystemOption {
  return {
    id,
    module_id: RECRUITMENT_MODULE_ID,
    option_list: OFFER_TERMS_FIELDS_LIST,
    label,
    legacy_value: fieldKey,
    sort_order: sortOrder,
    is_active: true,
    rules: {
      fieldKey,
      fieldType,
      group: "hr",
      required: false,
      ...extraRules,
    } as SystemOption["rules"],
  };
}

/**
 * Git defaults for the Offer letter fields — an independent field list from
 * HR onboarding Section O (getDefaultOnboardingHrFields above), even though
 * several of these field keys are shared with it (same hr_data key, so a
 * value filled in here is what Section O later shows read-only). Editing or
 * adding a field here only ever affects the live Offer Terms modal.
 */
export function getDefaultOfferTermsFields(): SystemOption[] {
  return [
    offerField("opt:recruitment:offer:position_title", "Position title", "position_title", "text", 0),
    offerField("opt:recruitment:offer:grade_level", "Grade / level", "grade_level", "grade_level", 1, { colSpan: "full" }),
    offerField("opt:recruitment:offer:salary_tier", "Salary tier", "salary_tier", "salary_tier", 2),
    offerField("opt:recruitment:offer:salary_ghs", "Gross salary (GHS)", "salary_ghs", "text", 3),
    offerField("opt:recruitment:offer:pay_frequency", "Pay frequency", "pay_frequency", "pay_frequency", 4),
    offerField("opt:recruitment:offer:department", "Department / division", "department", "department", 5),
    offerField("opt:recruitment:offer:employment_type", "Employment type", "employment_type", "employment_type", 6),
    offerField("opt:recruitment:offer:work_location", "Farm site / work location", "work_location", "work_location", 7),
    offerField("opt:recruitment:offer:reporting_to", "Reporting to", "reporting_to", "reporting_to", 8, {
      required: true,
      hint: "Staff with Supervisory Role, Executive Role, or Human Resource — the person this hire will report to.",
    }),
    offerField("opt:recruitment:offer:start_date", "Start date", "start_date", "date", 9, {
      required: true,
      hint: "Effective employment start date — used throughout the offer letter as both the appointment date and Position Details start date.",
    }),
    offerField("opt:recruitment:offer:notice_period", "Notice period", "notice_period", "text", 10, {
      required: true,
      hint: "Numeric value only — e.g. \"12\". Pair with Notice period frequency.",
    }),
    offerField(
      "opt:recruitment:offer:notice_period_frequency",
      "Notice period frequency",
      "notice_period_frequency",
      "notice_period_frequency",
      10.5,
      {
        required: true,
        hint: "Unit for the notice period — e.g. \"Week(s)\".",
      },
    ),
    offerField("opt:recruitment:offer:working_hours", "Working hours", "working_hours", "text", 11, {
      required: true,
      hint: "e.g. \"40 hours per week, Monday to Sunday with one day off duty.\"",
    }),
    offerField("opt:recruitment:offer:acceptance_deadline", "Offer acceptance deadline", "acceptance_deadline", "date", 12, { required: true }),
    offerField("opt:recruitment:offer:basic_salary_ghs", "Basic salary (GHS)", "basic_salary_ghs", "text", 13, { required: true }),
    offerField("opt:recruitment:offer:housing_allowance", "Housing allowance", "housing_allowance", "text", 14, {
      required: true,
      hint: "Amount, or how it's provided — e.g. \"Provided by the Company upon signing a Housing Agreement.\"",
    }),
    offerField("opt:recruitment:offer:medical_allowance", "Medical allowance", "medical_allowance", "text", 15, { required: true }),
    offerField("opt:recruitment:offer:social_security_contribution", "Social security contribution", "social_security_contribution", "text", 16, {
      required: true,
      hint: "SSNIT deduction amount for Annex 1 of the offer letter.",
    }),
    offerField("opt:recruitment:offer:income_tax", "Income tax", "income_tax", "text", 17, { required: true }),
    offerField("opt:recruitment:offer:net_payable", "Net payable", "net_payable", "text", 18, { required: true }),
    offerField(
      "opt:recruitment:offer:employer_tier2_contribution",
      "Employer pension contribution (Tier 2)",
      "employer_tier2_contribution",
      "text",
      18.5,
      {
        required: false,
        hint: "Informational only — paid by the employer, not deducted from the employee. Blank unless an Employer Tier 2 rate is set under Payroll tax settings.",
      },
    ),
    offerField("opt:recruitment:offer:hr_notes", "HR notes", "hr_notes", "textarea", 19, { colSpan: "full" }),
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

function noticePeriodFrequencyOption(
  id: string,
  label: string,
  sortOrder: number,
): SystemOption {
  return {
    id,
    module_id: RECRUITMENT_MODULE_ID,
    option_list: ONBOARDING_NOTICE_PERIOD_FREQUENCIES_LIST,
    label,
    legacy_value: label,
    sort_order: sortOrder,
    is_active: true,
    rules: {},
  };
}

export function getDefaultNoticePeriodFrequencies(): SystemOption[] {
  return [
    noticePeriodFrequencyOption("opt:recruitment:notice:days", "Day(s)", 0),
    noticePeriodFrequencyOption("opt:recruitment:notice:weeks", "Week(s)", 1),
    noticePeriodFrequencyOption("opt:recruitment:notice:months", "Month(s)", 2),
  ];
}
