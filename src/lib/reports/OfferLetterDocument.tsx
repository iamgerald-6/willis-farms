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
  compensationBox: {
    marginBottom: 16,
    padding: 10,
    border: `0.5pt solid ${BORDER}`,
    backgroundColor: "#F9FAFB",
    borderRadius: 4,
  },
  compensationLabel: {
    fontSize: 8,
    color: GRAY,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  compensationValue: {
    fontSize: 10.5,
    fontWeight: 700,
    color: DARK,
    marginBottom: 2,
  },
  compensationDetail: {
    fontSize: 9.5,
    color: GRAY,
    marginBottom: 1,
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

        {data.salaryDisplay && (
          <View style={styles.compensationBox}>
            <Text style={styles.compensationLabel}>Gross salary</Text>
            <Text style={styles.compensationValue}>{data.salaryDisplay}</Text>
            {data.payFrequency ? (
              <Text style={styles.compensationDetail}>
                Pay frequency: {data.payFrequency}
              </Text>
            ) : null}
            {data.gradeLevel ? (
              <Text style={styles.compensationDetail}>Grade: {data.gradeLevel}</Text>
            ) : null}
            {data.employmentType ? (
              <Text style={styles.compensationDetail}>
                Employment: {data.employmentType}
              </Text>
            ) : null}
            {data.department ? (
              <Text style={styles.compensationDetail}>
                Department: {data.department}
              </Text>
            ) : null}
            {data.workLocation ? (
              <Text style={styles.compensationDetail}>
                Location: {data.workLocation}
              </Text>
            ) : null}
          </View>
        )}

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
    </Document>
  );
}
