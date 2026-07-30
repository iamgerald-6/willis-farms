import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const RED = "#C62828";
const DARK = "#111827";
const GRAY = "#4B5563";
const LIGHT = "#F3F4F6";
const BORDER = "#E5E7EB";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: DARK, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  title: { fontSize: 18, fontWeight: 700, color: DARK },
  subtitle: { fontSize: 10, color: GRAY, marginTop: 3 },
  meta: { fontSize: 8, color: GRAY, textAlign: "right" },
  statRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: LIGHT, borderRadius: 6, padding: 10 },
  statNumber: { fontSize: 20, fontWeight: 700, color: DARK },
  statLabel: { fontSize: 8, color: GRAY, marginTop: 2 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: DARK, marginTop: 18, marginBottom: 8 },
  projectCard: { border: `1pt solid ${BORDER}`, borderRadius: 6, marginBottom: 14, padding: 10 },
  projectHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  projectName: { fontSize: 11, fontWeight: 700, color: DARK },
  projectStats: { fontSize: 8, color: GRAY },
  tableHeaderRow: { flexDirection: "row", borderBottom: `1pt solid ${BORDER}`, paddingBottom: 4, marginBottom: 4 },
  tableRow: { flexDirection: "row", paddingVertical: 3, borderBottom: `0.5pt solid ${BORDER}` },
  colTask: { flex: 3 },
  colOwner: { flex: 2 },
  colDue: { flex: 1.5 },
  colStatus: { flex: 1.5 },
  th: { fontSize: 7, fontWeight: 700, color: GRAY, textTransform: "uppercase" },
  td: { fontSize: 8, color: DARK },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: GRAY, textAlign: "center" },
});

export interface ReportTask {
  title: string;
  owner_name: string | null;
  due_date: string | null;
  display_status: string;
}

export interface ReportProject {
  name: string;
  total: number;
  overdue: number;
  completed: number;
  tasks: ReportTask[];
}

export interface MonthlyReportData {
  periodLabel: string;
  generatedAt: string;
  generatedByName: string;
  dashboardUrl: string;
  overall: { total: number; overdue: number; inProgress: number; completed: number };
  projects: ReportProject[];
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function MonthlyReportDocument({ data }: { data: MonthlyReportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Wills Farms Ltd — Task Manager Report</Text>
            <Text style={styles.subtitle}>{data.periodLabel}</Text>
          </View>
          <Text style={styles.meta}>
            Generated {new Date(data.generatedAt).toLocaleString("en-GB")}{"\n"}by {data.generatedByName}
          </Text>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{data.overall.total}</Text>
            <Text style={styles.statLabel}>Total active tasks</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: RED }]}>{data.overall.overdue}</Text>
            <Text style={styles.statLabel}>Overdue</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{data.overall.inProgress}</Text>
            <Text style={styles.statLabel}>In Progress</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{data.overall.completed}</Text>
            <Text style={styles.statLabel}>Completed this period</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>By Project</Text>
        {data.projects.map((project) => (
          <View key={project.name} style={styles.projectCard} wrap={false}>
            <View style={styles.projectHeaderRow}>
              <Text style={styles.projectName}>{project.name}</Text>
              <Text style={styles.projectStats}>
                {project.total} tasks · {project.overdue} overdue · {project.completed} completed
              </Text>
            </View>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, styles.colTask]}>Task</Text>
              <Text style={[styles.th, styles.colOwner]}>Owner</Text>
              <Text style={[styles.th, styles.colDue]}>Due</Text>
              <Text style={[styles.th, styles.colStatus]}>Status</Text>
            </View>
            {project.tasks.slice(0, 12).map((t, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.td, styles.colTask]}>{t.title}</Text>
                <Text style={[styles.td, styles.colOwner]}>{t.owner_name ?? "Unassigned"}</Text>
                <Text style={[styles.td, styles.colDue]}>{fmtDate(t.due_date)}</Text>
                <Text style={[styles.td, styles.colStatus]}>{t.display_status}</Text>
              </View>
            ))}
            {project.tasks.length > 12 && (
              <Text style={{ fontSize: 7, color: GRAY, marginTop: 4 }}>+ {project.tasks.length - 12} more — see the dashboard for the full list.</Text>
            )}
          </View>
        ))}

        <Text style={styles.footer}>
          Full detail and live status: {data.dashboardUrl}
          {"\n"}Wills Farms Ltd — Task Manager
        </Text>
      </Page>
    </Document>
  );
}
