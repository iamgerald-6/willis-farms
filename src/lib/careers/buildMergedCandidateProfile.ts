import type {
  EducationEntry,
  UploadedFile,
  WorkHistoryEntry,
} from "@/lib/careers/applicationFormSchema";
import { deriveCitizenshipFromApplication } from "@/lib/careers/onboardingFormSchema";
import type { OnboardingFormData } from "@/lib/careers/onboardingTypes";

export type ProfileReviewItem = {
  label: string;
  value: string;
  href?: string;
  fullWidth?: boolean;
};

export type ProfileReviewSection = {
  title: string;
  items: ProfileReviewItem[];
};

export type ProfileReviewGroup = {
  title: string;
  description: string;
  sections: ProfileReviewSection[];
};

function coerceApplicationRecord(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalizeApplicationFormData(raw: unknown): Record<string, unknown> {
  const data = { ...coerceApplicationRecord(raw) };
  if (!data.work_history && Array.isArray(data.work_experience)) {
    data.work_history = data.work_experience;
  }
  if (!data.education_history && Array.isArray(data.education)) {
    data.education_history = data.education;
  }
  if (!data.ghana_card && data.ghana_card_no) {
    data.ghana_card = data.ghana_card_no;
  }
  return data;
}

function str(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function formatDateDisplay(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return value.trim();
}

function item(
  label: string,
  value: string | null | undefined,
  opts?: { fullWidth?: boolean; href?: string },
): ProfileReviewItem | null {
  if (!value?.trim()) return null;
  return { label, value: value.trim(), ...opts };
}

function fileItem(label: string, file: unknown): ProfileReviewItem | null {
  if (!file || typeof file !== "object") return null;
  const f = file as UploadedFile;
  if (!f.secure_url) return null;
  return {
    label,
    value: f.original_name || "Uploaded file",
    href: f.secure_url,
  };
}

function formatWorkHistory(value: unknown): string | null {
  const entries = Array.isArray(value) ? value : [];
  if (entries.length === 0) return null;
  return entries
    .map((entry) => {
      const e = entry as WorkHistoryEntry & {
        employer?: string;
        job_title?: string;
        from?: string;
        to?: string;
      };
      const end = e.current ? "Present" : e.end || e.to || "—";
      const title = e.title || e.job_title || "Role";
      const company = e.company || e.employer || "Company";
      const start = e.start || e.from || "?";
      return `${title} at ${company} (${start} – ${end})`;
    })
    .join("\n");
}

function formatEducation(value: unknown): string | null {
  const entries = Array.isArray(value) ? value : [];
  if (entries.length === 0) return null;
  return entries
    .map((entry) => {
      const e = entry as EducationEntry & {
        institution?: string;
        from?: string;
        to?: string;
      };
      const degree = e.degree?.trim() ? ` — ${e.degree}` : "";
      const institution = e.institutionName || e.institution || "—";
      const type = e.institutionType ? `${e.institutionType}: ` : "";
      const start = e.yearStarted || e.from || "?";
      const end = e.yearCompleted || e.to || "?";
      return `${type}${institution} (${start}–${end}${degree})`;
    })
    .join("\n");
}

function certificateItems(files: unknown): ProfileReviewItem[] {
  if (!Array.isArray(files)) return [];
  return files
    .filter((f) => f && typeof f === "object" && (f as UploadedFile).secure_url)
    .map((f, i) => {
      const file = f as UploadedFile;
      return {
        label: files.length > 1 ? `Certificate ${i + 1}` : "Certificate",
        value: file.original_name || "Uploaded file",
        href: file.secure_url,
      };
    });
}

function pick(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    if (v?.trim()) return v.trim();
  }
  return null;
}

function citizenshipLabel(app: Record<string, unknown>): string | null {
  const derived = deriveCitizenshipFromApplication(app);
  if (derived) return derived;
  if (app.is_citizen === "Yes") return "Citizen";
  if (app.is_citizen === "No") return "Non-citizen";
  return null;
}

function collect(items: (ProfileReviewItem | null)[]): ProfileReviewItem[] {
  return items.filter(Boolean) as ProfileReviewItem[];
}

function collectRefereeItems(app: Record<string, unknown>): ProfileReviewItem[] {
  const byIndex = new Map<
    number,
    { name?: string; phone?: string; email?: string; relationship?: string }
  >();

  for (const key of Object.keys(app)) {
    const match = key.match(/^reference_(\d+)_(name|phone|email|relationship)$/i);
    if (!match) continue;
    const index = Number(match[1]);
    const part = match[2].toLowerCase();
    const value = str(app[key]);
    if (!value) continue;
    const row = byIndex.get(index) ?? {};
    if (part === "name") row.name = value;
    if (part === "phone") row.phone = value;
    if (part === "email") row.email = value;
    if (part === "relationship") row.relationship = value;
    byIndex.set(index, row);
  }

  const items: ProfileReviewItem[] = [];
  for (const index of [...byIndex.keys()].sort((a, b) => a - b)) {
    const ref = byIndex.get(index)!;
    if (!ref.name && !ref.phone && !ref.email) continue;
    items.push(
      ...collect([
        item(`Referee ${index} — name`, ref.name),
        item(`Referee ${index} — phone`, ref.phone),
        item(`Referee ${index} — email`, ref.email),
        item(`Referee ${index} — relationship`, ref.relationship),
      ]),
    );
  }
  return items;
}

function section(title: string, items: ProfileReviewItem[]): ProfileReviewSection | null {
  if (items.length === 0) return null;
  return { title, items };
}

function nonEmptySections(sections: (ProfileReviewSection | null)[]): ProfileReviewSection[] {
  return sections.filter(Boolean) as ProfileReviewSection[];
}

/**
 * Printable final profile only — job application + onboarding additions.
 * Not used on the onboarding form steps.
 */
export function buildMergedCandidateProfile(input: {
  applicationFormData?: Record<string, unknown> | null;
  onboardingFormData?: OnboardingFormData | null;
}): ProfileReviewGroup[] {
  const app = normalizeApplicationFormData(input.applicationFormData);
  const onboard = input.onboardingFormData ?? {};
  const personal = onboard.personal ?? {};
  const emergency = onboard.emergency ?? {};
  const nextOfKin = onboard.next_of_kin ?? {};
  const payment = onboard.payment ?? {};
  const medical = onboard.medical ?? {};
  const bio = onboard.biosecurity ?? {};
  const declarations = onboard.declarations ?? {};

  const applicationGroup: ProfileReviewGroup = {
    title: "Job application",
    description: "Information submitted when you applied for this role.",
    sections: nonEmptySections([
      section(
        "Personal details",
        collect([
          item("First name", str(app.first_name)),
          item("Surname", str(app.last_name)),
          item("Email", str(app.email)),
          item("Mobile phone", str(app.phone)),
          item("Date of birth", formatDateDisplay(str(app.date_of_birth))),
          item("Gender", str(app.gender)),
          item("Nationality", str(app.nationality)),
          item("Citizenship", citizenshipLabel(app)),
          item("Ghana Card number", pick(str(app.ghana_card), str(app.ghana_card_no))),
          item("Passport number", str(app.passport_number)),
        ]),
      ),
      section(
        "Work experience",
        collect([
          item("Work history", formatWorkHistory(app.work_history ?? app.work_experience), {
            fullWidth: true,
          }),
          item("Years of experience", str(app.years_experience)),
          item("Skills", str(app.skills), { fullWidth: true }),
        ]),
      ),
      section(
        "Qualifications & education",
        collect([
          item(
            "Educational qualifications",
            formatEducation(app.education_history ?? app.education),
            { fullWidth: true },
          ),
        ]),
      ),
      section("Application documents", [
        ...collect([
          fileItem("CV / résumé", app.cv),
          item("Cover letter", str(app.cover_letter), { fullWidth: true }),
          fileItem("Passport bio page", app.passport_bio_page),
        ]),
        ...certificateItems(app.certificates),
      ]),
      section("Referees", collectRefereeItems(app)),
    ]),
  };

  const onboardingGroup: ProfileReviewGroup = {
    title: "Onboarding",
    description: "Additional details collected during employee onboarding.",
    sections: nonEmptySections([
      section(
        "Personal details (onboarding)",
        collect([
          item("Middle name(s)", str(personal.middle_names)),
          item("SSNIT number", str(personal.ssnit_number)),
          item("Region", str(personal.region)),
          item("Residential address", str(personal.residential_address), { fullWidth: true }),
          item("Ghana Post GPS address", str(personal.gps_address)),
        ]),
      ),
      section(
        "Emergency contact",
        collect([
          item("Name", str(emergency.full_name)),
          item("Relationship", str(emergency.relationship)),
          item("Phone", str(emergency.phone)),
          item("Address", str(emergency.address), { fullWidth: true }),
        ]),
      ),
      section(
        "Next of kin",
        collect([
          item("Name", str(nextOfKin.full_name)),
          item("Relationship", str(nextOfKin.relationship)),
          item("Phone", str(nextOfKin.phone)),
          item("Address", str(nextOfKin.address), { fullWidth: true }),
        ]),
      ),
      section(
        "Payment details",
        collect([
          item("Payment method", str(payment.method)),
          item("Bank name", str(payment.bank_name)),
          item("Account name", str(payment.account_name)),
          item("Account number", str(payment.account_number)),
          item("Mobile money network", str(payment.momo_network)),
          item("Mobile money registered name", str(payment.momo_registered_name)),
          item("Mobile money number", str(payment.momo_number)),
        ]),
      ),
      section(
        "Medical & safety",
        collect([
          item("Blood group", str(medical.blood_group)),
          item("Allergies", str(medical.allergies)),
          item("Medical conditions", str(medical.conditions), { fullWidth: true }),
          fileItem("Medical report", medical.medical_report),
          item(
            "Medical report declaration",
            medical.acknowledge_referral ? "Acknowledged" : null,
          ),
        ]),
      ),
      section(
        "Biosecurity declaration",
        collect([
          item(
            "Household pigs or pig contact outside work",
            bio.household_pigs === "yes" ? "Yes" : bio.household_pigs === "no" ? "No" : null,
          ),
          item(
            "Household member at pig farm / market / slaughter facility",
            bio.household_pig_work === "yes" ? "Yes" : bio.household_pig_work === "no" ? "No" : null,
          ),
          item(
            "Visited another swine site in past 12 months",
            bio.visited_swine_site_12m === "yes"
              ? "Yes"
              : bio.visited_swine_site_12m === "no"
                ? "No"
                : null,
          ),
          item(
            "Travelled to ASF-affected region in past 30 days",
            bio.asf_travel_30d === "yes" ? "Yes" : bio.asf_travel_30d === "no" ? "No" : null,
          ),
          item("Biosecurity commitment initials", str(bio.commitment_initials)),
          item("Additional details", str(bio.details), { fullWidth: true }),
        ]),
      ),
      section(
        "Consent & signature",
        collect([
          item("Data processing consent", declarations.data_consent ? "Yes" : null),
          item("Signature (typed name)", str(declarations.signature_name)),
          item("Signature date", formatDateDisplay(str(declarations.signature_date))),
        ]),
      ),
    ]),
  };

  return [applicationGroup, onboardingGroup].filter((group) => group.sections.length > 0);
}

/** Flat section list (legacy). */
export function flattenProfileGroups(groups: ProfileReviewGroup[]): ProfileReviewSection[] {
  return groups.flatMap((group) => group.sections);
}
