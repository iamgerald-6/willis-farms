import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { RoleInterviewReport } from "@/lib/careers/types";

const RED = "#C62828";
const DARK = "#111827";
const GRAY = "#4B5563";
const LIGHT = "#F3F4F6";
const BORDER = "#E5E7EB";
const AMBER = "#D97706";
const GREEN = "#16A34A";

const STATUS_LABEL: Record<string, string> = {
  evaluation: "Still deciding",
  hold: "Hold / Reserve",
  rejected: "Rejected",
  onboarding: "Hired",
  offer: "Hired",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: DARK, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  title: { fontSize: 18, fontWeight: 700, color: DARK },
  subtitle: { fontSize: 10, color: GRAY, marginTop: 3 },
  meta: { fontSize: 8, color: GRAY, textAlign: "right" },

  sectionTitle: { fontSize: 12.5, fontWeight: 700, color: DARK, marginTop: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
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
  rankStatus: { width: 90, fontSize: 8.5, color: GRAY },
  rankScore: { width: 60, fontSize: 9.5, fontWeight: 700, color: DARK, textAlign: "right" },

  recommendationBox: { borderRadius: 6, padding: 12, marginTop: 6, backgroundColor: LIGHT, borderLeft: `3pt solid ${GREEN}` },
  recommendationLabel: { fontSize: 8, color: GRAY, textTransform: "uppercase", letterSpacing: 0.4 },
  recommendationDecision: { fontSize: 13, fontWeight: 700, marginTop: 2, color: GREEN },
  recommendationRationale: { fontSize: 9.5, color: DARK, lineHeight: 1.5, marginTop: 6 },

  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: GRAY, textAlign: "center" },
  emptyNote: { fontSize: 8.5, color: GRAY, fontStyle: "italic" },
});

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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

        <View wrap={false}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <Text style={styles.paragraph}>{report.executive_summary}</Text>
        </View>

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
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>On hold</Text>
            <Text style={styles.statValue}>{f.completed_breakdown.hold}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Rejected</Text>
            <Text style={styles.statValue}>{f.completed_breakdown.rejected}</Text>
          </View>
        </View>

        <View wrap={false}>
          <Text style={styles.sectionTitle}>Constraints Noted</Text>
          <Bullets items={report.constraints} />
        </View>

        <Text style={styles.sectionTitle}>Candidate Ranking</Text>
        {report.candidate_rankings.length === 0 ? (
          <Text style={styles.emptyNote}>No candidate completed the full interview for this role.</Text>
        ) : (
          report.candidate_rankings.map((c) => (
            <View key={c.application_id} style={styles.rankRow} wrap={false}>
              <Text style={styles.rankNum}>{c.rank}</Text>
              <Text style={styles.rankName}>{c.name}</Text>
              <Text style={styles.rankRef}>{c.reference_number}</Text>
              <Text style={styles.rankStatus}>{STATUS_LABEL[c.status] ?? c.status}</Text>
              <Text style={styles.rankScore}>{c.combined_score != null ? `${c.combined_score.toFixed(2)} / 5` : "—"}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Final Recommendation</Text>
        <View style={styles.recommendationBox} wrap={false}>
          <Text style={styles.recommendationLabel}>Recommended candidate</Text>
          <Text style={styles.recommendationDecision}>
            {report.final_recommendation.candidate_name
              ? `${report.final_recommendation.candidate_name} (${report.final_recommendation.reference_number})`
              : "No candidate currently recommendable"}
          </Text>
          <Text style={styles.recommendationRationale}>{report.final_recommendation.rationale}</Text>
        </View>

        <Text style={styles.footer} fixed>
          Wills Farms Ltd — Human Capital — Role Hiring Summary for {report.role_title}
        </Text>
      </Page>
    </Document>
  );
}
