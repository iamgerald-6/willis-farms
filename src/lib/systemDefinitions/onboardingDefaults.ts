import type { SystemOption } from "./types";
import { GHANA_REGIONS } from "@/lib/careers/onboardingTypes";
import {
  ACCEPT_PASSPORT_BIO,
} from "@/lib/uploadConstraints";

export const RECRUITMENT_MODULE_ID = "mod:recruitment";
export const ONBOARDING_FIELDS_LIST = "careers.onboardingFields";
export const ONBOARDING_LOCATIONS_LIST = "careers.onboardingLocations";
export const ONBOARDING_DEPARTMENTS_L1L6_LIST = "careers.onboardingDepartmentsL1L6";
export const ONBOARDING_DEPARTMENTS_L7_LIST = "careers.onboardingDepartmentsL7";
export const ONBOARDING_MEDICAL_REPORTS_LIST = "careers.onboardingMedicalReports";

function field(
  id: string,
  label: string,
  legacyValue: string,
  sortOrder: number,
  rules: Record<string, unknown>,
): SystemOption {
  return {
    id,
    module_id: RECRUITMENT_MODULE_ID,
    option_list: ONBOARDING_FIELDS_LIST,
    label,
    legacy_value: legacyValue,
    sort_order: sortOrder,
    is_active: true,
    rules: rules as SystemOption["rules"],
  };
}

function optionRow(
  id: string,
  optionList: string,
  label: string,
  legacyValue: string,
  sortOrder: number,
): SystemOption {
  return {
    id,
    module_id: RECRUITMENT_MODULE_ID,
    option_list: optionList,
    label,
    legacy_value: legacyValue,
    sort_order: sortOrder,
    is_active: true,
    rules: {},
  };
}

/** Required medical reports — shown on onboarding medical step and hire email. */
export function getDefaultOnboardingMedicalReports(): SystemOption[] {
  return [
    optionRow(
      "opt:onboarding:med:1",
      ONBOARDING_MEDICAL_REPORTS_LIST,
      "Pre-employment medical fitness certificate",
      "pre_employment_fitness",
      0,
    ),
    optionRow(
      "opt:onboarding:med:2",
      ONBOARDING_MEDICAL_REPORTS_LIST,
      "Blood group / basic haematology",
      "blood_group_haematology",
      1,
    ),
    optionRow(
      "opt:onboarding:med:3",
      ONBOARDING_MEDICAL_REPORTS_LIST,
      "Chest X-ray (where clinically indicated)",
      "chest_xray",
      2,
    ),
    optionRow(
      "opt:onboarding:med:4",
      ONBOARDING_MEDICAL_REPORTS_LIST,
      "Vision / hearing screening (if required for the role)",
      "vision_hearing",
      3,
    ),
    optionRow(
      "opt:onboarding:med:5",
      ONBOARDING_MEDICAL_REPORTS_LIST,
      "Clinic-issued “fit for duty” report (if separate from fitness certificate)",
      "fit_for_duty",
      4,
    ),
  ];
}

export function getDefaultOnboardingLocations(): SystemOption[] {
  return [
    optionRow("opt:onboarding:loc:1", ONBOARDING_LOCATIONS_LIST, "Main Breeding Farm — Ashanti", "main_breeding_ashanti", 0),
    optionRow("opt:onboarding:loc:2", ONBOARDING_LOCATIONS_LIST, "Grower-Finisher Site — Eastern", "grower_eastern", 1),
    optionRow("opt:onboarding:loc:3", ONBOARDING_LOCATIONS_LIST, "Commercial Operations — Greater Accra", "commercial_accra", 2),
    optionRow("opt:onboarding:loc:4", ONBOARDING_LOCATIONS_LIST, "Head Office — Accra", "head_office", 3),
  ];
}

export function getDefaultOnboardingDepartmentsL1L6(): SystemOption[] {
  return [
    optionRow("opt:onboarding:dept:l16:1", ONBOARDING_DEPARTMENTS_L1L6_LIST, "Farm Operations", "farm_operations", 0),
    optionRow("opt:onboarding:dept:l16:2", ONBOARDING_DEPARTMENTS_L1L6_LIST, "Breeding Operations", "breeding_operations", 1),
  ];
}

export function getDefaultOnboardingDepartmentsL7(): SystemOption[] {
  return [
    optionRow("opt:onboarding:dept:l7:1", ONBOARDING_DEPARTMENTS_L7_LIST, "Breeding Operations", "breeding_operations", 0),
    optionRow("opt:onboarding:dept:l7:2", ONBOARDING_DEPARTMENTS_L7_LIST, "Commercial Operations", "commercial_operations", 1),
    optionRow("opt:onboarding:dept:l7:3", ONBOARDING_DEPARTMENTS_L7_LIST, "Production", "production", 2),
  ];
}

