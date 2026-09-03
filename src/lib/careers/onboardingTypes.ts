export const GHANA_REGIONS = [
  "Ahafo",
  "Ashanti",
  "Bono",
  "Bono East",
  "Central",
  "Eastern",
  "Greater Accra",
  "North East",
  "Northern",
  "Oti",
  "Savannah",
  "Upper East",
  "Upper West",
  "Volta",
  "Western",
  "Western North",
] as const;

export type OnboardingStep = "personal" | "medical" | "referee";

export interface OnboardingFormData {
  personal?: {
    surname?: string;
    first_name?: string;
    middle_names?: string;
    previous_names?: string;
    date_of_birth?: string;
    gender?: string;
    marital_status?: string;
    nationality?: string;
    is_citizen?: string;
    ghana_card_no?: string;
    passport_number?: string;
    passport_bio_page?: { secure_url?: string; public_id?: string; original_name?: string };
    ssnit_number?: string;
    personal_tin?: string;
    work_permit?: string;
    residential_address?: string;
    gps_address?: string;
    region?: string;
    mobile?: string;
    whatsapp?: string;
    personal_email?: string;
  };
  emergency?: {
    full_name?: string;
    relationship?: string;
    phone?: string;
    address?: string;
  };
  next_of_kin?: {
    full_name?: string;
    relationship?: string;
    phone?: string;
    address?: string;
  };
  spouse?: {
    name?: string;
  };
  dependents?: { full_name?: string; relationship?: string; date_of_birth?: string }[];
  employment?: {
    position_title?: string;
    department?: string;
    farm_site?: string;
    date_of_hire?: string;
    employment_type?: string;
    probation_end?: string;
    contract_end?: string;
    work_schedule?: string;
  };
  payment?: {
    method?: string;
    bank_name?: string;
    account_name?: string;
    account_number?: string;
    momo_network?: string;
    momo_number?: string;
    momo_registered_name?: string;
    nhis_number?: string;
  };
  qualifications?: {
    qualification?: string;
    institution?: string;
    field?: string;
    certificate_no?: string;
    year?: string;
  }[];
  certifications?: {
    name?: string;
    issuing_body?: string;
    licence_no?: string;
    expiry?: string;
    file?: { secure_url?: string; public_id?: string; original_name?: string } | null;
  }[];
  /** Certificates uploaded during job application — read-only reference. */
  application_certificates?: {
    secure_url?: string;
    public_id?: string;
    original_name?: string;
  }[];
  /** Optional extra certificates uploaded during onboarding. */
  additional_certifications?: {
    name?: string;
    issuing_body?: string;
    licence_no?: string;
    expiry?: string;
    file?: { secure_url?: string; public_id?: string; original_name?: string } | null;
  }[];
  work_experience?: {
    employer?: string;
    job_title?: string;
    from?: string;
    to?: string;
    reason_leaving?: string;
  }[];
  skills?: {
    relevant_skills?: string;
    languages?: string;
    computer_literacy?: string;
    drivers_licence?: string;
  };
  medical?: {
    blood_group?: string;
    allergies?: string;
    conditions?: string;
    medical_report?: { secure_url?: string; public_id?: string; original_name?: string };
    accommodation_needs?: string;
    ppe_boots?: string;
    ppe_overall?: string;
    ppe_gloves?: string;
    acknowledge_referral?: boolean;
  };
  referees?: { full_name?: string; relationship?: string; phone?: string; email?: string }[];
  biosecurity?: {
    household_pigs?: "yes" | "no" | "";
    household_pig_work?: "yes" | "no" | "";
    visited_swine_site_12m?: "yes" | "no" | "";
    details?: string;
    asf_travel_30d?: "yes" | "no" | "";
    commitment_initials?: string;
  };
  background?: {
    criminal_conviction?: "yes" | "no" | "";
    criminal_details?: string;
    verification_consent_initials?: string;
  };
  documents?: {
    ghana_card?: boolean;
    passport_photos?: boolean;
    bank_proof?: boolean;
    certificates?: boolean;
    ssnit_card?: boolean;
    work_permit?: boolean;
    drivers_licence?: boolean;
  };
  declarations?: {
    confidentiality_initials?: string;
    animal_welfare_initials?: string;
    data_consent?: boolean;
    signature_name?: string;
    signature_date?: string;
  };
}

