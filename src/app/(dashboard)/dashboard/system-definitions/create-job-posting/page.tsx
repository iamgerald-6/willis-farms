"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import type { OrgCustomListItem, OrgCustomListType } from "@/lib/organizationalStructureCustomLists";
import type { JobPosting, JobPostingStatus } from "@/lib/careers/jobPostings";
import {
  formatPublicJobTitle,
  JOB_POSTING_CONTENT_SECTIONS,
  JOB_POSTING_STATUS_LABELS,
  normalizePostingStatus,
  previewDescription,
} from "@/lib/careers/jobPostings";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import { ACCEPT_JD } from "@/lib/uploadConstraints";
import { IOSTimePicker } from "@/components/IOSTimePicker";
import { SectionTextEditor } from "@/components/SectionTextEditor";
import PostingInterviewSetup, {
  type PostingInterviewSetupHandle,
  type PostingOverviewRow,
} from "../components/PostingInterviewSetup";
import { normalizePostingInterviewSetup } from "@/lib/careers/postingInterviewSetup";

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

// The org structure mapping cascade (see Org structure mapping set up) —
// Site is always first, then Business unit, Department, Section, Position
// in that order. These five are always shown on Create job posting and
// always required; every other org-structure field is opt-in per posting.
const CHAIN_TABLE_ORDER = ["sites", "business_units", "departments", "sections", "custom_position"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Accra",
  });
}

type FormState = {
  description: string;
  role_scope: string;
  key_responsibilities: string;
  minimum_qualifications: string;
  preferred_qualifications: string;
  experience: string;
  required_skills_attributes: string;
  non_negotiable_standards: string;
  closes_at: string;
  status: JobPostingStatus;
  jd_file_url: string | null;
  jd_file_public_id: string | null;
};

const emptyForm = (): FormState => ({
  description: "",
  role_scope: "",
  key_responsibilities: "",
  minimum_qualifications: "",
  preferred_qualifications: "",
  experience: "",
  required_skills_attributes: "",
  non_negotiable_standards: "",
  closes_at: "",
  status: "published",
  jd_file_url: null,
  jd_file_public_id: null,
});

