import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { DisplayStatus } from "@/types/taskManager";

const RED = "#C62828";
const DARK = "#111827";
const GRAY = "#4B5563";
const LIGHT = "#F3F4F6";
const BORDER = "#E5E7EB";
const BLUE = "#2563EB";
const AMBER = "#D97706";
const GREEN = "#16A34A";

// Bar colors keyed to the same status set used throughout the app (see
// statusStyles.ts) — solid fills rather than the pale badge backgrounds,
// since these are drawn as actual bar-chart bars here.
const STATUS_BAR_COLOR: Record<DisplayStatus, string> = {
  "Not Started": "#9CA3AF",
  "In Progress": AMBER,
  Overdue: RED,
  "Compliant / Ongoing": GREEN,
  Completed: BLUE,
  Archived: "#9CA3AF",
  Deleted: "#9CA3AF",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: DARK, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  title: { fontSize: 18, fontWeight: 700, color: DARK },
  subtitle: { fontSize: 10, color: GRAY, marginTop: 3 },
  meta: { fontSize: 8, color: GRAY, textAlign: "right" },
  pageLabel: { fontSize: 8, color: GRAY, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  pageTitle: { fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 4 },
  pageSubtitle: { fontSize: 9, color: GRAY, marginBottom: 16 },

  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
  statCard: { flexGrow: 1, flexBasis: "30%", backgroundColor: LIGHT, borderRadius: 6, padding: 10 },
  statNumber: { fontSize: 20, fontWeight: 700, color: DARK },
  statLabel: { fontSize: 8, color: GRAY, marginTop: 2 },

  // Bold, uppercase, and with real air above/below — these mark "Coming
  // Up", "Overdue Rate" etc. as a subheading at a glance rather than
  // reading as just another bold line of body text.
  sectionTitle: { fontSize: 12.5, fontWeight: 700, color: DARK, marginTop: 22, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },

  upcomingRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottom: `0.5pt solid ${BORDER}` },
  upcomingTitle: { fontSize: 9, fontWeight: 700, color: DARK },
  upcomingSub: { fontSize: 7, color: GRAY, marginTop: 1 },
  upcomingDate: { fontSize: 8, color: GRAY },

  // Section headers for a per-project block on page 2 — deliberately not a
  // bordered "card": a box that straddles a page break renders with a
  // half-drawn border in react-pdf, which is exactly the "jumbled" look to
  // avoid. Plain header + divider instead, free to flow across pages. A
  // heavier rule and larger, uppercase name make it obvious at a glance
  // where one project ends and the next begins.
  projectSection: { marginTop: 30 },
  projectSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `2pt solid ${DARK}`, paddingBottom: 6, marginBottom: 12 },
  projectName: { fontSize: 15, fontWeight: 700, color: DARK, textTransform: "uppercase", letterSpacing: 0.3 },
  projectStats: { fontSize: 8.5, color: GRAY },

  // Gantt project headers get their own shaded, left-accented block (rather
  // than a plain bold line) — same reasoning as above: on a page with
  // several projects' task lists running one after another, a plain text
  // header blends into the rows above it. The accent bar and background
  // both stop at this block's own edges rather than running the width of
  // the page, so it reads as "this project's label" and not a stripe
  // across the report.
  ganttProjectHeaderBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: LIGHT,
    borderLeft: `3pt solid ${RED}`,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 24,
    marginBottom: 10,
  },
  ganttProjectHeaderText: { fontSize: 12.5, fontWeight: 700, color: DARK, textTransform: "uppercase", letterSpacing: 0.3 },
  ganttRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4, gap: 8 },
  ganttLabel: { width: "32%" },
  ganttName: { fontSize: 8.5, fontWeight: 700, color: DARK },
  ganttOwner: { fontSize: 7, color: GRAY, marginTop: 1 },
  ganttBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: LIGHT, overflow: "hidden" },
  ganttBarFill: { height: 8, borderRadius: 4 },
  ganttPct: { width: 30, fontSize: 8, fontWeight: 700, color: DARK, textAlign: "right" },

  ownerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5, gap: 8 },
  ownerLabel: { width: "26%" },
  ownerName: { fontSize: 8.5, fontWeight: 700, color: DARK },
  ownerCount: { fontSize: 7, color: GRAY, marginTop: 1 },
  ownerBarTrack: { flex: 1, height: 9, borderRadius: 4, backgroundColor: LIGHT, overflow: "hidden" },
  ownerBarFill: { height: 9, borderRadius: 4 },
  ownerPct: { width: 32, fontSize: 8, fontWeight: 700, textAlign: "right" },

  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: GRAY, textAlign: "center" },
  emptyNote: { fontSize: 8, color: GRAY, fontStyle: "italic" },

  summaryParagraph: { fontSize: 10.5, color: DARK, lineHeight: 1.6, marginBottom: 14 },
});

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ReportHeader({ data, pageLabel, pageTitle, pageSubtitle }: { data: MonthlyReportData; pageLabel: string; pageTitle: string; pageSubtitle?: string }) {
  return (
    <>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Wills Farms Ltd — Task Manager Report</Text>
          <Text style={styles.subtitle}>{data.periodLabel}</Text>
        </View>
        <Text style={styles.meta}>
          Generated {new Date(data.generatedAt).toLocaleString("en-GB")}
          {"\n"}by {data.generatedByName}
        </Text>
      </View>
      <Text style={styles.pageLabel}>{pageLabel}</Text>
      <Text style={styles.pageTitle}>{pageTitle}</Text>
      {pageSubtitle ? <Text style={styles.pageSubtitle}>{pageSubtitle}</Text> : null}
    </>
  );
}

