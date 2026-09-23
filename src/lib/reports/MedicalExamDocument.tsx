import { Document, Link, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type {
  MedicalFormResponses,
  MedicalFormSchema,
  MedicalReferralData,
} from "@/lib/medical/medicalFormSchema";
import { getInvestigationDefs, medicalFieldLabel } from "@/lib/medical/medicalFormSchema";
import { isSystemField } from "@/lib/appraisal/pipFormSchema";
import {
  investigationResultSummary,
  investigationRowHasData,
  type InvestigationDef,
  type InvestigationEntry,
  type InvestigationsData,
} from "@/lib/medical/medicalInvestigationDefs";
import { formatDisplayDateTime } from "@/lib/formatDisplayDate";
import { DEFAULT_COMPANY_PRIMARY_COLOR } from "@/lib/systemDefinitions/companyBrandingConfig";

const DARK = "#111827";
const GRAY = "#6B7280";
const BORDER = "#E5E7EB";
const NAVY = "#1e3a5f";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, color: DARK, fontFamily: "Helvetica" },
  brand: { fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 },
  title: { fontSize: 16, fontWeight: 700, color: DARK, marginTop: 4 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  metaItem: { fontSize: 8.5, color: GRAY },
  sectionWrap: { marginTop: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: DARK,
    paddingBottom: 4,
    marginBottom: 8,
    borderBottom: `0.75pt solid ${BORDER}`,
  },
  referralBox: {
    backgroundColor: "#eff6ff",
    border: `0.75pt solid #bfdbfe`,
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  referralTitle: { fontSize: 9, fontWeight: 700, color: NAVY, marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fieldHalf: { width: "47%" },
  fieldFull: { width: "100%" },
  fieldLabel: { fontSize: 7.5, color: GRAY, marginBottom: 2 },
  fieldValue: { fontSize: 9.5, color: DARK, lineHeight: 1.45 },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderBottom: `0.75pt solid ${BORDER}`,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: `0.5pt solid ${BORDER}`,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableHeaderCell: { fontSize: 7.5, fontWeight: 700, color: GRAY },
  tableCell: { fontSize: 8.5, color: DARK, lineHeight: 1.35 },
  investigationBlock: {
    border: `0.75pt solid ${BORDER}`,
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  investigationTitle: { fontSize: 9, fontWeight: 700, color: DARK, marginBottom: 4 },
  link: { fontSize: 8.5, color: NAVY, textDecoration: "none" },
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

export type MedicalExamPdfPayload = {
  schema: MedicalFormSchema;
  responses: MedicalFormResponses;
  referral: MedicalReferralData;
  status: string;
  submittedAt?: string | null;
};

function getMedicalExamAttachments(
  responses: MedicalFormResponses,
): NonNullable<MedicalFormResponses["attachments"]> {
  const seen = new Set<string>();
  const docs: NonNullable<MedicalFormResponses["attachments"]> = [];
  for (const doc of [
    ...(responses.attachments ?? []),
    ...(responses.investigations?.lab_reports ?? []),
  ]) {
    if (seen.has(doc.secure_url)) continue;
    seen.add(doc.secure_url);
    docs.push(doc);
  }
  return docs;
}

function InvestigationsPdf({
  data,
  defs,
  attachments,
}: {
  data: InvestigationsData | undefined;
  defs: InvestigationDef[];
  attachments: NonNullable<MedicalFormResponses["attachments"]>;
}) {
  const investigations = data ?? { tests: {}, other: [] };
  const otherRows = (investigations.other ?? []).filter((o) => o.name?.trim() || o.result?.trim());
  const tableRows = [
    ...defs
      .map((def) => ({
        key: def.id,
        label: def.label,
        def,
        entry: investigations.tests[def.id] ?? {},
      }))
      .filter(({ def, entry }) => investigationRowHasData(def, entry)),
    ...otherRows.map((o) => ({
      key: o.id,
      label: o.name || "—",
      def: null as InvestigationDef | null,
      entry: { value: o.result, flag: o.flag } as InvestigationEntry,
    })),
  ];

  const hasAttachments = attachments.length > 0;
  if (tableRows.length === 0 && !hasAttachments) return null;

  return (
    <View style={styles.investigationBlock}>
      {tableRows.length > 0 ? (
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, { width: "40%" }]}>Investigation</Text>
        <Text style={[styles.tableHeaderCell, { width: "40%" }]}>Result summary</Text>
        <Text style={[styles.tableHeaderCell, { width: "20%" }]}>Flag (N/ABN)</Text>
      </View>
      ) : null}
      {tableRows.map((row) => (
        <View key={row.key} style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: "40%" }]}>{row.label}</Text>
          <Text style={[styles.tableCell, { width: "40%" }]}>
            {row.def
              ? investigationResultSummary(row.def, row.entry) || "—"
              : row.entry.value?.trim() || "—"}
          </Text>
          <Text style={[styles.tableCell, { width: "20%" }]}>{row.entry.flag?.trim() || "—"}</Text>
        </View>
      ))}
      {hasAttachments ? (
        <View style={{ marginTop: 8, paddingTop: 6, borderTop: `0.5pt solid ${BORDER}` }}>
          <Text style={[styles.fieldLabel, { marginBottom: 4 }]}>Uploaded test results &amp; imaging</Text>
          {attachments.map((doc) => (
            <Link key={doc.secure_url} src={doc.secure_url} style={styles.link}>
              {doc.original_name ?? "Document"}
            </Link>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function MedicalExamDocument({
  data,
  companyPrimaryColor = DEFAULT_COMPANY_PRIMARY_COLOR,
}: {
  data: MedicalExamPdfPayload;
  companyPrimaryColor?: string;
}) {
  const { schema, responses, referral, status, submittedAt } = data;
  const investigationDefs = getInvestigationDefs(schema);
  const statusLabel = status === "submitted" ? "Submitted" : "In progress";
  const submittedLabel = submittedAt ? formatDisplayDateTime(submittedAt) : null;

  const referralRows = [
    ["Candidate", referral.full_name],
    ["Reference", referral.reference_number],
    ["Position", referral.position_offered],
    ["Examination type", referral.examination_type],
    ["Job category", referral.job_category],
    ["Facility", referral.designated_facility],
    ["Appointment date", referral.appointment_date],
  ].filter(([, v]) => String(v ?? "").trim());

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={[styles.brand, { color: companyPrimaryColor }]}>
          Wills Farms Ltd. — Occupational medical examination
        </Text>
        <Text style={styles.title}>{schema.title?.trim() || "Occupational medical examination"}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaItem}>Status: {statusLabel}</Text>
          {submittedLabel ? <Text style={styles.metaItem}>Submitted: {submittedLabel}</Text> : null}
        </View>

        <View style={styles.referralBox}>
          <Text style={styles.referralTitle}>Referral (Part 1)</Text>
          <View style={styles.grid}>
            {referralRows.map(([label, value]) => (
              <View key={label} style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <Text style={styles.fieldValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {schema.sections
          .filter((section) => section.key !== "supporting_documents")
          .map((section) => (
          <View key={section.key} style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.kind === "fields" && section.key === "investigations" ? (
              <InvestigationsPdf
                data={responses.investigations}
                defs={investigationDefs}
                attachments={getMedicalExamAttachments(responses)}
              />
            ) : section.kind === "fields" ? (
              <View style={styles.grid}>
                {section.fields
                  .filter((f) => !isSystemField(f) && f.key !== "licence_no")
                  .map((field) => {
                    const value = responses.fields?.[field.key]?.toString()?.trim() || "—";
                    return (
                      <View key={field.key} style={styles.fieldFull}>
                        <Text style={styles.fieldLabel}>{medicalFieldLabel(field)}</Text>
                        <Text style={styles.fieldValue}>{value}</Text>
                      </View>
                    );
                  })}
              </View>
            ) : (
              <View>
                <View style={styles.tableHeaderRow}>
                  {section.columns.map((col) => (
                    <Text
                      key={col.key}
                      style={[
                        styles.tableHeaderCell,
                        { flex: 1, paddingRight: 4 },
                      ]}
                    >
                      {col.label}
                    </Text>
                  ))}
                </View>
                {(responses.tables?.[section.key] ?? []).map((row, i) => (
                  <View key={i} style={styles.tableRow}>
                    {section.columns.map((col) => (
                      <Text
                        key={col.key}
                        style={[styles.tableCell, { flex: 1, paddingRight: 4 }]}
                      >
                        {row[col.key]?.toString() || "—"}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <Text style={styles.footer} fixed>
          Confidential occupational medical record — generated by WillsOne
        </Text>
      </Page>
    </Document>
  );
}
