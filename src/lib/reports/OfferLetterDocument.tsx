import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { OfferLetterContext } from "@/lib/careers/resolveOfferLetterContext";

const RED = "#991B1B";
const DARK = "#111827";
const GRAY = "#6B7280";
const BORDER = "#E5E7EB";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontSize: 10.5,
    color: DARK,
    fontFamily: "Helvetica",
    lineHeight: 1.55,
  },
  letterheadBar: {
    borderBottom: `2pt solid ${RED}`,
    paddingBottom: 14,
    marginBottom: 24,
  },
  companyName: {
    fontSize: 18,
    fontWeight: 700,
    color: RED,
    letterSpacing: 0.4,
  },
  companyTagline: {
    fontSize: 8.5,
    color: GRAY,
    marginTop: 4,
  },
  companyContact: {
    fontSize: 8,
    color: GRAY,
    marginTop: 6,
  },
  metaDate: {
    fontSize: 10,
    color: DARK,
    marginBottom: 18,
  },
  recipientBlock: {
    marginBottom: 20,
  },
  recipientLine: {
    fontSize: 10.5,
    marginBottom: 2,
  },
  subject: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 12,
    color: DARK,
  },
  paragraph: {
    marginBottom: 10,
    textAlign: "justify",
  },
  closing: {
    marginTop: 18,
  },
  signOff: {
    marginTop: 28,
  },
  signName: {
    fontWeight: 700,
    marginTop: 4,
  },
  signTitle: {
    fontSize: 9.5,
    color: GRAY,
    marginTop: 2,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 7.5,
    color: GRAY,
    textAlign: "center",
    borderTop: `0.5pt solid ${BORDER}`,
    paddingTop: 8,
  },
  annexTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: RED,
    marginBottom: 4,
  },
  annexSubtitle: {
    fontSize: 9,
    color: GRAY,
    marginBottom: 18,
  },
  annexSectionLabel: {
    fontSize: 9.5,
    fontWeight: 700,
    color: DARK,
    marginBottom: 6,
    marginTop: 14,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  table: {
    border: `0.5pt solid ${BORDER}`,
    borderRadius: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: `0.5pt solid ${BORDER}`,
  },
  tableRowLast: {
    flexDirection: "row",
  },
  tableCellLabel: {
    flex: 2,
    fontSize: 10,
    color: DARK,
    padding: 8,
  },
  tableCellValue: {
    flex: 1.4,
    fontSize: 10,
    color: DARK,
    padding: 8,
    textAlign: "right",
  },
  tableRowNet: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
  },
  tableCellLabelBold: {
    flex: 2,
    fontSize: 10,
    fontWeight: 700,
    color: DARK,
    padding: 8,
  },
  tableCellValueBold: {
    flex: 1.4,
    fontSize: 10,
    fontWeight: 700,
    color: DARK,
    padding: 8,
    textAlign: "right",
  },
});

export type OfferLetterPdfPayload = OfferLetterContext & {
  body: string;
};

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function OfferLetterDocument({ data }: { data: OfferLetterPdfPayload }) {
  const paragraphs = splitParagraphs(data.body);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.letterheadBar}>
          <Text style={styles.companyName}>Wills Farms Ltd.</Text>
          <Text style={styles.companyTagline}>
            Genetics-led agribusiness · Professional farm management
          </Text>
          <Text style={styles.companyContact}>
            info@willsfarms.com · www.willsfarms.com · Ghana
          </Text>
        </View>

        <Text style={styles.metaDate}>{data.letterDate}</Text>

        <View style={styles.recipientBlock}>
          <Text style={styles.recipientLine}>{data.candidateName}</Text>
          <Text style={styles.recipientLine}>{data.candidateEmail}</Text>
          <Text style={styles.recipientLine}>Ref: {data.referenceNumber}</Text>
        </View>

        <Text style={styles.subject}>
          Offer of Employment — {data.roleTitle}
        </Text>

        {paragraphs.map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}

        <View style={styles.signOff}>
          <Text>Yours sincerely,</Text>
          <Text style={styles.signName}>Human Capital Team</Text>
          <Text style={styles.signTitle}>Wills Farms Ltd.</Text>
        </View>

        <Text style={styles.footer}>
          Confidential — This letter is intended solely for the named recipient.
        </Text>
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.letterheadBar}>
          <Text style={styles.companyName}>Wills Farms Ltd.</Text>
          <Text style={styles.companyTagline}>
            Genetics-led agribusiness · Professional farm management
          </Text>
        </View>

        <Text style={styles.annexTitle}>Annex 1 — Compensation Details</Text>
        <Text style={styles.annexSubtitle}>
          {data.candidateName} · {data.roleTitle} · Ref: {data.referenceNumber}
        </Text>

        <Text style={styles.annexSectionLabel}>Earnings</Text>
        <View style={styles.table}>
          <AnnexRow label="Basic Salary" value={data.basicSalaryGhs} />
          <AnnexRow label="Housing Allowance" value={data.housingAllowance} />
          <AnnexRow label="Medical Allowance" value={data.medicalAllowance} last />
        </View>

        <Text style={styles.annexSectionLabel}>Deductions</Text>
        <View style={styles.table}>
          <AnnexRow label="Social Security Contribution (SSNIT)" value={data.socialSecurityContribution} />
          <AnnexRow label="Income Tax" value={data.incomeTax} last />
        </View>

        <Text style={styles.annexSectionLabel}>Net Payable</Text>
        <View style={styles.table}>
          <View style={styles.tableRowNet}>
            <Text style={styles.tableCellLabelBold}>Net Payable</Text>
            <Text style={styles.tableCellValueBold}>{data.netPayable || "[HR TO COMPLETE]"}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Confidential — This letter is intended solely for the named recipient.
        </Text>
      </Page>
    </Document>
  );
}

function AnnexRow({
  label,
  value,
  last,
}: {
  label: string;
  value?: string;
  last?: boolean;
}) {
  return (
    <View style={last ? styles.tableRowLast : styles.tableRow}>
      <Text style={styles.tableCellLabel}>{label}</Text>
      <Text style={styles.tableCellValue}>{value || "[HR TO COMPLETE]"}</Text>
    </View>
  );
}