export default function CreateJobPostingPage() {
  const queryClient = useQueryClient();

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const profile = users?.find((u) => u.user_id === session?.user?.id);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const { data: groupPresetData } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;
  const canView =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "view", sessionRole, groupPresets);
  const canAdd =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "add", sessionRole, groupPresets);
  const canEdit =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "edit", sessionRole, groupPresets);

  // --- Org-structure list types + their items (drives one <select> per list) ---
  const { data: listTypes = [], isLoading: listTypesLoading } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/custom-list-types");
      return res.data.data as OrgCustomListType[];
    },
    enabled: !!canView,
  });

  const orgFieldListTypes = useMemo(
    () =>
      listTypes.filter(
        (lt): lt is OrgCustomListType & { job_posting_column: string } =>
          typeof lt.job_posting_column === "string" &&
          lt.job_posting_column.length > 0 &&
          lt.is_active !== false,
      ),
    [listTypes],
  );

  const orgFieldItemQueries = useQueries({
    queries: orgFieldListTypes.map((lt) => ({
      queryKey: ["organizational_structure_custom_list_items", lt.id],
      queryFn: async () => {
        const res = await api.get(`/organizational-structure/custom-list-types/${lt.id}/items`);
        return res.data.data as OrgCustomListItem[];
      },
      enabled: !!canView,
    })),
  });

  // Position, Site, and Employment type drive title/interview-guide,
  // location, and employment type instead of their own separate fields —
  // found by table_name since that never changes (unlike label, which an
  // admin can rename).
  const positionIndex = orgFieldListTypes.findIndex((lt) => lt.table_name === "custom_position");
  const siteIndex = orgFieldListTypes.findIndex((lt) => lt.table_name === "sites");
  const employmentTypeIndex = orgFieldListTypes.findIndex(
    (lt) => lt.table_name === "custom_employment_type",
  );
  const positionListType = positionIndex >= 0 ? orgFieldListTypes[positionIndex] : null;
  const siteListType = siteIndex >= 0 ? orgFieldListTypes[siteIndex] : null;
  const employmentTypeListType =
    employmentTypeIndex >= 0 ? orgFieldListTypes[employmentTypeIndex] : null;
  const positionItems = positionIndex >= 0 ? orgFieldItemQueries[positionIndex]?.data ?? [] : [];
  const siteItems = siteIndex >= 0 ? orgFieldItemQueries[siteIndex]?.data ?? [] : [];
  const employmentTypeItems =
    employmentTypeIndex >= 0 ? orgFieldItemQueries[employmentTypeIndex]?.data ?? [] : [];

  // --- Org structure mapping set up (cascading Site -> Business unit ->
  // Department -> Section -> Position) — see Organizational structure ->
  // Org structure mapping set up. That tool is fully general (any list can
  // be added as a level, in any order, e.g. Salary could be mapped too),
  // but Create job posting only ever treats these five as its always-shown,
  // always-required, cascading fields — anything else added to the mapping
  // chain is irrelevant here and simply ignored for this purpose. A level
  // that hasn't been added at all yet, or has been added but has zero
  // mappings under it, falls back to showing every item unrestricted, so
  // this rolls out one level at a time without breaking postings that
  // don't use it.
  type MappingLevel = {
    id: string;
    position: number;
    list_type_id: string;
    list_type: { id: string; label: string; singular: string; table_name: string };
  };
  type MappingNode = { id: string; level_id: string; item_id: string; parent_node_id: string | null };

  const { data: mappingLevels = [] } = useQuery<MappingLevel[]>({
    queryKey: ["org_mapping_levels_list"],
    queryFn: async () => (await api.get("/organizational-structure/mapping-levels")).data.data,
    enabled: !!canView,
  });
  const { data: mappingNodes = [] } = useQuery<MappingNode[]>({
    queryKey: ["org_mapping_nodes_list"],
    queryFn: async () => (await api.get("/organizational-structure/mapping-nodes")).data.data,
    enabled: !!canView,
  });

  function chainLevel(tableName: string): MappingLevel | undefined {
    return mappingLevels.find((l) => l.list_type.table_name === tableName);
  }

  /** The mapping node representing the currently-selected item at `tableName` (one of the
   * five required fields), resolved by walking the chain from Site down — undefined if
   * that field isn't mapped at all, hasn't been picked yet, or the picked combination
   * isn't actually mapped. "sites" is always anchored to its own ROOT node (parent_node_id
   * null) regardless of whatever else may exist in the wider mapping system. */
  function resolvedNodeIdForRequiredField(tableName: string): string | undefined {
    const level = chainLevel(tableName);
    if (!level) return undefined;
    const lt = orgFieldListTypes.find((o) => o.table_name === tableName);
    if (!lt) return undefined;
    const itemId = orgFieldValues[lt.job_posting_column];
    if (!itemId) return undefined;

    const idx = CHAIN_TABLE_ORDER.indexOf(tableName);
    const parentNodeId =
      idx <= 0 ? null : resolvedNodeIdForRequiredField(CHAIN_TABLE_ORDER[idx - 1]) ?? undefined;
    if (parentNodeId === undefined) return undefined;

    return mappingNodes.find(
      (n) => n.level_id === level.id && n.item_id === itemId && n.parent_node_id === parentNodeId,
    )?.id;
  }

  // Site is always first; Business unit/Department/Section/Position follow
  // it in that order, then every other org-structure field keeps its
  // existing relative order.
  const orderedOrgFieldListTypes = useMemo(() => {
    const chainFields = CHAIN_TABLE_ORDER.map((tableName) =>
      orgFieldListTypes.find((lt) => lt.table_name === tableName),
    ).filter((lt): lt is (typeof orgFieldListTypes)[number] => !!lt);
    const chainTableNames = new Set(CHAIN_TABLE_ORDER);
    const otherFields = orgFieldListTypes.filter((lt) => !chainTableNames.has(lt.table_name));
    return [...chainFields, ...otherFields];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgFieldListTypes]);
  const indexByListTypeId = useMemo(
    () => new Map(orgFieldListTypes.map((lt, i) => [lt.id, i])),
    [orgFieldListTypes],
  );

  const chainColumnsInOrder = CHAIN_TABLE_ORDER.map(
    (t) => orgFieldListTypes.find((lt) => lt.table_name === t)?.job_posting_column,
  ).filter((c): c is string => !!c);

  function downstreamChainColumnsAfter(column: string): string[] {
    const idx = chainColumnsInOrder.indexOf(column);
    if (idx === -1) return [];
    return chainColumnsInOrder.slice(idx + 1);
  }

  function itemsForChainField(
    tableName: string,
    items: OrgCustomListItem[],
  ): OrgCustomListItem[] {
    if (tableName === "sites") return items;

    const level = chainLevel(tableName);
    if (!level) return items;

    const levelNodes = mappingNodes.filter((n) => n.level_id === level.id);
    if (levelNodes.length === 0) return items;

    const idx = CHAIN_TABLE_ORDER.indexOf(tableName);
    const parentTable = CHAIN_TABLE_ORDER[idx - 1];
    const parentNodeId = resolvedNodeIdForRequiredField(parentTable);
    if (parentNodeId === undefined) return [];

    const ids = new Set(
      levelNodes.filter((n) => n.parent_node_id === parentNodeId).map((n) => n.item_id),
    );
    return items.filter((i) => ids.has(i.id));
  }

  // --- Postings list ---
  const { data: postings = [], isLoading: postingsLoading } = useQuery({
    queryKey: ["job_postings"],
    queryFn: async () => {
      const res = await api.get("/careers/postings");
      return res.data.data as JobPosting[];
    },
    enabled: !!canView,
  });

  // --- Active / Archive tab ---
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");

  const sorted = useMemo(
    () =>
      [...postings]
        .filter((p) => !p.superseded_by && !p.archived_at)
        .sort((a, b) => +new Date(b.created_at as string) - +new Date(a.created_at as string)),
    [postings],
  );

  const archived = useMemo(
    () =>
      [...postings]
        .filter((p) => !!p.archived_at)
        .sort((a, b) => +new Date(b.archived_at as string) - +new Date(a.archived_at as string)),
    [postings],
  );

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived: shouldArchive }: { id: string; archived: boolean }) => {
      await api.patch(`/careers/postings/${id}`, { archived: shouldArchive });
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.archived ? "Posting archived." : "Posting unarchived.");
      queryClient.invalidateQueries({ queryKey: ["job_postings"] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not update posting.");
    },
  });

  // --- Form state ---
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<JobPosting | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [orgFieldValues, setOrgFieldValues] = useState<Record<string, string>>({});
  // Per-list-type choice, keyed by list id — only meaningful for
  // is_numeric_range lists (Age, Salary, ...), where a posting can pick
  // one value or a min/max range instead.
  const [orgFieldMode, setOrgFieldMode] = useState<Record<string, "single" | "range">>({});
  // Site, Business unit, Department, Section, and Position (the mapping
  // cascade — see Org structure mapping set up) are always on the form and
  // always required, since the posting's title/location/interview-setup
  // linkage all key off Position/Site. Every other org-structure list
  // (Grade level, Employment Type, Age, Salary, future custom lists) is
  // opt-in per posting — this tracks which of those the HR has chosen to
  // add, by org_custom_list_types.id.
  const [addedOrgFieldIds, setAddedOrgFieldIds] = useState<Set<string>>(new Set());
  const [uploadingJd, setUploadingJd] = useState(false);
  const [extracting, setExtracting] = useState(false);
  // After Save, the form moves from the posting-details step to an
  // Interview step for that same posting (create and edit both go through
  // this) — postingStep tracks which one is showing, and
  // interviewPostingId is the posting the Interview step now applies to
  // (known immediately on edit; only known once the create request
  // returns, since there's no id before that).
  const [postingStep, setPostingStep] = useState<"details" | "interview">("details");
  const [interviewPostingId, setInterviewPostingId] = useState<string | null>(null);
  const postingInterviewSetupRef = useRef<PostingInterviewSetupHandle>(null);
  const [reuseSelection, setReuseSelection] = useState("");

  // "Reuse interview setup" options — any posting (active or archived) that
  // already has interview content filled in, one entry per title (the most
  // recent posting wins when a title repeats — postings is already newest
  // first), excluding whichever posting the Interview step is currently
  // open for.
  const reusablePostings = useMemo(() => {
    const seenTitles = new Set<string>();
    const options: { id: string; title: string }[] = [];
    for (const p of postings) {
      if (p.id === interviewPostingId) continue;
      const hasOverviewContent =
        !!p.interview_description?.trim() ||
        !!p.interview_panel_members?.trim() ||
        p.interview_duration_minutes != null;
      const setup = normalizePostingInterviewSetup(p.interview_setup);
      const hasSetupContent =
        setup.screening.length > 0 ||
        setup.questions.length > 0 ||
        setup.scenarios.length > 0 ||
        setup.disqualifiers.length > 0 ||
        setup.extraStages.length > 0;
      if (!hasOverviewContent && !hasSetupContent) continue;

      const title = formatPublicJobTitle(p.title) || p.title;
      if (!title || seenTitles.has(title)) continue;
      seenTitles.add(title);
      options.push({ id: p.id, title });
    }
    return options;
  }, [postings, interviewPostingId]);

  const handleReuseInterviewSetup = (sourcePostingId: string) => {
    const source = postings.find((p) => p.id === sourcePostingId);
    if (!source) return;
    postingInterviewSetupRef.current?.applyReuse({
      description: (source.interview_description as string | null) ?? "",
      panelMembers: (source.interview_panel_members as string | null) ?? "",
      durationMinutes: (source.interview_duration_minutes as number | null) ?? null,
      setup: normalizePostingInterviewSetup(source.interview_setup),
    });
    toast.success(`Reused interview setup from "${formatPublicJobTitle(source.title)}".`);
    setReuseSelection("");
  };

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
    setOrgFieldValues({});
    setOrgFieldMode({});
    setAddedOrgFieldIds(new Set());
    setPostingStep("details");
    setInterviewPostingId(null);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOrgFieldValues({});
    setOrgFieldMode({});
    setAddedOrgFieldIds(new Set());
    setPostingStep("details");
    setInterviewPostingId(null);
    setShowForm(true);
  };

  const openEdit = (posting: JobPosting) => {
    setEditing(posting);
    setPostingStep("details");
    setInterviewPostingId(null);
    setForm({
      description: posting.description,
      role_scope: posting.role_scope ?? "",
      key_responsibilities: posting.key_responsibilities ?? "",
      minimum_qualifications: posting.minimum_qualifications ?? "",
      preferred_qualifications: posting.preferred_qualifications ?? "",
      experience: posting.experience ?? "",
      required_skills_attributes: posting.required_skills_attributes ?? "",
      non_negotiable_standards: posting.non_negotiable_standards ?? "",
      closes_at: posting.closes_at.slice(0, 16),
      status: normalizePostingStatus(posting),
      jd_file_url: posting.jd_file_url,
      jd_file_public_id: posting.jd_file_public_id,
    });
    const nextOrgValues: Record<string, string> = {};
    const nextOrgMode: Record<string, "single" | "range"> = {};
    const nextAddedIds = new Set<string>();
    for (const lt of orgFieldListTypes) {
      const value = posting[lt.job_posting_column];
      if (typeof value === "string") nextOrgValues[lt.job_posting_column] = value;

      const minValue = lt.job_posting_min_column ? posting[lt.job_posting_min_column] : null;
      const maxValue = lt.job_posting_max_column ? posting[lt.job_posting_max_column] : null;
      if (typeof minValue === "string" && lt.job_posting_min_column) {
        nextOrgValues[lt.job_posting_min_column] = minValue;
      }
      if (typeof maxValue === "string" && lt.job_posting_max_column) {
        nextOrgValues[lt.job_posting_max_column] = maxValue;
      }
      if (lt.is_numeric_range) {
        nextOrgMode[lt.id] =
          typeof minValue === "string" || typeof maxValue === "string" ? "range" : "single";
      }
      // Site/Business unit/Department/Section/Position are always shown
      // regardless of this set. Every other field that already has a saved
      // value on this posting was clearly added before — keep it visible.
      const hasValue =
        typeof value === "string" || typeof minValue === "string" || typeof maxValue === "string";
      if (hasValue && !CHAIN_TABLE_ORDER.includes(lt.table_name)) {
        nextAddedIds.add(lt.id);
      }
    }
    setOrgFieldValues(nextOrgValues);
    setOrgFieldMode(nextOrgMode);
    setAddedOrgFieldIds(nextAddedIds);
    setShowForm(true);
  };

  // Title and interview guide come from the selected Position instead of
  // their own field — the server generates the posting's title and web
  // address directly from the Position's label (see postings API routes).
  // Location comes from the selected Site's name and region. Employment
  // type comes from the selected Employment type item's label. None of
  // these have their own free-text/select field anymore — all three are
  // org-structure lists.
  const selectedPosition = positionListType
    ? positionItems.find((p) => p.id === orgFieldValues[positionListType.job_posting_column])
    : undefined;
  const selectedSite = siteListType
    ? siteItems.find((s) => s.id === orgFieldValues[siteListType.job_posting_column])
    : undefined;
  const selectedEmploymentType = employmentTypeListType
    ? employmentTypeItems.find(
        (e) => e.id === orgFieldValues[employmentTypeListType.job_posting_column],
      )
    : undefined;

  const derivedLocation = selectedSite
    ? [selectedSite.label, selectedSite.region].filter(Boolean).join(", ")
    : "";

  // Read-only overview shown on the Interview step — an explicit allow-list
  // by table_name (not exclusion), so Salary, Salary Band, Age, and any
  // future custom list an admin adds never show up here even though they're
  // required fields on the Details step.
  const INTERVIEW_OVERVIEW_TABLE_NAMES = [
    "custom_position",
    "sites",
    "business_units",
    "departments",
    "sections",
    "grade_levels",
    "custom_employment_type",
  ];
  const interviewOverviewRows: PostingOverviewRow[] = useMemo(() => {
    return INTERVIEW_OVERVIEW_TABLE_NAMES.map((tableName) => {
      const index = orgFieldListTypes.findIndex((lt) => lt.table_name === tableName);
      if (index === -1) return null;
      const lt = orgFieldListTypes[index];
      const items = orgFieldItemQueries[index]?.data ?? [];
      const selectedId = orgFieldValues[lt.job_posting_column];
      const item = items.find((i) => i.id === selectedId);
      return { label: lt.label, value: item?.label ?? "—" };
    }).filter((row): row is PostingOverviewRow => row !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgFieldListTypes, orgFieldItemQueries, orgFieldValues]);

  // Site/Business unit/Department/Section/Position are always required.
  // Every other org-structure field is only required once the HR has
  // chosen to add it to this posting (see addedOrgFieldIds) — a
  // numeric-range list (e.g. Age) counts as filled in if either its single
  // value is set, or both its min and max are set, depending on which mode
  // it's currently in.
  const missingOrgFieldLabels = orgFieldListTypes
    .filter((lt) => CHAIN_TABLE_ORDER.includes(lt.table_name) || addedOrgFieldIds.has(lt.id))
    .filter((lt) => {
      if (!lt.is_numeric_range) {
        return !orgFieldValues[lt.job_posting_column];
      }
      const mode = orgFieldMode[lt.id] ?? "single";
      const canRangeHere =
        lt.numeric_range_mode === "digits" && lt.job_posting_min_column && lt.job_posting_max_column;
      if (!canRangeHere || mode === "single") {
        return !orgFieldValues[lt.job_posting_column];
      }
      return (
        !orgFieldValues[lt.job_posting_min_column as string] ||
        !orgFieldValues[lt.job_posting_max_column as string]
      );
    })
    .map((lt) => lt.label);

  const orgFieldsComplete = missingOrgFieldLabels.length === 0;

  const handleExtract = async () => {
    if (!form.jd_file_url) return;
    setExtracting(true);
    try {
      const res = await api.post("/careers/postings/extract", {
        file_url: form.jd_file_url,
      });
      const fields = res.data.data as {
        summary: string;
        role_scope: string;
        key_responsibilities: string;
        minimum_qualifications: string;
        preferred_qualifications: string;
        experience: string;
        required_skills_attributes: string;
        non_negotiable_standards: string;
      };
      setForm((f) => ({
        ...f,
        description: fields.summary || f.description,
        role_scope: fields.role_scope || f.role_scope,
        key_responsibilities: fields.key_responsibilities || f.key_responsibilities,
        minimum_qualifications: fields.minimum_qualifications || f.minimum_qualifications,
        preferred_qualifications: fields.preferred_qualifications || f.preferred_qualifications,
        experience: fields.experience || f.experience,
        required_skills_attributes:
          fields.required_skills_attributes || f.required_skills_attributes,
        non_negotiable_standards: fields.non_negotiable_standards || f.non_negotiable_standards,
      }));
      toast.success("Fields filled in from the document — review before saving.");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Couldn't read that document.";
      toast.error(message);
    } finally {
      setExtracting(false);
    }
  };

  // Only send the column(s) matching each field's current mode — e.g. if a
  // numeric-range field is in "single" mode, its min/max columns are sent
  // as null so any range picked before switching modes doesn't linger.
  const effectiveOrgFieldValues = (): Record<string, string | null> => {
    const values: Record<string, string | null> = {};
    for (const lt of orgFieldListTypes) {
      if (!lt.is_numeric_range) {
        values[lt.job_posting_column] = orgFieldValues[lt.job_posting_column] || null;
        continue;
      }
      const mode = orgFieldMode[lt.id] ?? "single";
      if (mode === "single") {
        values[lt.job_posting_column] = orgFieldValues[lt.job_posting_column] || null;
        if (lt.job_posting_min_column) values[lt.job_posting_min_column] = null;
        if (lt.job_posting_max_column) values[lt.job_posting_max_column] = null;
      } else {
        values[lt.job_posting_column] = null;
        if (lt.job_posting_min_column) {
          values[lt.job_posting_min_column] = orgFieldValues[lt.job_posting_min_column] || null;
        }
        if (lt.job_posting_max_column) {
          values[lt.job_posting_max_column] = orgFieldValues[lt.job_posting_max_column] || null;
        }
      }
    }
    return values;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        // No job_title_key here — the server derives the posting's title
        // and web address straight from the selected Position (position_id
        // is already included via effectiveOrgFieldValues() below).
        location: derivedLocation,
        employment_type: selectedEmploymentType?.label ?? "",
        summary: previewDescription(form.description.trim()),
        description: form.description.trim(),
        role_scope: form.role_scope,
        key_responsibilities: form.key_responsibilities,
        minimum_qualifications: form.minimum_qualifications,
        preferred_qualifications: form.preferred_qualifications,
        experience: form.experience,
        required_skills_attributes: form.required_skills_attributes,
        non_negotiable_standards: form.non_negotiable_standards,
        // form.closes_at is "YYYY-MM-DDTHH:mm", treated as Ghana local time
        // (UTC+0, no DST) — appending "Z" stores it as literal UTC rather
        // than reinterpreting it in the admin's own browser timezone.
        closes_at: `${form.closes_at}:00Z`,
        status: form.status,
        jd_file_url: form.jd_file_url,
        jd_file_public_id: form.jd_file_public_id,
        ...effectiveOrgFieldValues(),
      };

      if (editing) {
        return api.patch(`/careers/postings/${editing.id}`, payload);
      }
      return api.post("/careers/postings", {
        ...payload,
        created_by: session?.user?.id,
      });
    },
    onSuccess: (res) => {
      toast.success(editing ? "Posting updated." : "Job posting created.");
      queryClient.invalidateQueries({ queryKey: ["job_postings"] });
      // Move on to the Interview step for this same posting instead of
      // closing the form — editing.id is already known when updating an
      // existing posting; for a brand-new one, the id only exists once
      // this response comes back.
      setInterviewPostingId(editing?.id ?? res?.data?.data?.id ?? null);
      setPostingStep("interview");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save posting.");
    },
  });

  // One-time (safely re-runnable) migration: copies each currently-open
  // posting's existing shared interview guide into its own Interview setup,
  // so nothing breaks for postings already in flight now that real
  // interviews read from a posting's own setup instead of the shared guide.
  // Skips any posting that already has Interview setup content, so this
  // button is harmless to click more than once.
  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/careers/postings/backfill-interview-setup");
      return res.data.data as { total: number; updated: number; skipped: number };
    },
    onSuccess: (data) => {
      toast.success(
        `Backfilled ${data.updated} posting${data.updated === 1 ? "" : "s"} (${data.skipped} already had Interview setup content).`,
      );
      queryClient.invalidateQueries({ queryKey: ["job_postings"] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Backfill failed.");
    },
  });

  if (sessionLoading || usersLoading) {
    return (
      <div className="p-4 md:p-6 bg-gray-50 min-h-full">
        <div className="h-8 w-56 bg-gray-100 rounded animate-pulse mb-2" />
        <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 text-sm">
            System Definitions view access is required to open this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <Link
        href="/dashboard/system-definitions"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to System Definitions
      </Link>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-red-600" />
            Create job posting
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Publish and edit career postings, including which site, business
            unit, department, and other organizational structure lists they
            belong to. Closing and republishing a posting still happens on
            the Recruitment page.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "Copy each open posting's current interview content into its own Interview setup? Postings that already have Interview setup content are skipped. Safe to run more than once.",
                  )
                ) {
                  backfillMutation.mutate();
                }
              }}
              disabled={backfillMutation.isPending}
              className="mt-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 underline disabled:opacity-60"
            >
              {backfillMutation.isPending
                ? "Backfilling…"
                : "Backfill legacy interview setups (one-time)"}
            </button>
          )}
        </div>
        {canAdd && activeTab === "active" && (
          <button
            type="button"
            onClick={() => (showForm ? resetForm() : openCreate())}
            className="shrink-0 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Close" : "Add job posting"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab("active");
              resetForm();
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "active" ? "bg-red-600 text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("archived");
              resetForm();
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "archived" ? "bg-red-600 text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            Archive{archived.length > 0 ? ` (${archived.length})` : ""}
          </button>
        </div>

        {activeTab === "active" && showForm && postingStep === "interview" && canEdit && (
          <select
            value={reuseSelection}
            onChange={(e) => {
              const id = e.target.value;
              setReuseSelection(id);
              if (id) handleReuseInterviewSetup(id);
            }}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 bg-white"
          >
            <option value="">Reuse interview setup…</option>
            {reusablePostings.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {activeTab === "active" && showForm && postingStep === "interview" && interviewPostingId && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <p className="text-sm font-semibold text-gray-800 mb-1">Interview setup</p>
          <p className="text-xs text-gray-500 mb-4">
            Posting saved. Set the interview details for this specific role
            below.
          </p>
          <PostingInterviewSetup
            ref={postingInterviewSetupRef}
            postingId={interviewPostingId}
            overview={interviewOverviewRows}
            initialDescription={editing?.interview_description as string | null | undefined}
            initialPanelMembers={editing?.interview_panel_members as string | null | undefined}
            initialDurationMinutes={
              editing?.interview_duration_minutes as number | null | undefined
            }
            initialInterviewSetup={editing?.interview_setup}
            readOnly={!canEdit}
            onDone={resetForm}
          />
        </div>
      )}

      {activeTab === "active" && showForm && postingStep === "details" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <p className="text-sm font-semibold text-gray-800 mb-4">
            {editing ? "Edit job posting" : "New job posting"}
          </p>

          {/* Org-structure fields */}
          {orgFieldListTypes.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Organizational structure
              </p>
              <p className="text-xs text-gray-500 mb-3">
                Site, Business unit, Department, Section, and Position are always required. Add
                any other org-structure field this posting needs below.
              </p>

              {(() => {
                const optionalNotAdded = orderedOrgFieldListTypes.filter(
                  (lt) => !CHAIN_TABLE_ORDER.includes(lt.table_name) && !addedOrgFieldIds.has(lt.id),
                );
                if (optionalNotAdded.length === 0) return null;
                return (
                  <label className="block max-w-xs mb-3">
                    <span className="text-xs font-medium text-gray-600">+ Add field</span>
                    <select
                      className={`${inputClass} mt-1`}
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        setAddedOrgFieldIds((prev) => new Set(prev).add(id));
                      }}
                    >
                      <option value="">Choose a field to add…</option>
                      {optionalNotAdded.map((lt) => (
                        <option key={lt.id} value={lt.id}>
                          {lt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })()}

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {orderedOrgFieldListTypes
                  .filter(
                    (lt) => CHAIN_TABLE_ORDER.includes(lt.table_name) || addedOrgFieldIds.has(lt.id),
                  )
                  .map((lt) => {
                  const index = indexByListTypeId.get(lt.id) ?? -1;
                  const rawItems = orgFieldItemQueries[index]?.data ?? [];
                  const items = itemsForChainField(lt.table_name, rawItems);
                  const loadingItems = orgFieldItemQueries[index]?.isLoading;
                  const mode = orgFieldMode[lt.id] ?? "single";
                  // Range only makes sense for digits-mode numeric lists
                  // (e.g. Age). Bands-mode lists (e.g. Salary) already
                  // have each item as its own range, so they never get
                  // min/max columns in the first place — this check is
                  // just belt-and-suspenders.
                  const canRange =
                    lt.is_numeric_range &&
                    lt.numeric_range_mode === "digits" &&
                    lt.job_posting_min_column &&
                    lt.job_posting_max_column;

                  const singleSelect = (
                    <select
                      className={`${inputClass} mt-1`}
                      value={orgFieldValues[lt.job_posting_column] ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        setOrgFieldValues((prev) => {
                          const next = { ...prev, [lt.job_posting_column]: value };
                          for (const col of downstreamChainColumnsAfter(lt.job_posting_column)) {
                            delete next[col];
                          }
                          return next;
                        });
                      }}
                      disabled={loadingItems}
                    >
                      <option value="">Select {lt.singular.toLowerCase()}…</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  );

                  const isChainField = CHAIN_TABLE_ORDER.includes(lt.table_name);

                  return (
                    <div key={lt.id} className="block">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-gray-600">{lt.label} *</span>
                        <div className="inline-flex items-center gap-1.5">
                        {canRange && (
                          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden text-[11px]">
                            <button
                              type="button"
                              onClick={() => setOrgFieldMode((prev) => ({ ...prev, [lt.id]: "single" }))}
                              className={`px-2 py-0.5 font-medium transition-colors ${
                                mode === "single"
                                  ? "bg-red-600 text-white"
                                  : "bg-white text-gray-500 hover:bg-gray-50"
                              }`}
                            >
                              Single
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrgFieldMode((prev) => ({ ...prev, [lt.id]: "range" }))}
                              className={`px-2 py-0.5 font-medium transition-colors border-l border-gray-200 ${
                                mode === "range"
                                  ? "bg-red-600 text-white"
                                  : "bg-white text-gray-500 hover:bg-gray-50"
                              }`}
                            >
                              Range
                            </button>
                          </div>
                        )}
                        {!isChainField && (
                          <button
                            type="button"
                            onClick={() => {
                              setAddedOrgFieldIds((prev) => {
                                const next = new Set(prev);
                                next.delete(lt.id);
                                return next;
                              });
                              setOrgFieldValues((prev) => {
                                const next = { ...prev };
                                delete next[lt.job_posting_column];
                                if (lt.job_posting_min_column) delete next[lt.job_posting_min_column];
                                if (lt.job_posting_max_column) delete next[lt.job_posting_max_column];
                                return next;
                              });
                              setOrgFieldMode((prev) => {
                                const next = { ...prev };
                                delete next[lt.id];
                                return next;
                              });
                            }}
                            aria-label={`Remove ${lt.label}`}
                            className="text-gray-400 hover:text-red-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                        </div>
                      </div>

                      {!canRange || mode === "single" ? (
                        singleSelect
                      ) : (
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <select
                            className={inputClass}
                            value={orgFieldValues[lt.job_posting_min_column as string] ?? ""}
                            onChange={(e) =>
                              setOrgFieldValues((prev) => ({
                                ...prev,
                                [lt.job_posting_min_column as string]: e.target.value,
                              }))
                            }
                            disabled={loadingItems}
                          >
                            <option value="">Min…</option>
                            {items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                          <select
                            className={inputClass}
                            value={orgFieldValues[lt.job_posting_max_column as string] ?? ""}
                            onChange={(e) =>
                              setOrgFieldValues((prev) => ({
                                ...prev,
                                [lt.job_posting_max_column as string]: e.target.value,
                              }))
                            }
                            disabled={loadingItems}
                          >
                            <option value="">Max…</option>
                            {items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Job posting fields */}
          <div className="space-y-4">
            {(selectedPosition || selectedSite || selectedEmploymentType) && (
              <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-500 space-y-1">
                {selectedPosition && (
                  <p>
                    Job title:{" "}
                    <span className="font-medium text-gray-700">{selectedPosition.label}</span>
                  </p>
                )}
                {selectedSite && (
                  <p>
                    Location: <span className="font-medium text-gray-700">{derivedLocation}</span>
                  </p>
                )}
                {selectedEmploymentType && (
                  <p>
                    Employment type:{" "}
                    <span className="font-medium text-gray-700">{selectedEmploymentType.label}</span>
                  </p>
                )}
              </div>
            )}

            <div>
              <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                JD document
              </span>
              <p className="mt-0.5 text-[11px] text-gray-400">
                Upload the job description document, or skip this and type the fields below manually.
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-3 cursor-pointer border border-dashed border-gray-300 rounded-lg px-4 py-3 hover:border-red-300">
                  {uploadingJd ? (
                    <Loader2 className="w-5 h-5 animate-spin text-red-600" />
                  ) : (
                    <Upload className="w-5 h-5 text-gray-400" />
                  )}
                  <span className="text-sm text-gray-600">
                    {form.jd_file_url ? "JD uploaded — click to replace" : "Upload JD"}
                  </span>
                  <input
                    type="file"
                    className="sr-only"
                    accept={ACCEPT_JD}
                    disabled={uploadingJd}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingJd(true);
                      try {
                        const uploaded = await uploadCareersFile(file, "CareersJD", ACCEPT_JD);
                        setForm((f) => ({
                          ...f,
                          jd_file_url: uploaded.secure_url,
                          jd_file_public_id: uploaded.public_id,
                        }));
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "JD upload failed.");
                      } finally {
                        setUploadingJd(false);
                      }
                    }}
                  />
                </label>

                {form.jd_file_url && (
                  <button
                    type="button"
                    disabled={extracting}
                    onClick={handleExtract}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    {extracting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {extracting ? "Reading document…" : "Auto-fill fields with AI"}
                  </button>
                )}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-gray-600">Job summary *</span>
              <textarea
                className={`${inputClass} mt-1`}
                rows={6}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>

            {JOB_POSTING_CONTENT_SECTIONS.map((section) => (
              <label key={section.key} className="block">
                <span className="text-xs font-medium text-gray-600">{section.label}</span>
                <div className="mt-1">
                  <SectionTextEditor
                    value={form[section.key]}
                    onChange={(text) => setForm((f) => ({ ...f, [section.key]: text }))}
                  />
                </div>
              </label>
            ))}

            <div className="flex flex-wrap items-end gap-14">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Closing date *
                </span>
                <input
                  type="date"
                  className="mt-1 h-10 w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.closes_at.split("T")[0] ?? ""}
                  onChange={(e) =>
                    setForm((f) => {
                      const time = f.closes_at.split("T")[1] || "00:00";
                      return { ...f, closes_at: `${e.target.value}T${time}` };
                    })
                  }
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Closing time *
                </span>
                <div className="mt-1">
                  <IOSTimePicker
                    value={form.closes_at.split("T")[1] ?? ""}
                    onChange={(time) =>
                      setForm((f) => {
                        const date = f.closes_at.split("T")[0] || "";
                        return { ...f, closes_at: `${date}T${time}` };
                      })
                    }
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                  <Pencil className="w-3.5 h-3.5" />
                  Status *
                </span>
                <select
                  className="mt-1 h-10 w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as JobPostingStatus }))
                  }
                >
                  <option value="published">Published</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            </div>
          </div>

          {missingOrgFieldLabels.length > 0 && (
            <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <p>
                All organizational structure fields are required. Still missing:{" "}
                <span className="font-medium">{missingOrgFieldLabels.join(", ")}</span>.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !orgFieldsComplete}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? "Save changes" : "Create posting"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setInterviewPostingId(editing.id);
                  setPostingStep("interview");
                }}
                className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Go to interview set up
              </button>
            )}
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeTab === "active" ? (
        !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {postingsLoading || listTypesLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              No job postings yet. Add one to show it on the public careers page.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Closing date</th>
                  <th className="px-4 py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((posting) => (
                  <tr key={posting.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 text-gray-900">
                      <p className="font-medium">{formatPublicJobTitle(posting.title)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{posting.location}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-600 border-gray-200">
                        {JOB_POSTING_STATUS_LABELS[normalizePostingStatus(posting)]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{formatDate(posting.closes_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {canEdit && (
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openEdit(posting)}
                            className="text-xs font-medium text-red-700 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => archiveMutation.mutate({ id: posting.id, archived: true })}
                            disabled={archiveMutation.isPending}
                            className="text-xs font-medium text-gray-500 hover:underline disabled:opacity-60"
                          >
                            Archive
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {postingsLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : archived.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">
              No archived postings.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Archived on</th>
                  <th className="px-4 py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {archived.map((posting) => (
                  <tr key={posting.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 text-gray-900">
                      <p className="font-medium">{formatPublicJobTitle(posting.title)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{posting.location}</p>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {posting.archived_at ? formatDate(posting.archived_at) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => archiveMutation.mutate({ id: posting.id, archived: false })}
                          disabled={archiveMutation.isPending}
                          className="text-xs font-medium text-green-700 hover:underline disabled:opacity-60"
                        >
                          Unarchive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