export interface OnboardingHrData {
  employee_id?: string;
  company_email?: string;
  supervisor_name?: string;
  /** user_id of assigned reporting supervisor (Section O picker). */
  supervisor_id?: string;
  supervisor_contact?: string;
  /** low | mid | high — picks salary band for the selected grade. */
  salary_tier?: string;
  /** Read-only display of configured band (also mirrored in salary_ghs). */
  salary_range?: string;
  salary_ghs?: string;
  pay_frequency?: string;
  grade_level?: string;
  cost_centre?: string;
  tier2_pension?: string;
  tier3_fund?: string;
  nda_signed_date?: string;
  induction_date?: string;
  medical_referral_issued?: string;
  medical_report_received?: string;
  fitness_determination?: string;
  reference_forms_sent?: string;
  reference_forms_received?: string;
  academic_verification_sent?: string;
  academic_verification_outcome?: string;
  documents_verified_by?: string;
  equipment_issued?: string;
  approved_by?: string;
  hr_notes?: string;
  /** HR officer submitted review notes for senior sign-off. */
  hr_review_submitted_at?: string;
  hr_reviewed_by?: string;
  /** senior_hr = default inbox flow. */
  hr_review_mode?: "senior_hr";
  /** @deprecated Legacy consultant workflow — ignored. */
  hr_approval_supervisor_id?: string;
  /** Senior HR signed off and invited the employee to WillsOne. */
  hr_approved_at?: string;
  /** @deprecated Use hr_review_submitted_at / hr_approved_at */
  hr_reviewed_at?: string;
  /** Signed offer letter PDF — required before sending onboarding link. */
  offer_letter?: {
    secure_url?: string;
    public_id?: string;
    original_name?: string;
  };
  /** HR-uploaded pre-employment medical report (Section O). */
  medical_report?: {
    secure_url?: string;
    public_id?: string;
    original_name?: string;
  };
  /** Editable plain-text draft used to generate the PDF offer letter. */
  offer_letter_draft?: string;
  offer_letter_generated_at?: string;
  offer_letter_uploaded_at?: string;
  /** Set when HR saves compensation & placement on the Offer tab. */
  offer_terms_saved_at?: string;
  /** Candidate response to the job offer (before / instead of completing onboarding). */
  offer_response?: "pending" | "accepted" | "declined";
  offer_response_at?: string;
  /** Set when HR sends the WillsOne platform invite (User Management). */
  platform_invited_at?: string;
  /** Set when HR completes Section O and sends the WillsOne invite from Recruitment. */
  hr_finished_at?: string;
  /** probation | active | fired | quit | deceased */
  employment_status?: string;
  probation_completed_at?: string;
  exit_reason?: string;
  exit_at?: string;
  /** Section O — employment placement (HR only; not on candidate form). */
  position_title?: string;
  department?: string;
  employment_type?: string;
  work_location?: string;
  /** Additional admin-configured HR fields stored in hr_data JSON. */
  [key: string]:
    | string
    | undefined
    | { secure_url?: string; public_id?: string; original_name?: string };
}

export const ONBOARDING_EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Casual",
  "Seasonal",
  "Contract",
] as const;

export interface OnboardingSubmission {
  id: string;
  application_id: string;
  form_data: OnboardingFormData;
  hr_data: OnboardingHrData;
  personal_completed_at: string | null;
  medical_completed_at: string | null;
  referee_completed_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  personal: "Personal information",
  medical: "Medical & declarations",
  referee: "References & declarations",
};

export function emptyOnboardingForm(): OnboardingFormData {
  return {
    personal: {},
    emergency: {},
    next_of_kin: {},
    spouse: {},
    dependents: [{ full_name: "", relationship: "", date_of_birth: "" }],
    employment: {},
    payment: {},
    qualifications: [{ qualification: "", institution: "", field: "", certificate_no: "", year: "" }],
    certifications: [{ name: "", issuing_body: "", licence_no: "", expiry: "", file: null }],
    application_certificates: [],
    additional_certifications: [],
    work_experience: [{ employer: "", job_title: "", from: "", to: "", reason_leaving: "" }],
    skills: {},
    medical: { acknowledge_referral: false },
    referees: [
      { full_name: "", relationship: "", phone: "", email: "" },
      { full_name: "", relationship: "", phone: "", email: "" },
    ],
    biosecurity: {},
    background: {},
    documents: {},
    declarations: {},
  };
}

/** Fields copied from job_applications — shown read-only on the onboarding form */
export type ApplicationPrefillSource = {
  full_name: string;
  email: string;
  phone: string;
  role_title: string;
  location?: string | null;
};

export function parseApplicantName(fullName: string): {
  first_name: string;
  surname: string;
  middle_names: string;
  has_middle_from_application: boolean;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return {
      first_name: "",
      surname: "",
      middle_names: "",
      has_middle_from_application: false,
    };
  }
  if (parts.length === 1) {
    return {
      first_name: parts[0],
      surname: parts[0],
      middle_names: "",
      has_middle_from_application: false,
    };
  }
  if (parts.length === 2) {
    return {
      first_name: parts[0],
      surname: parts[1],
      middle_names: "",
      has_middle_from_application: false,
    };
  }
  return {
    first_name: parts[0],
    middle_names: parts.slice(1, -1).join(" "),
    surname: parts[parts.length - 1],
    has_middle_from_application: true,
  };
}

