"use client";

import { useQuery } from "@tanstack/react-query";
import {
  X,
  User,
  Calendar,
  Award,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import {
  getSkillLogStatusDef,
  SKILL_LOG_PAGE_COPY,
} from "@/lib/moduleRegistry";
import {
  resolveSkillLogSectionsForType,
  SKILL_LOG_MODULE_ID,
  type ModuleBusinessLogic,
} from "@/lib/systemDefinitions";

const BRAND = "#C62828";
const BRAND_LIGHT = "#FFEBEE";

interface SkillLogUser {
  user_id: string;
  first_name: string;
  last_name: string;
  grade_level: string;
}

interface Competency {
  skill: string;
  observed: string | null;
  performed_under_supervision: string | null;
  performed_consistently: string | null;
  rating: number | null;
  comments: string | null;
}

interface SkillLogDetail {
  id: string;
  log_type: string;
  review_period: string;
  section: string | null;
  tier_auth: string | null;
  strengths_observed: string | null;
  development_gaps: string | null;
  status: string;
  overall_rating: number | null;
  signed_off_at: string | null;
  employee?: SkillLogUser;
  supervisor?: SkillLogUser;
  skill_log_competencies?: Competency[];
}

function fullName(u?: SkillLogUser | null): string {
  if (!u) return "Unknown";
  return `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Unknown";
}

function yesNoLabel(v: string | null | undefined): string {
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  return "Not answered";
}

function RatingDisplay({ value }: { value: number | null }) {
  if (value == null) return <span className="text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5 font-bold text-gray-800">
      {value}/5
    </span>
  );
}

export default function SkillLogDetailModal({
  logId,
  onClose,
}: {
  logId: string;
  onClose: () => void;
}) {
  const getAuthHeaders = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const { data: log, isLoading, error } = useQuery<SkillLogDetail>({
    queryKey: ["skill_log_detail", logId],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await api.get(`/skillLog/${logId}`, { headers });
      return res.data.data as SkillLogDetail;
    },
  });

  const { data: moduleConfig } = useQuery<{ businessLogic: ModuleBusinessLogic }>({
    queryKey: ["skill_log_module_config"],
    queryFn: async () => {
      const res = await api.get(
        `/system-definitions/modules/${encodeURIComponent(SKILL_LOG_MODULE_ID)}`,
      );
      return {
        businessLogic: (res.data.data?.businessLogic ??
          {}) as ModuleBusinessLogic,
      };
    },
  });

  const competencyOverrides =
    moduleConfig?.businessLogic?.competencyContentOverrides;

  const statusDef = log
    ? (getSkillLogStatusDef(log.status) ?? getSkillLogStatusDef("draft")!)
    : null;

  const sections = log?.log_type
    ? resolveSkillLogSectionsForType(log.log_type, competencyOverrides)
    : [];

  const competencyMap = new Map(
    (log?.skill_log_competencies ?? []).map((c) => [c.skill, c]),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">
              {SKILL_LOG_PAGE_COPY.viewDetailTitle}
            </h2>
            {log && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {log.log_type} · {log.review_period}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading…
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 text-center py-12">
              Could not load this skills log.
            </p>
          )}

          {log && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Employee
                  </p>
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    {fullName(log.employee)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {log.employee?.grade_level}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Filled By
                  </p>
                  <p className="text-sm font-bold text-gray-900">
                    {fullName(log.supervisor)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {log.supervisor?.grade_level}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Review Period
                  </p>
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {log.review_period}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Status
                  </p>
                  {statusDef && (
                    <span
                      className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${statusDef.badgeClass}`}
                    >
                      {statusDef.label}
                    </span>
                  )}
                  {log.overall_rating != null && (
                    <p className="text-xs text-gray-600 mt-1.5 flex items-center gap-1">
                      <Award className="w-3 h-3" />
                      Overall: {log.overall_rating}/5
                    </p>
                  )}
                </div>
              </div>

              {(log.section || log.tier_auth) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {log.section && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Section
                      </p>
                      <p className="text-sm text-gray-800">{log.section}</p>
                    </div>
                  )}
                  {log.tier_auth && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Tier Authorisation
                      </p>
                      <p className="text-sm text-gray-800">{log.tier_auth}</p>
                    </div>
                  )}
                </div>
              )}

              {sections.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" style={{ color: BRAND }} />
                    <h3 className="text-sm font-bold text-gray-800">
                      Competency Assessment
                    </h3>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
                    <div className="min-w-[900px]">
                      <div
                        className="grid px-4 py-2.5 text-[10px] font-bold text-white uppercase tracking-wider"
                        style={{
                          background: BRAND,
                          gridTemplateColumns:
                            "1fr 72px 88px 100px 64px 1fr",
                        }}
                      >
                        <span>Skill / Competency</span>
                        <span className="text-center">Observed</span>
                        <span className="text-center">Under Sup.</span>
                        <span className="text-center">Consistent</span>
                        <span className="text-center">Rating</span>
                        <span className="text-center">Comments</span>
                      </div>

                      {sections.map((sec, si) => (
                        <div key={si}>
                          <div
                            className="px-4 py-2 text-xs font-bold uppercase tracking-wider"
                            style={{ background: BRAND_LIGHT, color: BRAND }}
                          >
                            {sec.title}
                          </div>
                          {sec.skills.map((skill) => {
                            const c = competencyMap.get(skill);
                            return (
                              <div
                                key={skill}
                                className="grid items-center px-4 py-2.5 border-b border-gray-100 last:border-0 gap-2 text-sm"
                                style={{
                                  gridTemplateColumns:
                                    "1fr 72px 88px 100px 64px 1fr",
                                }}
                              >
                                <p className="text-gray-700 leading-snug text-xs sm:text-sm">
                                  {skill}
                                </p>
                                <p className="text-center text-xs text-gray-600">
                                  {yesNoLabel(c?.observed)}
                                </p>
                                <p className="text-center text-xs text-gray-600">
                                  {yesNoLabel(c?.performed_under_supervision)}
                                </p>
                                <p className="text-center text-xs text-gray-600">
                                  {yesNoLabel(c?.performed_consistently)}
                                </p>
                                <p className="text-center text-xs">
                                  <RatingDisplay value={c?.rating ?? null} />
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                  {c?.comments?.trim() || "—"}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(log.strengths_observed || log.development_gaps) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Strengths Observed
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {log.strengths_observed?.trim() || "—"}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Development Gaps
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {log.development_gaps?.trim() || "—"}
                    </p>
                  </div>
                </div>
              )}

              {log.signed_off_at && (
                <p className="text-xs text-gray-400 text-center">
                  Signed off on{" "}
                  {new Date(log.signed_off_at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