/** Git / pre-migration defaults for employee onboarding form fields. */
export function getDefaultOnboardingFormFields(): SystemOption[] {
  return [
    // —— A. Personal ——
    field("opt:onboarding:field:surname", "Surname", "personal.surname", 1, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.surname",
      fieldType: "text",
      required: true,
      prefillLocked: true,
    }),
    field("opt:onboarding:field:first_name", "First name", "personal.first_name", 2, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.first_name",
      fieldType: "text",
      required: true,
      prefillLocked: true,
      colSpan: "half",
    }),
    field("opt:onboarding:field:middle", "Middle name(s) (optional)", "personal.middle_names", 3, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.middle_names",
      fieldType: "text",
      required: false,
      colSpan: "half",
    }),
    field("opt:onboarding:field:dob", "Date of birth", "personal.date_of_birth", 4, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.date_of_birth",
      fieldType: "date",
      required: true,
      colSpan: "half",
    }),
    field("opt:onboarding:field:gender", "Gender", "personal.gender", 5, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.gender",
      fieldType: "select",
      required: true,
      options: ["Male", "Female"],
      colSpan: "half",
    }),
    field("opt:onboarding:field:citizen", "Citizenship", "personal.is_citizen", 6, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.is_citizen",
      fieldType: "select",
      required: false,
      options: ["Citizen", "Non-citizen"],
      colSpan: "half",
    }),
    field("opt:onboarding:field:ghana_card", "Ghana Card number", "personal.ghana_card_no", 7, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.ghana_card_no",
      fieldType: "ghana_card",
      required: true,
      showWhen: { field: "personal.is_citizen", equals: "Citizen" },
      colSpan: "half",
    }),
    field("opt:onboarding:field:passport_no", "Passport number", "personal.passport_number", 8, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.passport_number",
      fieldType: "text",
      required: true,
      showWhen: { field: "personal.is_citizen", equals: "Non-citizen" },
      colSpan: "half",
    }),
    field("opt:onboarding:field:passport_bio", "Passport bio page (photo or PDF)", "personal.passport_bio_page", 9, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.passport_bio_page",
      fieldType: "file",
      required: true,
      accept: ACCEPT_PASSPORT_BIO,
      showWhen: { field: "personal.is_citizen", equals: "Non-citizen" },
    }),
    field("opt:onboarding:field:ssnit", "SSNIT number", "personal.ssnit_number", 10, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.ssnit_number",
      fieldType: "ssnit",
      required: true,
      colSpan: "half",
    }),
    field("opt:onboarding:field:mobile", "Mobile number", "personal.mobile", 11, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.mobile",
      fieldType: "phone",
      required: true,
      prefillLocked: true,
      colSpan: "half",
    }),
    field("opt:onboarding:field:email", "Personal email", "personal.personal_email", 12, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.personal_email",
      fieldType: "email",
      required: false,
      prefillLocked: true,
      colSpan: "half",
    }),
    field("opt:onboarding:field:region", "Region", "personal.region", 13, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.region",
      fieldType: "select",
      required: true,
      options: [...GHANA_REGIONS],
      colSpan: "half",
    }),
    field("opt:onboarding:field:address", "Residential address", "personal.residential_address", 14, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.residential_address",
      fieldType: "textarea",
      required: true,
    }),
    field("opt:onboarding:field:gps", "Ghana Post GPS digital address", "personal.gps_address", 15, {
      step: "personal",
      section: "A. Personal information",
      fieldKey: "personal.gps_address",
      fieldType: "gps",
      required: true,
      placeholder: "GA-123-4567",
    }),

    // —— B. Emergency contact ——
    field("opt:onboarding:field:em_name", "Emergency contact name", "emergency.full_name", 20, {
      step: "personal",
      section: "B. Emergency contact",
      fieldKey: "emergency.full_name",
      fieldType: "text",
      required: true,
      colSpan: "half",
    }),
    field("opt:onboarding:field:em_rel", "Emergency contact relationship", "emergency.relationship", 21, {
      step: "personal",
      section: "B. Emergency contact",
      fieldKey: "emergency.relationship",
      fieldType: "text",
      required: true,
      colSpan: "half",
    }),
    field("opt:onboarding:field:em_phone", "Emergency contact phone", "emergency.phone", 22, {
      step: "personal",
      section: "B. Emergency contact",
      fieldKey: "emergency.phone",
      fieldType: "phone",
      required: true,
      colSpan: "full",
    }),

    // —— C. Next of kin ——
    field("opt:onboarding:field:nok_name", "Next of kin name", "next_of_kin.full_name", 23, {
      step: "personal",
      section: "C. Next of kin",
      fieldKey: "next_of_kin.full_name",
      fieldType: "text",
      required: true,
      colSpan: "half",
    }),
    field("opt:onboarding:field:nok_phone", "Next of kin contact", "next_of_kin.phone", 24, {
      step: "personal",
      section: "C. Next of kin",
      fieldKey: "next_of_kin.phone",
      fieldType: "phone",
      required: true,
      colSpan: "half",
    }),

    // —— E. Payment ——
    field("opt:onboarding:field:pay_method", "Payment method", "payment.method", 34, {
      step: "personal",
      section: "E. Payment details",
      fieldKey: "payment.method",
      fieldType: "select",
      required: true,
      options: ["Bank transfer", "Mobile money"],
      colSpan: "half",
    }),
    field("opt:onboarding:field:bank_name", "Bank name", "payment.bank_name", 35, {
      step: "personal",
      section: "E. Payment details",
      fieldKey: "payment.bank_name",
      fieldType: "text",
      required: true,
      showWhen: { field: "payment.method", equals: "Bank transfer" },
      colSpan: "half",
    }),
    field("opt:onboarding:field:account_name", "Account name", "payment.account_name", 36, {
      step: "personal",
      section: "E. Payment details",
      fieldKey: "payment.account_name",
      fieldType: "text",
      required: true,
      showWhen: { field: "payment.method", equals: "Bank transfer" },
      colSpan: "half",
    }),
    field("opt:onboarding:field:account_no", "Account number", "payment.account_number", 37, {
      step: "personal",
      section: "E. Payment details",
      fieldKey: "payment.account_number",
      fieldType: "bank_account",
      required: true,
      showWhen: { field: "payment.method", equals: "Bank transfer" },
      colSpan: "half",
    }),
    field("opt:onboarding:field:momo_network", "Mobile money network", "payment.momo_network", 38, {
      step: "personal",
      section: "E. Payment details",
      fieldKey: "payment.momo_network",
      fieldType: "select",
      required: true,
      options: ["MTN", "Telecel", "AirtelTigo"],
      showWhen: { field: "payment.method", equals: "Mobile money" },
      colSpan: "half",
    }),
    field("opt:onboarding:field:momo_name", "Mobile money registered name", "payment.momo_registered_name", 39, {
      step: "personal",
      section: "E. Payment details",
      fieldKey: "payment.momo_registered_name",
      fieldType: "text",
      required: true,
      showWhen: { field: "payment.method", equals: "Mobile money" },
      colSpan: "half",
    }),
    field("opt:onboarding:field:momo_no", "Mobile money number", "payment.momo_number", 40, {
      step: "personal",
      section: "E. Payment details",
      fieldKey: "payment.momo_number",
      fieldType: "phone",
      required: true,
      showWhen: { field: "payment.method", equals: "Mobile money" },
      colSpan: "half",
    }),

    // —— Medical step ——
    field("opt:onboarding:field:blood", "Blood group", "medical.blood_group", 55, {
      step: "medical",
      section: "I. Medical & safety self-declaration",
      fieldKey: "medical.blood_group",
      fieldType: "select",
      required: false,
      options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"],
      colSpan: "half",
    }),
    field("opt:onboarding:field:allergies", "Allergies", "medical.allergies", 56, {
      step: "medical",
      section: "I. Medical & safety self-declaration",
      fieldKey: "medical.allergies",
      fieldType: "text",
      required: false,
      colSpan: "half",
    }),
    field("opt:onboarding:field:conditions", "Medical conditions relevant to assigned duties", "medical.conditions", 57, {
      step: "medical",
      section: "I. Medical & safety self-declaration",
      fieldKey: "medical.conditions",
      fieldType: "textarea",
      required: false,
    }),

    field(
      "opt:onboarding:field:bio_initials",
      "I consent to abide by and commit to all biosecurity requirements at Wills Farms.",
      "biosecurity.commitment_initials",
      68,
      {
        step: "medical",
        section: "Biosecurity",
        fieldKey: "biosecurity.commitment_initials",
        fieldType: "checkbox",
        required: true,
        colSpan: "full",
      },
    ),
    field("opt:onboarding:field:sig_name", "Typed full name (signature)", "declarations.signature_name", 69, {
      step: "medical",
      section: "Consent & signature",
      fieldKey: "declarations.signature_name",
      fieldType: "text",
      required: true,
      prefillLocked: true,
    }),
  ];
}
