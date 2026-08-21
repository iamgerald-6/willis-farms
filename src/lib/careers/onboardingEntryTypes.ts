export type OnboardingQualificationEntry = {
  qualification: string;
  institution: string;
  field: string;
  year: string;
};

export type OnboardingCertificationEntry = {
  name: string;
  issuing_body: string;
  licence_no: string;
  expiry: string;
  file: { secure_url?: string; public_id?: string; original_name?: string } | null;
};

export type OnboardingWorkExperienceEntry = {
  employer: string;
  job_title: string;
  from: string;
  to: string;
  reason_leaving: string;
};