export function mergeOnboardingForm(
  raw: OnboardingFormData | null | undefined,
): OnboardingFormData {
  const base = emptyOnboardingForm();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    personal: { ...base.personal, ...raw.personal },
    emergency: { ...base.emergency, ...raw.emergency },
    next_of_kin: { ...base.next_of_kin, ...raw.next_of_kin },
    spouse: { ...base.spouse, ...raw.spouse },
    employment: { ...base.employment, ...raw.employment },
    payment: { ...base.payment, ...raw.payment },
    skills: { ...base.skills, ...raw.skills },
    medical: { ...base.medical, ...raw.medical },
    biosecurity: { ...base.biosecurity, ...raw.biosecurity },
    background: { ...base.background, ...raw.background },
    documents: { ...base.documents, ...raw.documents },
    declarations: { ...base.declarations, ...raw.declarations },
    dependents: raw.dependents?.length ? raw.dependents : base.dependents,
    qualifications: raw.qualifications?.length ? raw.qualifications : base.qualifications,
    certifications: raw.certifications?.length ? raw.certifications : base.certifications,
    application_certificates: raw.application_certificates?.length
      ? raw.application_certificates
      : base.application_certificates,
    additional_certifications: raw.additional_certifications?.length
      ? raw.additional_certifications
      : base.additional_certifications,
    work_experience: raw.work_experience?.length ? raw.work_experience : base.work_experience,
    referees: raw.referees?.length ? raw.referees : base.referees,
  };
}

/** True when the candidate genuinely finished — not just submitted_at set in DB. */
export function isCandidateOnboardingComplete(
  formData: OnboardingFormData | null | undefined,
  submittedAt: string | null | undefined,
): boolean {
  if (!submittedAt) return false;
  const form = mergeOnboardingForm(formData);
  return (
    form.declarations?.data_consent === true &&
    Boolean(form.declarations?.signature_name?.trim()) &&
    Boolean(form.emergency?.full_name?.trim())
  );
}

/** Merge application data into form — always wins over candidate edits for locked fields */
export function applyApplicationPrefill(
  form: OnboardingFormData,
  application: ApplicationPrefillSource,
): OnboardingFormData {
  const merged = mergeOnboardingForm(form);
  const name = parseApplicantName(application.full_name);

  return {
    ...merged,
    personal: {
      ...merged.personal,
      first_name: name.first_name,
      surname: name.surname,
      middle_names: name.has_middle_from_application
        ? name.middle_names
        : merged.personal?.middle_names,
      mobile: application.phone.trim(),
      personal_email: application.email.trim().toLowerCase(),
    },
    declarations: {
      ...merged.declarations,
      signature_name: application.full_name.trim(),
    },
  };
}

/** Seed Section O placement fields from saved HR data, legacy form answers, or application. */
export function mergeInitialOnboardingHrData(input: {
  hr_data?: OnboardingHrData | null;
  form_data?: OnboardingFormData | null;
  role_title?: string;
  location?: string | null;
}): OnboardingHrData {
  const existing = input.hr_data ?? {};
  const emp = input.form_data?.employment ?? {};
  return {
    ...existing,
    position_title:
      existing.position_title?.trim() ||
      emp.position_title?.trim() ||
      input.role_title?.trim() ||
      undefined,
    department: existing.department?.trim() || emp.department?.trim() || undefined,
    employment_type:
      existing.employment_type?.trim() || emp.employment_type?.trim() || undefined,
    work_location:
      existing.work_location?.trim() ||
      emp.farm_site?.trim() ||
      input.location?.trim() ||
      undefined,
  };
}

/** Offer accept/decline for HR display — uses explicit hr_data or onboarding progress. */
export function resolveOfferResponseStatus(input: {
  hr_data?: OnboardingHrData | null;
  submitted_at?: string | null;
  personal_completed_at?: string | null;
  medical_completed_at?: string | null;
}): NonNullable<OnboardingHrData["offer_response"]> {
  const explicit = input.hr_data?.offer_response;
  if (explicit === "accepted" || explicit === "declined") return explicit;
  if (
    input.submitted_at ||
    input.personal_completed_at ||
    input.medical_completed_at
  ) {
    return "accepted";
  }
  return "pending";
}

export function resolveOfferResponseAt(input: {
  hr_data?: OnboardingHrData | null;
  submitted_at?: string | null;
  personal_completed_at?: string | null;
  medical_completed_at?: string | null;
}): string | null | undefined {
  if (input.hr_data?.offer_response_at?.trim()) {
    return input.hr_data.offer_response_at;
  }
  if (resolveOfferResponseStatus(input) === "accepted") {
    return input.personal_completed_at ?? input.submitted_at ?? undefined;
  }
  return undefined;
}

export type OnboardingHrPipelineStatus =
  | "waiting_candidate"
  | "hr_review"
  | "senior_approval"
  | "complete";

export function resolveOnboardingHrPipelineStatus(input: {
  submitted_at?: string | null;
  hr_data?: OnboardingHrData | null;
}): OnboardingHrPipelineStatus {
  const hr = input.hr_data;
  if (hr?.platform_invited_at?.trim() || hr?.hr_finished_at?.trim()) {
    return "complete";
  }
  if (!input.submitted_at) return "waiting_candidate";
  if (!hr?.hr_review_submitted_at?.trim()) return "hr_review";
  return "senior_approval";
}
