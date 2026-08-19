import type { SystemOption } from "./types";
import { COUNTRY_NAMES } from "@/lib/careers/countryNames";

export const RECRUITMENT_MODULE_ID = "mod:recruitment";
export const RECRUITMENT_APPLICATION_FIELDS_LIST = "careers.applicationFields";
/** System Definitions list key for selectable job posting roles (HR + public careers). */
export const RECRUITMENT_JOB_POSTINGS_LIST = "careers.jobPostings";

/** @deprecated use RECRUITMENT_JOB_POSTINGS_LIST */
export const RECRUITMENT_JOB_TITLES_LIST = RECRUITMENT_JOB_POSTINGS_LIST;

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
    option_list: RECRUITMENT_APPLICATION_FIELDS_LIST,
    label,
    legacy_value: legacyValue,
    sort_order: sortOrder,
    is_active: true,
    rules: rules as SystemOption["rules"],
  };
}

/** Git / pre-migration defaults for job application form fields. */
export function getDefaultApplicationFormFields(): SystemOption[] {
  return [
    field("opt:recruitment:field:first_name", "First name", "first_name", 1, {
      step: "personal",
      fieldKey: "first_name",
      fieldType: "text",
      required: true,
    }),
    field("opt:recruitment:field:last_name", "Last name", "last_name", 2, {
      step: "personal",
      fieldKey: "last_name",
      fieldType: "text",
      required: true,
    }),
    field("opt:recruitment:field:email", "Email address", "email", 3, {
      step: "personal",
      fieldKey: "email",
      fieldType: "email",
      required: true,
    }),
    field("opt:recruitment:field:phone", "Mobile phone", "phone", 4, {
      step: "personal",
      fieldKey: "phone",
      fieldType: "phone",
      required: true,
    }),
    field("opt:recruitment:field:dob", "Date of birth", "date_of_birth", 5, {
      step: "personal",
      fieldKey: "date_of_birth",
      fieldType: "date",
      required: true,
    }),
    field("opt:recruitment:field:gender", "Gender", "gender", 6, {
      step: "personal",
      fieldKey: "gender",
      fieldType: "select",
      required: true,
      options: ["Male", "Female"],
    }),
    field("opt:recruitment:field:nationality", "Nationality", "nationality", 7, {
      step: "personal",
      fieldKey: "nationality",
      fieldType: "select",
      required: true,
      options: COUNTRY_NAMES,
    }),
    // is_citizen is never rendered (is_active: false below) — its value is
    // auto-filled from Nationality on the client (JobApplicationWizard's
    // setFieldValue) instead of being asked directly. Ghana Card/Passport
    // visibility still keys off it, same as the original design.
    {
      ...field("opt:recruitment:field:citizen", "Ghana citizen?", "is_citizen", 8, {
        step: "personal",
        fieldKey: "is_citizen",
        fieldType: "select",
        required: true,
        options: ["Yes", "No"],
      }),
      is_active: false,
    },
    field("opt:recruitment:field:ghana_card", "Ghana Card number", "ghana_card_no", 9, {
      step: "personal",
      fieldKey: "ghana_card_no",
      fieldType: "ghana_card",
      required: true,
      showWhen: { field: "is_citizen", equals: "Yes" },
    }),
    field("opt:recruitment:field:passport_no", "Passport number", "passport_number", 10, {
      step: "personal",
      fieldKey: "passport_number",
      fieldType: "text",
      required: true,
      showWhen: { field: "is_citizen", equals: "No" },
    }),
    field(
      "opt:recruitment:field:passport_bio",
      "Passport bio page (photo)",
      "passport_bio_page",
      11,
      {
        step: "personal",
        fieldKey: "passport_bio_page",
        fieldType: "file",
        required: true,
        accept: "image/*,.pdf",
        showWhen: { field: "is_citizen", equals: "No" },
      },
    ),
    field("opt:recruitment:field:experience", "Work experience", "work_experience", 20, {
      step: "experience",
      fieldKey: "work_experience",
      fieldType: "work_history",
      required: true,
    }),
    field("opt:recruitment:field:education", "Educational qualifications", "education", 21, {
      step: "experience",
      fieldKey: "education",
      fieldType: "education_history",
      required: true,
    }),
    field(
      "opt:recruitment:field:cert",
      "Educational Certificates",
      "certificates",
      22,
      {
        step: "experience",
        fieldKey: "certificates",
        fieldType: "file",
        required: true,
        accept: ".pdf,image/*",
        multiple: true,
      },
    ),
    field("opt:recruitment:field:cv", "Curriculum vitae (CV)", "cv", 30, {
      step: "documents",
      fieldKey: "cv",
      fieldType: "file",
      required: true,
      accept: ".pdf,.doc,.docx,image/*",
    }),
    field("opt:recruitment:field:cover", "Cover letter", "cover_letter", 31, {
      step: "documents",
      fieldKey: "cover_letter",
      fieldType: "textarea",
      required: true,
    }),
    field("opt:recruitment:field:ref1_name", "Reference 1 — full name", "reference_1_name", 32, {
      step: "documents",
      fieldKey: "reference_1_name",
      fieldType: "text",
      required: true,
    }),
    field("opt:recruitment:field:ref1_phone", "Reference 1 — phone", "reference_1_phone", 33, {
      step: "documents",
      fieldKey: "reference_1_phone",
      fieldType: "phone",
      required: true,
    }),
    field("opt:recruitment:field:ref1_email", "Reference 1 — email", "reference_1_email", 34, {
      step: "documents",
      fieldKey: "reference_1_email",
      fieldType: "email",
      required: false,
    }),
    field(
      "opt:recruitment:field:ref1_rel",
      "Reference 1 — relationship",
      "reference_1_relationship",
      35,
      {
        step: "documents",
        fieldKey: "reference_1_relationship",
        fieldType: "text",
        required: true,
      },
    ),
    field("opt:recruitment:field:ref2_name", "Reference 2 — full name", "reference_2_name", 36, {
      step: "documents",
      fieldKey: "reference_2_name",
      fieldType: "text",
      required: true,
    }),
    field("opt:recruitment:field:ref2_phone", "Reference 2 — phone", "reference_2_phone", 37, {
      step: "documents",
      fieldKey: "reference_2_phone",
      fieldType: "phone",
      required: true,
    }),
    field("opt:recruitment:field:ref2_email", "Reference 2 — email", "reference_2_email", 38, {
      step: "documents",
      fieldKey: "reference_2_email",
      fieldType: "email",
      required: false,
    }),
    field(
      "opt:recruitment:field:ref2_rel",
      "Reference 2 — relationship",
      "reference_2_relationship",
      39,
      {
        step: "documents",
        fieldKey: "reference_2_relationship",
        fieldType: "text",
        required: true,
      },
    ),
  ];
}
