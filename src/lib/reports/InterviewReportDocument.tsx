import { Document, Page, Text, View, StyleSheet, Link } from "@react-pdf/renderer";
import type { InterviewLocationType, InterviewReport } from "@/lib/careers/types";

const RED = "#C62828";
const DARK = "#111827";
const GRAY = "#4B5563";
const LIGHT = "#F3F4F6";
const BORDER = "#E5E7EB";
const AMBER = "#D97706";
const GREEN = "#16A34A";

const DECISION_COLOR: Record<InterviewReport["final_recommendation"]["decision"], string> = {
  hire: GREEN,
  hold: AMBER,
  do_not_hire: RED,
};

const DECISION_LABEL: Record<InterviewReport["final_recommendation"]["decision"], string> = {
  hire: "Hire",
  hold: "Hold / Reserve",
  do_not_hire: "Do not hire",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: DARK, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  title: { fontSize: 18, fontWeight: 700, color: DARK },
  subtitle: { fontSize: 10, color: GRAY, marginTop: 3 },
  meta: { fontSize: 8, color: GRAY, textAlign: "right" },

  sectionTitle: { fontSize: 12.5, fontWeight: 700, color: DARK, marginTop: 20, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  paragraph: { fontSize: 10, color: DARK, lineHeight: 1.6 },

  detailsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailCard: { flexGrow: 1, flexBasis: "45%", backgroundColor: LIGHT, borderRadius: 6, padding: 10 },
  detailLabel: { fontSize: 7.5, color: GRAY, textTransform: "uppercase", letterSpacing: 0.4 },
  detailValue: { fontSize: 10.5, fontWeight: 700, color: DARK, marginTop: 2 },

  stageTableHeaderRow: { flexDirection: "row", borderBottom: `1pt solid ${DARK}`, paddingBottom: 4, marginTop: 12, marginBottom: 2 },
  stageTableRow: { flexDirection: "row", borderBottom: `0.5pt solid ${BORDER}`, paddingVertical: 6 },
  stageTableHeaderCell: { fontSize: 7, fontWeight: 700, color: GRAY, textTransform: "uppercase" },
  stageTableCell: { fontSize: 9.5, color: DARK },
  colStageNum: { flexBasis: "15%", paddingRight: 4 },
  colStageLocation: { flexBasis: "40%", paddingRight: 4 },
  colStageDateTime: { flexBasis: "45%" },

  competencyRow: { borderBottom: `0.5pt solid ${BORDER}`, paddingVertical: 8 },
  competencyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  competencyArea: { fontSize: 10, fontWeight: 700, color: DARK },
  competencyScore: { fontSize: 10, fontWeight: 700, color: RED },
  competencyText: { fontSize: 9, color: GRAY, lineHeight: 1.5 },

  bulletRow: { flexDirection: "row", marginBottom: 4 },
  bulletMark: { width: 10, fontSize: 9, color: DARK },
  bulletText: { flex: 1, fontSize: 9.5, color: DARK, lineHeight: 1.5 },

  recommendationBox: { borderRadius: 6, padding: 12, marginTop: 6 },
  recommendationLabel: { fontSize: 8, color: GRAY, textTransform: "uppercase", letterSpacing: 0.4 },
  recommendationDecision: { fontSize: 13, fontWeight: 700, marginTop: 2 },
  recommendationRationale: { fontSize: 9.5, color: DARK, lineHeight: 1.5, marginTop: 6 },

  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: GRAY, textAlign: "center" },
  emptyNote: { fontSize: 8.5, color: GRAY, fontStyle: "italic" },

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
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function stageLocationText(
  location: string | null,
  locationType: InterviewLocationType | null | undefined,
): string {
  if (location) return location;
  return locationType === "online" ? "Online" : "—";
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

export default function InterviewReportDocument({ report }: { report: InterviewReport }) {
  const d = report.applicant_details;
  const decisionColor = DECISION_COLOR[report.final_recommendation.decision];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Wills Farms Ltd — Interview Report</Text>
            <Text style={styles.subtitle}>{d.name} — {d.role}</Text>
          </View>
          <Text style={styles.meta}>
            Ref {d.reference_number}
            {"\n"}Generated {fmtDate(report.generated_at)}
          </Text>
        </View>

        <View wrap={false}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <Text style={styles.paragraph}>{report.executive_summary}</Text>
        </View>

        <Text style={styles.sectionTitle}>Applicant &amp; Interview Details</Text>
        <View style={styles.detailsGrid}>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Candidate</Text>
            <Text style={styles.detailValue}>{d.name}</Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Role applied for</Text>
            <Text style={styles.detailValue}>{d.role}</Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Interview panel</Text>
            <Text style={styles.detailValue}>{d.panel_names.length ? d.panel_names.join(", ") : "—"}</Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Overall rating</Text>
            <Text style={styles.detailValue}>{d.overall_rating != null ? `${d.overall_rating.toFixed(2)} / 5` : "—"}</Text>
          </View>
        </View>

        <View wrap={false}>
          <View style={styles.stageTableHeaderRow}>
            <Text style={[styles.stageTableHeaderCell, styles.colStageNum]}>Stage</Text>
            <Text style={[styles.stageTableHeaderCell, styles.colStageLocation]}>Location</Text>
            <Text style={[styles.stageTableHeaderCell, styles.colStageDateTime]}>Date &amp; Time</Text>
          </View>
          <View style={styles.stageTableRow}>
            <Text style={[styles.stageTableCell, styles.colStageNum]}>1</Text>
            <Text style={[styles.stageTableCell, styles.colStageLocation]}>
              {stageLocationText(d.stage1_location, d.stage1_location_type)}
            </Text>
            <Text style={[styles.stageTableCell, styles.colStageDateTime]}>{fmtDateTime(d.stage1_interview_date)}</Text>
          </View>
          <View style={styles.stageTableRow}>
            <Text style={[styles.stageTableCell, styles.colStageNum]}>2</Text>
            <Text style={[styles.stageTableCell, styles.colStageLocation]}>
              {stageLocationText(d.stage2_location, d.stage2_location_type)}
            </Text>
            <Text style={[styles.stageTableCell, styles.colStageDateTime]}>{fmtDateTime(d.stage2_interview_date)}</Text>
          </View>
        </View>

        {report.decision_history_summary && (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>Decision History</Text>
            <Text style={styles.paragraph}>{report.decision_history_summary}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Core Competencies</Text>
        {report.core_competencies.length === 0 ? (
          <Text style={styles.emptyNote}>No competency data available.</Text>
        ) : (
          report.core_competencies.map((c, i) => (
            <View key={i} style={styles.competencyRow} wrap={false}>
              <View style={styles.competencyHeader}>
                <Text style={styles.competencyArea}>{c.area}</Text>
                <Text style={styles.competencyScore}>{c.score != null ? `${c.score.toFixed(2)} / 5` : "—"}</Text>
              </View>
              <Text style={styles.competencyText}>{c.assessment}</Text>
            </View>
          ))
        )}

        <View wrap={false}>
          <Text style={styles.sectionTitle}>Key Observations</Text>
          <Text style={[styles.paragraph, { marginBottom: 10 }]}>{report.key_observations.summary}</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 20 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, fontWeight: 700, color: GREEN, marginBottom: 6, textTransform: "uppercase" }}>
              Strengths
            </Text>
            <Bullets items={report.key_observations.strengths} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, fontWeight: 700, color: AMBER, marginBottom: 6, textTransform: "uppercase" }}>
              Weaknesses
            </Text>
            <Bullets items={report.key_observations.weaknesses} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Final Recommendation</Text>
        <View style={[styles.recommendationBox, { backgroundColor: LIGHT, borderLeft: `3pt solid ${decisionColor}` }]} wrap={false}>
          <Text style={styles.recommendationLabel}>Recommended decision</Text>
          <Text style={[styles.recommendationDecision, { color: decisionColor }]}>
            {DECISION_LABEL[report.final_recommendation.decision]}
          </Text>
          <Text style={styles.recommendationRationale}>{report.final_recommendation.rationale}</Text>
        </View>

        <Text style={styles.footer} fixed>
          Wills Farms Ltd — Human Capital — Interview Report for {d.name}
        </Text>
      </Page>

      {report.panel_forms_url && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Appendix — Panel Forms &amp; Responses</Text>
          <Text style={[styles.paragraph, { marginBottom: 10 }]}>
            Every panel member&apos;s and HR&apos;s full ratings and notes across both
            interview stages are recorded on the platform.
          </Text>
          <View style={styles.linkRow} wrap={false}>
            <Text style={styles.linkName}>{d.name}</Text>
            <Text style={styles.linkRef}>{d.reference_number}</Text>
            <Link src={report.panel_forms_url}>
              <Text style={styles.linkText}>Panel forms / responses</Text>
            </Link>
          </View>
          <Text style={styles.footer} fixed>
            Wills Farms Ltd — Human Capital — Interview Report for {d.name}
          </Text>
        </Page>
      )}
    </Document>
  );
}
