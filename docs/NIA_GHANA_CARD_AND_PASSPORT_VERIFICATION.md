# Wills Farms — Ghana Card (NIA IVSP) & Passport Verification Guide

**Version:** 1.0  
**Date:** 24 August 2026  
**Audience:** HR, Engineering, Compliance  
**Status:** Planning / pre-integration

---

## 1. Executive summary

Ghana's **National Identity Register (Amendment) Regulations, 2026 (L.I. 2523)** requires organizations to stop relying on photocopies, scans, or visual inspection of the Ghana Card. Identity must be verified **biometrically** through NIA's **Identity Verification System Platform (IVSP)** via API or approved devices.

For **foreign nationals**, the platform currently collects a **passport number** and **bio-page photo upload**. AI can help detect obvious fakes and tampering, but **upload-only checks are not foolproof** — strong verification needs layered checks (MRZ validation, liveness, face match, and ideally NFC chip read for e-passports).

**Compliance deadline:** Full transition expected by **2 November 2026** (law effective 9 June 2026; transition period 27 July – 2 November 2026).

---

## 2. Legal background

### 2.1 L.I. 2523 — what changed

| Before | After (L.I. 2523) |
|--------|-------------------|
| Staff glance at Ghana Card | **Biometric verification mandatory** |
| Photocopy/scan stored in HR file | **Prohibited** — request, retain, reproduce |
| Card number typed = "verified" | Must verify via **NIA IVSP** or approved device |
| Visual inspection sufficient | **Not legally sufficient** |

**Sources:**

