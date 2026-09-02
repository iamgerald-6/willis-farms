import { siteContent } from "@/content/siteContent";

/** Maps public apply role → internal interview guide key */
export type InterviewGuideKey =
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5"
  | "L6"
  | "L7"
  | "consultant"
  | "data_analyst"
  | "veterinarian";

export interface CareerOpening {
  slug: string;
  title: string;
  location: string;
  type: string;
  summary: string;
  interviewGuideKey: InterviewGuideKey;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Structured openings from site content (talent pool roles) */
const SITE_OPENINGS: CareerOpening[] = siteContent.careers.openings.map((o) => {
  const slug = slugify(o.title);
  const guideKey: InterviewGuideKey =
    slug.includes("quality") || slug.includes("biosecurity") ? "L2" : "L1";
  return {
    slug,
    title: o.title,
    location: o.location,
    type: o.type,
    summary: o.summary,
    interviewGuideKey: guideKey,
  };
});

/** Grade-specific and specialist roles aligned to docs/interview/ */
export const SPECIALIST_OPENINGS: CareerOpening[] = [
  {
    slug: "junior_swine_technician_l1",
    title: "Junior Swine Technician (L1)",
    location: "Eastern Region, Ghana",
    type: "Full-time",
    summary:
      "Entry-level breeding operations role — daily care, cleaning, feeding, and observation under supervision.",
    interviewGuideKey: "L1",
  },
  {
    slug: "swine_technician_l2",
    title: "Swine Technician (L2)",
    location: "Eastern Region, Ghana",
    type: "Full-time",
    summary:
      "Hands-on technician executing breeding, farrowing, and grower-finisher routines to SOP.",
    interviewGuideKey: "L2",
  },
  {
    slug: "senior_swine_technician_l3",
    title: "Senior Swine Technician (L3)",
    location: "Eastern Region, Ghana",
    type: "Full-time",
    summary:
      "Lead AI operator, floor coordinator, and coach to junior staff with first-line record checking.",
    interviewGuideKey: "L3",
  },
  {
    slug: "herd_supervisor_manager_l4",
    title: "Herd Supervisor / Manager (L4)",
    location: "Eastern Region, Ghana",
    type: "Full-time",
    summary:
      "Section operational control — daily planning, staff supervision, KPI ownership, and compliance.",
    interviewGuideKey: "L4",
  },
  {
    slug: "assistant_farm_manager_l5",
    title: "Assistant Farm Manager (L5)",
    location: "Eastern Region, Ghana",
    type: "Full-time",
    summary:
      "Second-line management — multi-section coordination, gilt pipeline oversight, and reporting integrity.",
    interviewGuideKey: "L5",
  },
  {
    slug: "breeding_farm_manager_l6",
    title: "Breeding Farm Manager (L6)",
    location: "Eastern Region, Ghana",
    type: "Full-time",
    summary:
      "Functional management of the multiplication farm — KPIs, genetics, people, and budget.",
    interviewGuideKey: "L6",
  },
  {
    slug: "operations_production_manager_l7",
    title: "Operations / Production Manager (L7)",
    location: "Eastern Region, Ghana",
    type: "Full-time",
    summary:
      "Enterprise operational leadership across breeding and grower-finisher operations.",
    interviewGuideKey: "L7",
  },
  {
    slug: "data_analyst",
    title: "Data Analyst",
    location: "Eastern Region, Ghana",
    type: "Full-time",
    summary:
      "KPI reporting, dashboards, and data integrity for the multiplication operation.",
    interviewGuideKey: "data_analyst",
  },
  {
    slug: "veterinarian_animal_health_biosecurity_lead",
    title: "Veterinarian — Animal Health & Biosecurity Lead",
    location: "Eastern Region, Ghana",
    type: "Full-time",
    summary:
      "Veterinary leadership, herd health programmes, and biosecurity governance.",
    interviewGuideKey: "veterinarian",
  },
];

export const ALL_CAREER_OPENINGS: CareerOpening[] = [
  ...SITE_OPENINGS,
  ...SPECIALIST_OPENINGS.filter(
    (s) => !SITE_OPENINGS.some((o) => o.slug === s.slug),
  ),
];

export function getOpeningBySlug(slug: string): CareerOpening | undefined {
  return ALL_CAREER_OPENINGS.find((o) => o.slug === slug);
}

/** Resolve interview guide from legacy hardcoded opening slugs only. */
export function getInterviewGuideKeyForRoleSlug(
  slug: string,
): InterviewGuideKey | undefined {
  const opening = getOpeningBySlug(slug);
  return opening?.interviewGuideKey;
}

export function generateReferenceNumber(): string {
  const year = new Date().getFullYear();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WF-${year}-${suffix}`;
}
