import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { OfferLetterContext } from "@/lib/careers/resolveOfferLetterContext";
import {
  WILLS_FARMS_LETTERHEAD_DATA_URI,
  WILLS_FARMS_LOGO_MARK_DATA_URI,
} from "@/lib/reports/assets/offerLetterBranding";

// A4 page size in points, used to center the background watermark.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

// Letterhead artwork is 1205x342px — sized to roughly match its footprint
// in the original Wills Farms template (~260pt wide).
const LETTERHEAD_WIDTH = 260;
const LETTERHEAD_HEIGHT = LETTERHEAD_WIDTH * (342 / 1205);

// Logo-mark crop is 411x275px — sized large and centered as a faint
// background watermark, low enough opacity to stay behind the letter text.
const WATERMARK_WIDTH = 320;
const WATERMARK_HEIGHT = WATERMARK_WIDTH * (275 / 411);

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
  letterheadLogo: {
    width: LETTERHEAD_WIDTH,
    height: LETTERHEAD_HEIGHT,
    objectFit: "contain",
  },
  watermark: {
    position: "absolute",
    top: (PAGE_HEIGHT - WATERMARK_HEIGHT) / 2,
    left: (PAGE_WIDTH - WATERMARK_WIDTH) / 2,
    width: WATERMARK_WIDTH,
    height: WATERMARK_HEIGHT,
    opacity: 0.07,
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
  signatureImage: {
    width: 130,
    height: 46,
    marginTop: 10,
    objectFit: "contain",
  },
  signatureTyped: {
    fontFamily: "Times-Italic",
    fontSize: 20,
    marginTop: 10,
    color: DARK,
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
  annexSeparator: {
    borderTop: `0.75pt solid ${BORDER}`,
    marginTop: 28,
    paddingTop: 22,
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
        {/* fixed: repeats identically on every physical page this content
           flows onto (including auto-generated overflow pages), unlike the
           letterhead below which should only ever appear once. */}
        <Image src={WILLS_FARMS_LOGO_MARK_DATA_URI} style={styles.watermark} fixed />

        <View style={styles.letterheadBar}>
          <Image src={WILLS_FARMS_LETTERHEAD_DATA_URI} style={styles.letterheadLogo} />
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
          {data.signatureType === "drawn" && data.signatureImageUrl ? (
            <Image src={data.signatureImageUrl} style={styles.signatureImage} />
          ) : (
            <Text style={styles.signatureTyped}>
              {data.signatureType === "typed" && data.signatureText
                ? data.signatureText
                : "[HR TO SIGN]"}
            </Text>
          )}
          <Text style={styles.signName}>{data.signerName || "[HR TO COMPLETE]"}</Text>
          <Text style={styles.signTitle}>{data.signerTitle || "Wills Farms Ltd."}</Text>
        </View>

        {/* Annex continues in the same content flow right after the
           sign-off — not a separate Page — so it starts wherever the
           letter happens to end (same page if there's room) instead of
           always forcing a new page and leaving a gap behind it. */}
        <View style={styles.annexSeparator}>
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
        </View>

        <Text style={styles.footer} fixed>
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