- [NIA — Identity Verification Services](https://nia.gov.gh/service/verification-services/)
- [Ministry of the Interior — L.I. 2523 announcement](https://www.mint.gov.gh/government-strengthens-identification-verification-system/)
- [Graphic Online — Nov 2, 2026 deadline](https://www.graphic.com.gh/news/general-news/banks-telcos-and-hospitals-have-until-november-2-to-stop-taking-ghana-card-photocopies.html)

### 2.2 Who must comply

Not only banks. NIA and government communications cite **employers, HR, schools, hospitals, telcos, insurers**, and any organization that verifies identity in the course of business.

Employment/onboarding is in scope because:

- L.I. 2111 covers transactions with **social security implications** (SSNIT)
- NIA can gazette additional mandatory uses under Regulation 7(1)(n)

### 2.3 Penalties for non-compliance

- Fines
- Suspension or termination of IVSP access
- Possible licence withdrawal / business closure (where law permits)
- Public toll-free reporting lines for citizens to report institutions still photocopying cards

---

## 3. NIA IVSP — integration overview

### 3.1 Platform name

**IVSP** = Identity Verification System Platform (NIA's official verification infrastructure)

### 3.2 Verification methods

1. **API integration** — server-to-server; biometric capture sent to NIA; result returned
2. **Match-on-card devices** — NIA-approved hardware for in-person verification

### 3.3 Service tiers (typical)

| Tier | What it does | Best for |
|------|--------------|----------|
| **Yes/No** | "Does this person match this Ghana Card?" | Gatekeeping at application/onboarding — **cheapest** |
| **Full dataset** | Returns permitted fields (name, DOB, address, etc.) | Auto-prefill HR records from NIA as source of truth |

Exact datasets available are defined in your **IVSP contract** and the [IVSP User Request Form](https://nia.gov.gh/wp-content/uploads/IVSP-User-Request-Form_v2.225F.pdf).

### 3.4 Onboarding process (institution)

**Contact:** `idverification@nia.gov.gh`  
**Form:** [IVSP User Request Form (PDF)](https://nia.gov.gh/wp-content/uploads/IVSP-User-Request-Form_v2.225F.pdf)

| Step | Action |
|------|--------|
| 1 | Complete request form; email NIA |
| 2 | Submit business registration, **Data Protection Commission certificate**, SSNIT employer cert (if applicable), process flow document |
| 3 | NIA reviews; schedules meeting |
| 4 | Build technical infrastructure; sign service contract |
| 5 | Receive API credentials / merchant key; go live |

**Prerequisites for Wills Farms:**

- Valid **Data Protection Commission** registration (data controller/processor)
- Documented HR/recruitment process flow showing where verification happens
- Estimated monthly verification volume

**Note:** Public API documentation (endpoints, payloads) is **not open**. Provided after contract signing.

---

## 4. Pricing

### 4.1 Published pricing — financial institutions (reference)

NIA has published **per-verification** tiered pricing for **financial institutions** (widely cited from [nia.gov.gh/fees-and-charges-2026](https://nia.gov.gh/fees-and-charges-2026/)):

| Monthly volume | Full dataset | Yes/No only |
|----------------|--------------|-------------|
| 0 – 100,000 | **GH¢ 1.70** | **GH¢ 0.60** |
| 100,001 – 500,000 | GH¢ 1.15 | GH¢ 0.30 |
| 500,001 – 1,000,000 | GH¢ 0.80 | GH¢ 0.20 |
| Above 1,000,000 | GH¢ 0.60 | GH¢ 0.10 |

### 4.2 Employers (non-financial) — confirm with NIA

NIA does **not** publish a standard employer price list online. Expect a **custom quote** during onboarding. Use financial-institution tiers as a **rough reference only**.

### 4.3 Wills Farms ballpark (Yes/No, assuming ≤100k/month tier)

| Hires / verifications per month | Est. cost (Yes/No @ GH¢0.60) | Est. cost (Full @ GH¢1.70) |
|---------------------------------|------------------------------|----------------------------|
| 20 | ~GH¢ 12 | ~GH¢ 34 |
| 50 | ~GH¢ 30 | ~GH¢ 85 |
| 100 | ~GH¢ 60 | ~GH¢ 170 |
| 500 | ~GH¢ 300 (may hit lower tier) | ~GH¢ 575+ |

**Additional costs:** Possible one-time setup fee; internal dev time; biometric capture hardware if not purely mobile SDK.

**Recommendation:** Request **Yes/No** pricing for employers first — sufficient if you only need to confirm identity at hire, not pull full demographics from NIA.

---

## 5. Impact on Wills Farms platform (current state)

### 5.1 Ghana Card today

| Location | Current behavior | Compliance gap |
|----------|------------------|----------------|
| Job application (`JobApplicationWizard`, `GhanaCardInput`) | Collects `ghana_card_no`; format regex `GHA-XXXXXXXXX-X` | Format check ≠ biometric verification |
| Onboarding wizard | Prefills/hides if from application | Still stores number without IVSP proof |
| HR review (`ApplicationFormReview`) | Displays card number | No verification audit trail |

**Key files:**

- `src/components/GhanaCardInput.tsx`
- `src/lib/careers/applicationFormSchema.ts`
- `src/lib/systemDefinitions/recruitmentDefaults.ts`

### 5.2 Target flow (Ghanaian citizens)

```
┌─────────────────────────────────────────────────────────────┐
│  Job Application — Personal step                             │
├─────────────────────────────────────────────────────────────┤
│  1. Applicant enters Ghana Card PIN/number (optional lookup) │
│  2. IVSP biometric capture (fingerprint / approved method)   │
│  3. NIA returns: verified ✓ / failed ✗ + reference ID       │
│  4. Store: verification_id, verified_at, method — NOT scan  │
│  5. Block "Continue" if verification fails                   │
└─────────────────────────────────────────────────────────────┘
```

**Do not:**

- Request Ghana Card photocopies or scans
- Treat regex-valid card number as proof of identity
- Store card images

**May still store (confirm with NIA contract + DPC):**

- Card number **after** successful IVSP verification
- Verification reference for audit

### 5.3 Foreign nationals — passport (separate from NIA)

NIA IVSP covers **Ghana Card**. Foreign workers use **passport** — see Section 6.

Current platform fields:

- `passport_number`
- `passport_bio_page` (photo upload)

Defined in `src/lib/systemDefinitions/recruitmentDefaults.ts`, `src/lib/uploadConstraints.ts`.

---

## 6. Passport bio-page upload — can AI detect fakes?

### 6.1 Short answer

**Partially yes — but not with certainty from a photo upload alone.**

Modern document-verification AI can catch **many** fakes (Photoshop edits, wrong MRZ checksums, template mismatches, screen photos, some AI-generated documents). It **cannot guarantee** detection of all sophisticated forgeries, especially:

- High-quality physical counterfeits photographed well
- Subtle text-only edits
- Documents from layouts the model hasn't seen
- Replay attacks (photo of a photo on a screen)

**Upload-only = weaker than upload + liveness + face match + (for e-passports) NFC chip read.**

### 6.2 What AI document checks actually do

| Check | Detects | Limitation |
|-------|---------|------------|
| **MRZ OCR + checksum** | Invalid machine-readable zone; typos; format errors | Doesn't prove document is genuine if MRZ was copied from real passport |
| **Template / layout analysis** | Wrong fonts, spacing, country template | Varies by country; new passport designs need model updates |
| **Tamper / manipulation detection** | Pixel edits, copy-paste, compression artifacts, portrait swap | Misses skilled forgeries; false positives on phone camera glare |
| **Security feature analysis** | Holograms, OVI (needs controlled capture / video) | **Hard from single flat phone photo** |
| **Document liveness** | Screen replay, printout, static image | Requires guided capture or video |
| **Face match + liveness** | Person holding doc ≠ photo on doc; deepfake selfie | Extra step beyond upload |
| **NFC chip read (e-passport)** | Cryptographically signed data from chip | **Strongest**; needs NFC-capable device + user cooperation |

### 6.3 Realistic accuracy expectations

Industry KYC vendors (Mitek, Regula, ComplyCube, Microblink, etc.) report strong results in **controlled onboarding flows** with:

- Guided capture (edge detection, glare warnings)
- Multiple frames / video
- MRZ cross-check against visual zone
- Selfie liveness + face match

**Standalone "upload JPEG and score it"** without those layers:

- Good at catching **obvious** fakes and edits
- **Not** border-control grade
- Should route uncertain cases to **manual HR review**

Research (2025) notes forgery detection models still struggle to **generalize across all country layouts** and small tampered regions — human review remains important for edge cases.

### 6.4 Recommended approach for Wills Farms (foreign applicants)

**Minimum (better than today):**

1. Passport bio-page upload with quality guidance (lighting, full page, no glare)
2. Automated **MRZ extraction + ICAO checksum validation**
3. Cross-check: name / DOB on visual zone vs MRZ vs application form
4. **Tamper/manipulation score** via document API (flag low-confidence for HR)

**Strong (recommended for production hiring):**

1. All of the above, plus
2. **Selfie liveness** + **face match** to passport portrait
3. Reject or escalate if match score below threshold

**Best (high-risk roles or large foreign hire volume):**

1. All of the above, plus
2. **NFC chip read** for e-passports where device supports it
3. Optional: manual HR verification at interview with physical passport

### 6.5 Build vs buy

| Option | Pros | Cons |
|--------|------|------|
| **Custom AI (train your own)** | Control | Expensive; needs huge datasets; poor generalization |
| **KYC API vendor** (ComplyCube, Onfido, Regula, Microblink, etc.) | Battle-tested; MRZ + tamper + liveness | Per-check cost; vendor lock-in |
| **Manual HR review only** | Cheap | Slow; misses digital tampering; doesn't scale |

**Practical recommendation:** Use a **document verification API** for passport uploads rather than building in-house. Pair with HR manual review for flagged cases.

**Typical vendor pricing (indicative, varies):** ~$0.50–$2.00 USD per document check depending on volume and features (MRZ only vs full fraud + liveness). Request quotes.

### 6.6 What to store after verification

| Store | Don't store |
|-------|-------------|
| Passport number (after verified) | Unnecessary full-resolution copies long-term if not required |
| Verification result + vendor reference ID | Raw bio-page image indefinitely (minimize per DPC principles) |
| Expiry date, nationality | — |

Align retention with **Data Protection Commission** policy and purpose limitation (recruitment/onboarding only).

---

## 7. Proposed verification matrix

| Applicant type | Primary ID | Verification method | Est. cost |
|----------------|------------|---------------------|-----------|
| Ghanaian citizen | Ghana Card | NIA IVSP Yes/No (+ biometric) | ~GH¢ 0.60/check (confirm) |
| Ghanaian citizen | Ghana Card | NIA IVSP Full dataset (prefill) | ~GH¢ 1.70/check (confirm) |
| Foreign national | Passport | Document API (MRZ + tamper) | ~$0.50–2/check |
| Foreign national | Passport | + Liveness + face match | Higher tier |
| Foreign national | e-Passport | + NFC chip read | Premium tier |

---

## 8. Implementation roadmap

| Phase | Timeline | Actions |
|-------|----------|---------|
| **A — Compliance prep** | Now | Email `idverification@nia.gov.gh`; confirm DPC cert; stop any card photocopy practices |
| **B — IVSP onboarding** | 1–3 months | Submit forms; contract; receive API credentials |
| **C — Ghana Card integration** | Dev sprint | IVSP step in job application; store verification audit; block unverified continue |
| **D — Passport enhancement** | Parallel or after C | Integrate document verification API; add liveness for foreigners |
| **E — HR dashboard** | With C/D | Show verification status (verified ✓ / pending / failed / manual review) |
| **F — Go live** | Before **2 Nov 2026** | Staff training; monitoring; escalation path |

---

## 9. Email template to NIA

```
To: idverification@nia.gov.gh
Subject: IVSP Onboarding Request — Wills Farms (Employer / HR)

Dear NIA IVSP Team,

We are Wills Farms, an agricultural employer in Ghana. We verify identity
during job application and employee onboarding and wish to onboard onto
the Identity Verification System Platform (IVSP).

Attached:
- Completed IVSP User Request Form
- Business registration
- Data Protection Commission certificate
- SSNIT employer certificate
- Process flow document (recruitment → onboarding)

Estimated volume: [X] verifications per month
Preferred service: Yes/No verification (confirm employer pricing)

Please advise on next steps, employer fee schedule, and technical
documentation for API integration.

Regards,
[Name, Title, Contact]
```

---

## 10. Open questions for NIA / legal counsel

1. Employer-specific pricing for Yes/No vs full dataset?
2. May we retain Ghana Card **number** after IVSP verification, or only verification reference?
3. Is employment/recruitment explicitly listed under L.I. 2111 Reg. 7 transactions?
4. API technical spec, sandbox environment, and SLA?
5. Mobile web biometric capture supported, or device required?
6. Foreign nationals — any NIA/FIMS integration for foreign ID cards, or passport-only?

---

## 11. References

- NIA Verification Services: https://nia.gov.gh/service/verification-services/
- NIA Fees 2026: https://nia.gov.gh/fees-and-charges-2026/
- IVSP Request Form: https://nia.gov.gh/wp-content/uploads/IVSP-User-Request-Form_v2.225F.pdf
- Ministry of Interior L.I. 2523: https://www.mint.gov.gh/government-strengthens-identification-verification-system/
- Document fraud detection (industry): ComplyCube, Mitek, Regula product documentation

---

## 12. Disclaimer

This document is for **internal planning only**. It is not legal advice. Confirm all compliance and pricing with NIA, the Data Protection Commission, and qualified legal counsel before changing production systems.
