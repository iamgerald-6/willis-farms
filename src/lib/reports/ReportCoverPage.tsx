import { Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { WILLS_FARMS_LOGO_MARK_DATA_URI } from "@/lib/reports/assets/offerLetterBranding";
import { DEFAULT_COMPANY_PRIMARY_COLOR } from "@/lib/systemDefinitions/companyBrandingConfig";

// Shared cover page for report-style PDFs (Task Manager monthly report,
// individual interview report, role hiring summary report — see Sheila's
// explicit scope call: NOT the Offer Letter, which is a formal letter with
// its own letterhead, and NOT the Employee Profile). The accent color is
// HR-editable (System Definitions → Offer letter → Company branding —
// see companyBrandingConfig.ts) so every generated PDF reads as one
// consistent, branded family of documents that stays in sync with a
// rebrand instead of needing a code change.
const DARK = "#111827";
const GRAY = "#6B7280";

const LOGO_SIZE = 130;

const styles = StyleSheet.create({
  page: {
    padding: 56,
    fontFamily: "Helvetica",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    objectFit: "contain",
    marginBottom: 32,
  },
  companyName: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 14,
  },
  rule: {
    width: 64,
    height: 2,
    marginBottom: 24,
  },
  title: {
    fontSize: 23,
    fontWeight: 700,
    color: DARK,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 12.5,
    color: GRAY,
    textAlign: "center",
    marginTop: 10,
  },
  siteTag: {
    marginTop: 20,
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: "#FEF2F2",
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  meta: {
    position: "absolute",
    bottom: 44,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 8.5,
    color: GRAY,
  },
});

export function ReportCoverPage({
  logoUrl,
  title,
  subtitle,
  siteLabel,
  metaLine,
  primaryColor = DEFAULT_COMPANY_PRIMARY_COLOR,
}: {
  /** HR's uploaded logo (System Definitions → Offer letter → Company
   * branding), falling back to the same default mark the offer letter
   * uses when nothing's been uploaded yet. */
  logoUrl?: string | null;
  title: string;
  subtitle?: string | null;
  /** Shown as a small badge under the title — for a report scoped to one
   * site rather than company-wide. Omit entirely for a company-wide report. */
  siteLabel?: string | null;
  metaLine?: string | null;
  /** HR's saved accent color (System Definitions → Offer letter → Company
   * branding) — defaults to the same color the letterhead artwork always
   * used, if a caller hasn't fetched/passed one. */
  primaryColor?: string;
}) {
  return (
    <Page size="A4" style={styles.page}>
      <Image src={logoUrl || WILLS_FARMS_LOGO_MARK_DATA_URI} style={styles.logo} />
      <Text style={[styles.companyName, { color: primaryColor }]}>Wills Farms Ltd</Text>
      <View style={[styles.rule, { backgroundColor: primaryColor }]} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {siteLabel ? <Text style={[styles.siteTag, { color: primaryColor }]}>{siteLabel}</Text> : null}
      {metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}
    </Page>
  );
}
