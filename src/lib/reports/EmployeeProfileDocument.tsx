import { Document, Link, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { EmployeeProfileExportData } from "@/lib/careers/loadEmployeeProfileExportData";
import { formatDisplayDateTime } from "@/lib/formatDisplayDate";

const RED = "#C62828";
const DARK = "#111827";
const GRAY = "#6B7280";
const BORDER = "#E5E7EB";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, color: DARK, fontFamily: "Helvetica" },
  brand: { fontSize: 8, fontWeight: 700, color: RED, textTransform: "uppercase", letterSpacing: 0.6 },
  title: { fontSize: 16, fontWeight: 700, color: DARK, marginTop: 4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  metaItem: { fontSize: 8.5, color: GRAY },
  subtitle: { fontSize: 8, color: GRAY, marginTop: 6 },
  sectionWrap: { marginTop: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: DARK,
    paddingBottom: 4,
    marginBottom: 8,
    borderBottom: `0.75pt solid ${BORDER}`,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fieldHalf: { width: "47%" },
  fieldFull: { width: "100%" },
  fieldLabel: { fontSize: 7.5, color: GRAY, marginBottom: 2 },
  fieldValue: { fontSize: 9.5, color: DARK, lineHeight: 1.45 },
  link: { fontSize: 9.5, color: RED, textDecoration: "none" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: GRAY,
    textAlign: "center",
  },
});

export default function EmployeeProfileDocument({
  data,
}: {
  data: EmployeeProfileExportData;
}) {
  const { header, groups } = data;
  const submittedLabel = formatDisplayDateTime(header.submittedAt);
  const sections = groups.flatMap((group) => group.sections);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>Wills Farms Ltd. — Employee profile</Text>
        <Text style={styles.title}>{header.fullName}</Text>
        <View style={styles.metaRow}>
          {header.roleTitle ? (
            <Text style={styles.metaItem}>Position: {header.roleTitle}</Text>
          ) : null}
          {header.referenceNumber ? (
            <Text style={styles.metaItem}>Ref: {header.referenceNumber}</Text>
          ) : null}
          {header.email ? <Text style={styles.metaItem}>{header.email}</Text> : null}
          {header.phone ? <Text style={styles.metaItem}>{header.phone}</Text> : null}
          {submittedLabel ? (
            <Text style={styles.metaItem}>Onboarding submitted: {submittedLabel}</Text>
          ) : null}
        </View>
        <Text style={styles.subtitle}>Consolidated employee record — confidential</Text>

        {sections.map((section) => (
          <View key={section.title} style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.grid}>
              {section.items.map((row) => (
                <View
                  key={`${section.title}-${row.label}`}
                  style={row.fullWidth ? styles.fieldFull : styles.fieldHalf}
                >
                  <Text style={styles.fieldLabel}>{row.label}</Text>
                  {row.href ? (
                    <Link src={row.href} style={styles.link}>
                      {row.value}
                    </Link>
                  ) : (
                    <Text style={styles.fieldValue}>{row.value}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footer} fixed>
          Confidential employee record — Wills Farms Ltd.
        </Text>
      </Page>
    </Document>
  );
}