function Footer({ data }: { data: MonthlyReportData }) {
  return (
    <Text style={styles.footer} fixed>
      Full detail and live status: {data.dashboardUrl}
      {"\n"}Wills Farms Ltd — Task Manager
    </Text>
  );
}

// Same six stat cards used on page 1 (all projects combined) and, per
// project, on page 2 — kept as one component so the two pages stay
// visually identical apart from scope.
function StatCards({ stats }: { stats: MonthlyReportData["overall"] }) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statCard}>
        <Text style={styles.statNumber}>{stats.total}</Text>
        <Text style={styles.statLabel}>Total active tasks</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={[styles.statNumber, { color: RED }]}>{stats.overdue}</Text>
        <Text style={styles.statLabel}>Overdue</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={[styles.statNumber, { color: AMBER }]}>{stats.inProgress}</Text>
        <Text style={styles.statLabel}>In Progress</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statNumber}>{stats.notStarted}</Text>
        <Text style={styles.statLabel}>Not Started</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={[styles.statNumber, { color: GREEN }]}>{stats.compliantOngoing}</Text>
        <Text style={styles.statLabel}>Compliant / Ongoing</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={[styles.statNumber, { color: BLUE }]}>{stats.completed}</Text>
        <Text style={styles.statLabel}>Completed this period</Text>
      </View>
    </View>
  );
}

function UpcomingList({ items, showProject }: { items: (UpcomingItem | ReportTask)[]; showProject: boolean }) {
  if (items.length === 0) {
    return <Text style={styles.emptyNote}>Nothing scheduled.</Text>;
  }
  return (
    <>
      {items.map((t, i) => (
        <View key={i} style={styles.upcomingRow}>
          <View>
            <Text style={styles.upcomingTitle}>{t.title}</Text>
            <Text style={styles.upcomingSub}>
              {showProject && "project_name" in t ? `${t.project_name} · ` : ""}
              {t.owner_name ?? "Unassigned"}
            </Text>
          </View>
          <Text style={styles.upcomingDate}>{fmtDate(t.due_date)}</Text>
        </View>
      ))}
    </>
  );
}

