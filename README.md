# Wills Farms Ltd — Website (Next.js + TypeScript + Tailwind)

A premium, conversion-focused website for Wills Farms Ltd (genetics-led, vertically integrated pork company powered by Axiom Genetics, France).  
Key lead goals: **Parent gilt inquiries/bookings** and **B2B premium pork supply inquiries**.

## What’s included
- Next.js App Router, TypeScript, Tailwind CSS
- Single editable content config: `src/content/siteContent.ts`
- Reusable components: Navbar, Footer, Hero, FeatureGrid, CTA, FAQ, LeadForm
- Two lead routes: Gilts vs Pork (B2B), tagged via `leadType`
- Spam protection: honeypot + basic rate limiting (placeholder)
- SEO: Metadata, OpenGraph/Twitter cards, sitemap, robots, JSON-LD schema (Organization + LocalBusiness)
- Analytics placeholders (GA4/GTM)

## Local development
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Update content and links
- Primary site copy and CTAs live in `src/content/siteContent.ts`
- Update the live domain in:
  - `siteContent.seo.siteUrl`

## Forms / Lead routing
The lead endpoint is:
- `POST /api/lead`

Currently, the server logs the lead record (placeholder). Integrate your CRM/email provider inside:
- `app/api/lead/route.ts`

Recommended integrations:
- Email notifications (Resend/SendGrid)
- CRM capture (HubSpot/Zoho/Salesforce)
- Slack/Teams notifications for fast follow-up

## Deploy to Vercel
1. Push this repo to GitHub (or GitLab/Bitbucket).
2. In Vercel: **New Project** → import repo.
3. Framework preset: Next.js (auto-detected).
4. Set environment variables (optional placeholders):
   - `NEXT_PUBLIC_GA4_ID`
   - `NEXT_PUBLIC_GTM_ID`
5. Deploy.

## Domain setup (willsfarms.com)
1. In Vercel project settings → Domains → add `willsfarms.com` and `www.willsfarms.com`.
2. Update DNS at your registrar:
   - Apex: A record to Vercel IP (Vercel will provide)
   - `www`: CNAME to Vercel target (Vercel will provide)
3. Once verified, set the primary domain (usually `www` or apex) and redirect the other.
4. Update `siteContent.seo.siteUrl` to match your primary domain.

## Brand assets
- Logo: `public/brand/willsfarms-logo.png`
- Place future partner logos in `public/partners/`
- Place PDFs in `public/downloads/` and update the placeholder links in the content config.

## Important constraints (implemented)
- No semen/AI services appear anywhere.
- Premium Pork page is B2B only; no retail/household sales content.
- No invented certifications or accreditations; wording is conservative and factual.


## Leads Inbox (Admin) — Supabase/Postgres
This codebase includes a lightweight admin leads inbox at:

- `/admin/leads`

### Configure Supabase
Set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Create the table using the SQL in:
- `docs/LEADS_INBOX_SUPABASE.md`

### Protect the admin area (recommended)
Set:
- `ADMIN_USER`
- `ADMIN_PASSWORD`

Admin routes use HTTP Basic Auth middleware.

