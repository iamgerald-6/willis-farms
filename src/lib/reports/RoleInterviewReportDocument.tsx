import { Document, Page, Text, View, StyleSheet, Link } from "@react-pdf/renderer";
import type { RoleInterviewReport } from "@/lib/careers/types";

const RED = "#C62828";
const DARK = "#111827";
const GRAY = "#4B5563";
const LIGHT = "#F3F4F6";
const BORDER = "#E5E7EB";
const AMBER = "#D97706";
const GREEN = "#16A34A";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: DARK, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  title: { fontSize: 18, fontWeight: 700, color: DARK },
  subtitle: { fontSize: 10, color: GRAY, marginTop: 3 },
  meta: { fontSize: 8, color: GRAY, textAlign: "right" },

  section: { marginTop: 22, paddingTop: 14, borderTop: `1pt solid ${BORDER}` },
  sectionTitle: { fontSize: 12.5, fontWeight: 700, color: DARK, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  paragraph: { fontSize: 10, color: DARK, lineHeight: 1.6 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { flexGrow: 1, flexBasis: "22%", backgroundColor: LIGHT, borderRadius: 6, padding: 10 },
  statLabel: { fontSize: 7.5, color: GRAY, textTransform: "uppercase", letterSpacing: 0.4 },
  statValue: { fontSize: 16, fontWeight: 700, color: DARK, marginTop: 2 },

  bulletRow: { flexDirection: "row", marginBottom: 4 },
  bulletMark: { width: 10, fontSize: 9, color: DARK },
  bulletText: { flex: 1, fontSize: 9.5, color: DARK, lineHeight: 1.5 },

  rankRow: { flexDirection: "row", alignItems: "center", borderBottom: `0.5pt solid ${BORDER}`, paddingVertical: 6 },
  rankNum: { width: 24, fontSize: 10, fontWeight: 700, color: RED },
  rankName: { flex: 1, fontSize: 9.5, color: DARK },
  rankRef: { width: 90, fontSize: 8, color: GRAY, fontFamily: "Courier" },
  rankScore: { width: 60, fontSize: 9.5, fontWeight: 700, color: DARK, textAlign: "right" },

  recommendationBox: { borderRadius: 6, padding: 12, marginTop: 6, backgroundColor: LIGHT, borderLeft: `3pt solid ${GREEN}` },
  recommendationLabel: { fontSize: 8, color: GRAY, textTransform: "uppercase", letterSpacing: 0.4 },
  recommendationDecision: { fontSize: 13, fontWeight: 700, marginTop: 2, color: GREEN },
  recommendationRationale: { fontSize: 9.5, color: DARK, lineHeight: 1.5, marginTop: 6 },

  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: GRAY, textAlign: "center" },
  emptyNote: { fontSize: 8.5, color: GRAY, fontStyle: "italic" },

  rosterHeaderRow: { flexDirection: "row", borderBottom: `1pt solid ${DARK}`, paddingBottom: 4, marginBottom: 2 },
  rosterRow: { flexDirection: "row", borderBottom: `0.5pt solid ${BORDER}`, paddingVertical: 5 },
  rosterHeaderCell: { fontSize: 7, fontWeight: 700, color: GRAY, textTransform: "uppercase" },
  rosterCell: { fontSize: 7.5, color: DARK, lineHeight: 1.3 },

  rosterSubTable: { marginBottom: 14 },
  rosterSubTitle: { fontSize: 9, fontWeight: 700, color: DARK, marginBottom: 4 },

  colSimpleName: { flexBasis: "70%", paddingRight: 4 },
  colSimpleDate: { flexBasis: "30%" },

  colIntName: { flexBasis: "22%", paddingRight: 4 },
  colIntPanel: { flexBasis: "26%", paddingRight: 4 },
  colIntLocation: { flexBasis: "20%", paddingRight: 4 },
  colIntDateTime: { flexBasis: "20%", paddingRight: 4 },
  colIntRank: { flexBasis: "12%" },

  candidateBlock: { marginBottom: 10 },
  candidateBlockHeader: { fontSize: 9.5, fontWeight: 700, color: DARK, marginBottom: 4 },

  competencyRow: { flexDirection: "row", borderBottom: `0.5pt solid ${BORDER}`, paddingVertical: 4 },
  competencyArea: { flexBasis: "28%", fontSize: 8.5, fontWeight: 700, color: DARK, paddingRight: 4 },
  competencyScore: { flexBasis: "10%", fontSize: 8.5, fontWeight: 700, color: RED },
  competencyText: { flexBasis: "62%", fontSize: 8, color: GRAY, lineHeight: 1.4 },

  linkRow: { borderBottom: `0.5pt solid ${BORDER}`, paddingVertical: 6 },
  linkName: { fontSize: 9.5, fontWeight: 700, color: DARK },
  linkRef: { fontSize: 7.5, color: GRAY, fontFamily: "Courier", marginBottom: 3 },
  linkText: { fontSize: 8.5, color: RED, textDecoration: "underline" },
});

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString(
    "en-GB",
    { hour: "numeric", minute: "2-digit", hour12: true },
  )}`;
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return <Text style={styles.emptyNote}>None noted.</Text>;
  return (
    <>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletMark}>—</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </>
  );
}

export default function RoleInterviewReportDocument({ report }: { report: RoleInterviewReport }) {
  const f = report.funnel;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Wills Farms Ltd — Role Hiring Summary</Text>
            <Text style={styles.subtitle}>{report.role_title}</Text>
          </View>
          <Text style={styles.meta}>Generated {fmtDate(report.generated_at)}</Text>
        </View>

        {/* 1. Executive summary */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <Text style={styles.paragraph}>{report.executive_summary}</Text>
        </View>

        {/* 2. Applicant funnel */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Applicant Funnel</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total applicants</Text>
              <Text style={styles.statValue}>{f.total_applicants}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Never shortlisted</Text>
              <Text style={styles.statValue}>{f.never_shortlisted}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Shortlisted (total)</Text>
              <Text style={styles.statValue}>{f.shortlisted_total}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Never started interview</Text>
              <Text style={styles.statValue}>{f.never_started_interview}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Reached Stage 1 only</Text>
              <Text style={styles.statValue}>{f.reached_stage1_only}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Completed full interview</Text>
              <Text style={styles.statValue}>{f.completed_full_interview}</Text>
            </View>
          </View>
        </View>

        {/* 3. Candidate ranking (Evaluation status only) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Candidate Ranking</Text>
          <Text style={[styles.emptyNote, { marginBottom: 6 }]}>
            Below are the rankings of the candidates.
          </Text>
          {report.candidate_rankings.length === 0 ? (
            <Text style={styles.emptyNote}>No candidate is currently awaiting a decision for this role.</Text>
          ) : (
            report.candidate_rankings.map((c) => (
              <View key={c.application_id} style={styles.rankRow} wrap={false}>
                <Text style={styles.rankNum}>{c.rank}</Text>
                <Text style={styles.rankName}>{c.name}</Text>
                <Text style={styles.rankRef}>{c.reference_number}</Text>
                <Text style={styles.rankScore}>{c.combined_score != null ? `${c.combined_score.toFixed(2)} / 5` : "—"}</Text>
              </View>
            ))
          )}
        </View>

        {/* 4. Full applicant roster — every applicant, any status, grouped by
        furthest funnel stage reached. Stages with no applicants are omitted
        entirely rather than shown empty. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All Applicants</Text>

          {(
            [
              { stage: "application" as const, title: "Application", dateLabel: "Date applied" },
              { stage: "screening" as const, title: "Screening", dateLabel: "Date shortlisted" },
            ]
          ).map(({ stage, title, dateLabel }) => {
            const rows = report.applicant_roster.filter((a) => a.stage === stage);
            if (rows.length === 0) return null;
            return (
              <View key={stage} style={styles.rosterSubTable}>
                <Text style={styles.rosterSubTitle}>{title}</Text>
                <View style={styles.rosterHeaderRow}>
                  <Text style={[styles.rosterHeaderCell, styles.colSimpleName]}>Name</Text>
                  <Text style={[styles.rosterHeaderCell, styles.colSimpleDate]}>{dateLabel}</Text>
                </View>
                {rows.map((a) => (
                  <View key={a.application_id} style={styles.rosterRow} wrap={false}>
                    <Text style={[styles.rosterCell, styles.colSimpleName]}>{a.name}</Text>
                    <Text style={[styles.rosterCell, styles.colSimpleDate]}>{fmtDate(a.date)}</Text>
                  </View>
                ))}
              </View>
            );
          })}

          {(
            [
              { stage: "interview_stage1" as const, title: "Interview — Stage 1" },
              { stage: "interview_stage2" as const, title: "Interview — Stage 2" },
            ]
          ).map(({ stage, title }) => {
            const rows = report.applicant_roster.filter((a) => a.stage === stage);
            if (rows.length === 0) return null;
            return (
              <View key={stage} style={styles.rosterSubTable}>
                <Text style={styles.rosterSubTitle}>{title}</Text>
                <View style={styles.rosterHeaderRow}>
                  <Text style={[styles.rosterHeaderCell, styles.colIntName]}>Name</Text>
                  <Text style={[styles.rosterHeaderCell, styles.colIntPanel]}>Panel</Text>
                  <Text style={[styles.rosterHeaderCell, styles.colIntLocation]}>Location</Text>
                  <Text style={[styles.rosterHeaderCell, styles.colIntDateTime]}>Date &amp; Time</Text>
                  <Text style={[styles.rosterHeaderCell, styles.colIntRank]}>Ranking</Text>
                </View>
                {rows.map((a) => (
                  <View key={a.application_id} style={styles.rosterRow} wrap={false}>
                    <Text style={[styles.rosterCell, styles.colIntName]}>{a.name}</Text>
                    <Text style={[styles.rosterCell, styles.colIntPanel]}>
                      {a.panel_names.length ? a.panel_names.join(", ") : "—"}
                      {a.unavailable_panel_names?.length
                        ? ` (${a.unavailable_panel_names.join(", ")} — couldn't make it)`
                        : ""}
                    </Text>
                    <Text style={[styles.rosterCell, styles.colIntLocation]}>{a.location ?? "—"}</Text>
                    <Text style={[styles.rosterCell, styles.colIntDateTime]}>{fmtDateTime(a.date)}</Text>
                    <Text style={[styles.rosterCell, styles.colIntRank]}>{a.rank != null ? `#${a.rank}` : "—"}</Text>
                  </View>
                ))}
              </View>
            );
          })}

          {(() => {
            const rows = report.applicant_roster.filter((a) => a.stage === "evaluation");
            if (rows.length === 0) return null;
            return (
              <View style={styles.rosterSubTable}>
                <Text style={styles.rosterSubTitle}>Evaluation</Text>
                <View style={styles.rosterHeaderRow}>
                  <Text style={[styles.rosterHeaderCell, styles.colSimpleName]}>Name</Text>
                  <Text style={[styles.rosterHeaderCell, styles.colSimpleDate]}>Date reached evaluation</Text>
                </View>
                {rows.map((a) => (
                  <View key={a.application_id} style={styles.rosterRow} wrap={false}>
                    <Text style={[styles.rosterCell, styles.colSimpleName]}>{a.name}</Text>
                    <Text style={[styles.rosterCell, styles.colSimpleDate]}>{fmtDate(a.date)}</Text>
                  </View>
                ))}
              </View>
            );
          })()}
        </View>

        {/* 5. Core competencies (Evaluation status only) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Core Competencies</Text>
          <Text style={[styles.paragraph, { marginBottom: 10 }]}>{report.core_competencies_summary}</Text>
          {report.core_competencies_table.length === 0 ? (
            <Text style={styles.emptyNote}>No candidate is currently awaiting a decision for this role.</Text>
          ) : (
            report.core_competencies_table.map((c) => (
              <View key={c.application_id} style={styles.candidateBlock} wrap={false}>
                <Text style={styles.candidateBlockHeader}>{c.name}</Text>
                {c.competencies.length === 0 ? (
                  <Text style={styles.emptyNote}>No competency data available.</Text>
                ) : (
                  c.competencies.map((comp, i) => (
                    <View key={i} style={styles.competencyRow}>
                      <Text style={styles.competencyArea}>{comp.area}</Text>
                      <Text style={styles.competencyScore}>{comp.score != null ? `${comp.score.toFixed(2)} / 5` : "—"}</Text>
                      <Text style={styles.competencyText}>{comp.assessment || "—"}</Text>
                    </View>
                  ))
                )}
              </View>
            ))
          )}
        </View>

        {/* 6. Key observations (Evaluation status only) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Observations</Text>
          <Text style={[styles.paragraph, { marginBottom: 10 }]}>{report.key_observations_summary}</Text>
          {report.key_observations_table.length === 0 ? (
            <Text style={styles.emptyNote}>No candidate is currently awaiting a decision for this role.</Text>
          ) : (
            report.key_observations_table.map((c) => (
              <View key={c.application_id} style={styles.candidateBlock} wrap={false}>
                <Text style={styles.candidateBlockHeader}>{c.name}</Text>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 7.5, fontWeight: 700, color: GREEN, marginBottom: 3, textTransform: "uppercase" }}>
                      Strengths
                    </Text>
                    <Bullets items={c.strengths} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 7.5, fontWeight: 700, color: AMBER, marginBottom: 3, textTransform: "uppercase" }}>
                      Weaknesses
                    </Text>
                    <Bullets items={c.weaknesses} />
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* 6.5 Decision history — every applicant with a noted status change, any status */}
        {report.decision_history_table && report.decision_history_table.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Decision History</Text>
            <Text style={[styles.paragraph, { marginBottom: 10 }]}>
              Candidates in this round whose status changed alongside an HR note — covering the
              whole pipeline, not just those still awaiting a decision.
            </Text>
            {report.decision_history_table.map((c) => (
              <View key={c.application_id} style={styles.candidateBlock} wrap={false}>
                <Text style={styles.candidateBlockHeader}>{c.name}</Text>
                <Text style={styles.paragraph}>{c.summary}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 7. Constraints */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Constraints Noted</Text>
          <Bullets items={report.constraints} />
        </View>

        {/* 8. Final recommendation */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Final Recommendation</Text>
          <View style={styles.recommendationBox}>
            <Text style={styles.recommendationLabel}>Recommended candidate</Text>
            <Text style={styles.recommendationDecision}>
              {report.final_recommendation.candidate_name
                ? `${report.final_recommendation.candidate_name} (${report.final_recommendation.reference_number})`
                : "No candidate currently recommendable"}
            </Text>
            <Text style={styles.recommendationRationale}>{report.final_recommendation.rationale}</Text>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Wills Farms Ltd — Human Capital — Role Hiring Summary for {report.role_title}
        </Text>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Appendix — Panel Forms &amp; Individual Reports</Text>
        <Text style={[styles.paragraph, { marginBottom: 10 }]}>
          For every applicant who had at least one interview stage, regardless of current status.
        </Text>
        {report.candidate_links.length === 0 ? (
          <Text style={styles.emptyNote}>No applicant has started the interview process yet.</Text>
        ) : (
          report.candidate_links.map((c) => (
            <View key={c.application_id} style={styles.linkRow} wrap={false}>
              <Text style={styles.linkName}>{c.name}</Text>
              <Text style={styles.linkRef}>{c.reference_number}</Text>
              <Link src={c.panel_forms_url}>
                <Text style={styles.linkText}>Panel forms / responses</Text>
              </Link>
              {c.individual_report_url ? (
                <Link src={c.individual_report_url}>
                  <Text style={styles.linkText}>Individual comprehensive report (PDF)</Text>
                </Link>
              ) : (
                <Text style={styles.emptyNote}>No individual comprehensive report was generated.</Text>
              )}
            </View>
          ))
        )}
        <Text style={styles.footer} fixed>
          Wills Farms Ltd — Human Capital — Role Hiring Summary for {report.role_title}
        </Text>
      </Page>
    </Document>
  );
}