// A single bar row is small and safe to keep on one page (wrap={false});
// the surrounding per-project block deliberately has NO wrap restriction —
// forcing a whole project's task list to stay together broke pages that
// had more tasks than would fit in the remaining space, producing
// overlapping/garbled output instead of a clean page break.
function GanttSection({ projects }: { projects: ReportProjectGantt[] }) {
  if (projects.length === 0) {
    return <Text style={styles.emptyNote}>Nothing to show for this period.</Text>;
  }
  return (
    <>
      {projects.map((project) => (
        <View key={project.name}>
          <View style={styles.ganttProjectHeaderBox} wrap={false}>
            <Text style={styles.ganttProjectHeaderText}>{project.name}</Text>
          </View>
          {project.tasks.length === 0 ? (
            <Text style={styles.emptyNote}>None.</Text>
          ) : (
            project.tasks.map((t, i) => {
              const pct = t.progress_percent ?? 0;
              const color = STATUS_BAR_COLOR[t.display_status as DisplayStatus] ?? "#9CA3AF";
              return (
                <View key={i} style={styles.ganttRow} wrap={false}>
                  <View style={styles.ganttLabel}>
                    <Text style={styles.ganttName}>{t.title}</Text>
                    <Text style={styles.ganttOwner}>{t.owner_name ?? "Unassigned"}</Text>
                  </View>
                  <View style={styles.ganttBarTrack}>
                    <View style={[styles.ganttBarFill, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={styles.ganttPct}>{pct}%</Text>
                </View>
              );
            })
          )}
        </View>
      ))}
    </>
  );
}

export interface ReportTask {
  title: string;
  owner_name: string | null;
  due_date: string | null;
  display_status: string;
  progress_percent: number;
}

export interface ReportProjectBreakdown {
  name: string;
  total: number;
  overdue: number;
  inProgress: number;
  notStarted: number;
  compliantOngoing: number;
  completed: number;
  upcoming: ReportTask[];
}

export interface ReportProjectGantt {
  name: string;
  tasks: ReportTask[];
}

export interface OwnerStat {
  name: string;
  total: number;
  overdue: number;
  completed: number;
  onTrack: number;
  overduePct: number;
  completedPct: number;
}

export interface UpcomingItem {
  title: string;
  project_name: string;
  owner_name: string | null;
  due_date: string;
}

export interface MonthlyReportData {
  periodLabel: string;
  generatedAt: string;
  generatedByName: string;
  dashboardUrl: string;
  // Two short paragraphs, separated by a blank line — the board-facing
  // opening page. See generateExecutiveSummary in sendMonthlyReport.tsx.
  executiveSummary: string;
  overall: {
    total: number;
    overdue: number;
    inProgress: number;
    notStarted: number;
    compliantOngoing: number;
    completed: number;
  };
  upcoming: UpcomingItem[];
  projectBreakdown: ReportProjectBreakdown[];
  activeGanttByProject: ReportProjectGantt[];
  completedGanttByProject: ReportProjectGantt[];
  ownerStats: OwnerStat[];
}

export default function MonthlyReportDocument({ data }: { data: MonthlyReportData }) {
  return (
    <Document>
      {/* Page 1 — board-facing executive summary, plain prose, no tables */}
      <Page size="A4" style={styles.page}>
        <ReportHeader data={data} pageLabel="Page 1" pageTitle="Executive Summary" pageSubtitle="Task outlook for the board." />

        {data.executiveSummary.split(/\n\s*\n/).map((para, i) => (
          <Text key={i} style={styles.summaryParagraph}>
            {para.trim()}
          </Text>
        ))}

        <Footer data={data} />
      </Page>

      {/* Page 2 — overall summary, not broken down by project */}
      <Page size="A4" style={styles.page}>
        <ReportHeader data={data} pageLabel="Page 2" pageTitle="Summary" pageSubtitle="All projects combined." />

        <StatCards stats={data.overall} />

        <Text style={styles.sectionTitle}>Coming Up</Text>
        <UpcomingList items={data.upcoming} showProject />

        <Footer data={data} />
      </Page>

      {/* Page 3 — same layout as page 2, per project instead of combined */}
      <Page size="A4" style={styles.page}>
        <ReportHeader data={data} pageLabel="Page 3" pageTitle="Breakdown by Project" pageSubtitle="The summary above, split out per project." />

        {data.projectBreakdown.length === 0 ? (
          <Text style={styles.emptyNote}>No projects to report on.</Text>
        ) : (
          data.projectBreakdown.map((project) => (
            <View key={project.name} style={styles.projectSection}>
              <View style={styles.projectSectionHeader} wrap={false}>
                <Text style={styles.projectName}>{project.name}</Text>
                <Text style={styles.projectStats}>
                  {project.total} active · {project.overdue} overdue · {project.completed} completed this period
                </Text>
              </View>
              <StatCards
                stats={{
                  total: project.total,
                  overdue: project.overdue,
                  inProgress: project.inProgress,
                  notStarted: project.notStarted,
                  compliantOngoing: project.compliantOngoing,
                  completed: project.completed,
                }}
              />
              <Text style={styles.sectionTitle}>Coming Up</Text>
              <UpcomingList items={project.upcoming} showProject={false} />
            </View>
          ))
        )}

        <Footer data={data} />
      </Page>

      {/* Page 4 — Gantt of uncompleted (active) tasks, per project */}
      <Page size="A4" style={styles.page}>
        <ReportHeader data={data} pageLabel="Page 4" pageTitle="Outstanding Work" pageSubtitle="Uncompleted tasks, by project — bar shows % complete." />
        <GanttSection projects={data.activeGanttByProject} />
        <Footer data={data} />
      </Page>

      {/* Page 5 — Gantt of completed tasks, per project */}
      <Page size="A4" style={styles.page}>
        <ReportHeader data={data} pageLabel="Page 5" pageTitle="Completed This Period" pageSubtitle="Tasks finished during the reporting period, by project." />
        <GanttSection projects={data.completedGanttByProject} />
        <Footer data={data} />
      </Page>

      {/* Page 6 — owner performance bar graphs */}
      <Page size="A4" style={styles.page}>
        <ReportHeader
          data={data}
          pageLabel="Page 6"
          pageTitle="Owner Performance"
          pageSubtitle="Ranked by overdue rate — highest first, to flag anyone consistently missing deadlines."
        />

        <Text style={styles.sectionTitle}>Overdue Rate</Text>
        {data.ownerStats.length === 0 ? (
          <Text style={styles.emptyNote}>No assigned tasks to report on.</Text>
        ) : (
          data.ownerStats.map((o) => (
            <View key={o.name} style={styles.ownerRow} wrap={false}>
              <View style={styles.ownerLabel}>
                <Text style={styles.ownerName}>{o.name}</Text>
                <Text style={styles.ownerCount}>
                  {o.overdue} of {o.total} tasks overdue
                </Text>
              </View>
              <View style={styles.ownerBarTrack}>
                <View style={[styles.ownerBarFill, { width: `${o.overduePct}%`, backgroundColor: RED }]} />
              </View>
              <Text style={[styles.ownerPct, { color: RED }]}>{o.overduePct}%</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Completed-This-Period Rate</Text>
        {data.ownerStats.length === 0 ? (
          <Text style={styles.emptyNote}>No assigned tasks to report on.</Text>
        ) : (
          [...data.ownerStats]
            .sort((a, b) => b.completedPct - a.completedPct)
            .map((o) => (
              <View key={o.name} style={styles.ownerRow} wrap={false}>
                <View style={styles.ownerLabel}>
                  <Text style={styles.ownerName}>{o.name}</Text>
                  <Text style={styles.ownerCount}>
                    {o.completed} of {o.total} tasks completed
                  </Text>
                </View>
                <View style={styles.ownerBarTrack}>
                  <View style={[styles.ownerBarFill, { width: `${o.completedPct}%`, backgroundColor: GREEN }]} />
                </View>
                <Text style={[styles.ownerPct, { color: GREEN }]}>{o.completedPct}%</Text>
              </View>
            ))
        )}

        <Footer data={data} />
      </Page>
    </Document>
  );
}
