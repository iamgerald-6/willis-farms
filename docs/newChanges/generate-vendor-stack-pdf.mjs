/**
 * Vendor stack spec sheet for WillsOne (phone-spec style, not a price flyer).
 * Run: node docs/newChanges/generate-vendor-stack-pdf.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "WillsOne-Vendor-Stack-Specs.pdf");

const PAGE = { w: 612, h: 792 };
const MARGIN = { l: 48, r: 48, t: 56, b: 48 };

const C = {
  navy: rgb(0.106, 0.165, 0.29),
  red: rgb(0.722, 0.118, 0.227),
  ink: rgb(0.122, 0.161, 0.216),
  muted: rgb(0.4, 0.447, 0.51),
  line: rgb(0.863, 0.882, 0.906),
  wash: rgb(0.965, 0.969, 0.976),
  white: rgb(1, 1, 1),
  paleRed: rgb(0.98, 0.94, 0.94),
};

function ascii(text) {
  return String(text)
    .replace(/[—–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/·/g, "|")
    .replace(/×/g, "x")
    .replace(/™/g, "")
    .replace(/®/g, "");
}

function wrap(font, text, size, maxWidth) {
  const words = ascii(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  doc.setTitle("WillsOne vendor stack specs");
  doc.setAuthor("WillsOne");
  doc.setSubject(
    "Spec-sheet comparison of paid platforms used by the WillsOne Next.js app",
  );
  doc.setCreator("WillsOne");

  const pages = [];
  let page = null;
  let y = 0;
  const contentW = PAGE.w - MARGIN.l - MARGIN.r;

  function addPage() {
    page = doc.addPage([PAGE.w, PAGE.h]);
    pages.push(page);
    y = PAGE.h - MARGIN.t;
    page.drawRectangle({
      x: 0,
      y: PAGE.h - 28,
      width: PAGE.w,
      height: 28,
      color: C.navy,
    });
    page.drawText("WillsOne  |  Vendor stack specs", {
      x: MARGIN.l,
      y: PAGE.h - 19,
      size: 8,
      font: bold,
      color: C.white,
    });
    page.drawText("Decision brief  |  September 2026", {
      x: PAGE.w - MARGIN.r - font.widthOfTextAtSize("Decision brief  |  September 2026", 8),
      y: PAGE.h - 19,
      size: 8,
      font,
      color: C.white,
    });
  }

  function ensure(h) {
    if (y - h < MARGIN.b + 18) addPage();
  }

  function h1(text) {
    ensure(36);
    y -= 8;
    page.drawRectangle({ x: MARGIN.l, y: y - 2, width: 4, height: 16, color: C.red });
    page.drawText(ascii(text), { x: MARGIN.l + 12, y, size: 13, font: bold, color: C.navy });
    y -= 20;
  }

  function h2(text) {
    ensure(26);
    y -= 2;
    page.drawText(ascii(text), { x: MARGIN.l, y, size: 10.5, font: bold, color: C.navy });
    y -= 15;
  }

  function para(text, size = 9, leading = 12.5) {
    const lines = wrap(font, text, size, contentW);
    for (const line of lines) {
      ensure(leading);
      page.drawText(line, { x: MARGIN.l, y, size, font, color: C.ink });
      y -= leading;
    }
    y -= 3;
  }

  function bullet(text) {
    const lines = wrap(font, text, 9, contentW - 14);
    for (let i = 0; i < lines.length; i++) {
      ensure(12.5);
      if (i === 0) page.drawCircle({ x: MARGIN.l + 4, y: y + 3, size: 1.5, color: C.red });
      page.drawText(lines[i], { x: MARGIN.l + 14, y, size: 9, font, color: C.ink });
      y -= 12.5;
    }
    y -= 1;
  }

  function callout(title, body, kind = "navy") {
    const size = 8.5;
    const titleLines = wrap(bold, title, 9, contentW - 24);
    const bodyLines = wrap(font, body, size, contentW - 24);
    const h = 16 + titleLines.length * 12 + bodyLines.length * 11.5 + 10;
    ensure(h);
    page.drawRectangle({
      x: MARGIN.l,
      y: y - h + 12,
      width: contentW,
      height: h,
      color: kind === "red" ? C.paleRed : C.wash,
    });
    page.drawRectangle({
      x: MARGIN.l,
      y: y - h + 12,
      width: 4,
      height: h,
      color: kind === "red" ? C.red : C.navy,
    });
    let cy = y - 4;
    for (const line of titleLines) {
      page.drawText(line, { x: MARGIN.l + 14, y: cy, size: 9, font: bold, color: C.navy });
      cy -= 12;
    }
    for (const line of bodyLines) {
      page.drawText(line, { x: MARGIN.l + 14, y: cy, size, font, color: C.ink });
      cy -= 11.5;
    }
    y -= h + 6;
  }

  function table(headers, rows, colWeights) {
    const colW = colWeights.map((w) => contentW * w);
    const size = 7.5;
    const pad = 5;

    function rowHeight(cells, useBold) {
      let max = 16;
      cells.forEach((cell, i) => {
        const lines = wrap(useBold ? bold : font, String(cell), size, colW[i] - pad * 2);
        max = Math.max(max, 7 + lines.length * 10);
      });
      return max;
    }

    const headerH = rowHeight(headers, true);
    ensure(headerH + 8);
    let x = MARGIN.l;
    page.drawRectangle({
      x: MARGIN.l,
      y: y - headerH + 10,
      width: contentW,
      height: headerH,
      color: C.navy,
    });
    headers.forEach((h, i) => {
      const lines = wrap(bold, h, size, colW[i] - pad * 2);
      let cy = y - 2;
      for (const line of lines) {
        page.drawText(line, { x: x + pad, y: cy, size, font: bold, color: C.white });
        cy -= 10;
      }
      x += colW[i];
    });
    y -= headerH;

    rows.forEach((cells, ri) => {
      const h = rowHeight(cells, false);
      ensure(h);
      if (ri % 2 === 0) {
        page.drawRectangle({
          x: MARGIN.l,
          y: y - h + 10,
          width: contentW,
          height: h,
          color: C.wash,
        });
      }
      let cx = MARGIN.l;
      cells.forEach((cell, i) => {
        const lines = wrap(font, String(cell), size, colW[i] - pad * 2);
        let cy = y - 2;
        for (const line of lines) {
          page.drawText(line, { x: cx + pad, y: cy, size, font, color: C.ink });
          cy -= 10;
        }
        cx += colW[i];
      });
      y -= h;
    });
    page.drawRectangle({
      x: MARGIN.l,
      y: y + 10,
      width: contentW,
      height: 0.6,
      color: C.line,
    });
    y -= 8;
  }

  // Cover
  page = doc.addPage([PAGE.w, PAGE.h]);
  pages.push(page);
  page.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: PAGE.h, color: C.navy });
  page.drawRectangle({ x: 0, y: PAGE.h - 8, width: PAGE.w, height: 8, color: C.red });
  page.drawText("WILLSONE  /  WILLS FARMS", {
    x: MARGIN.l,
    y: PAGE.h - 88,
    size: 9,
    font: bold,
    color: C.red,
  });
  page.drawText("Vendor stack specs", {
    x: MARGIN.l,
    y: PAGE.h - 128,
    size: 26,
    font: bold,
    color: C.white,
  });
  page.drawText("A decision brief, not a price list", {
    x: MARGIN.l,
    y: PAGE.h - 156,
    size: 14,
    font,
    color: rgb(0.82, 0.85, 0.9),
  });
  page.drawRectangle({ x: MARGIN.l, y: PAGE.h - 174, width: 72, height: 3, color: C.red });

  const cover = [
    "Read this the way you read a phone spec sheet: what the product was",
    "built to do, what it is good at, where it breaks, how it fails when",
    "you hit the ceiling, and what you would compare it to.",
    "",
    "Covers every paid (or soon-to-be-paid) platform this Next.js app",
    "already talks to: Vercel, Cloudinary, Supabase, Resend, Anthropic,",
    "and Zoom. Figures are from vendor docs as of September 2026 and",
    "will move. Treat the live pricing page as the invoice; treat this",
    "as the reason you would (or would not) stay.",
  ];
  let cy = PAGE.h - 220;
  for (const line of cover) {
    page.drawText(line, { x: MARGIN.l, y: cy, size: 11, font, color: rgb(0.82, 0.85, 0.9) });
    cy -= 16;
  }

  page.drawText("Contents", { x: MARGIN.l, y: 300, size: 10, font: bold, color: C.white });
  const toc = [
    "1.  How this app is wired today",
    "2.  Vercel  -  run the Next.js app",
    "3.  Cloudinary  -  hold and serve files",
    "4.  Supabase  -  database + login",
    "5.  Resend  -  send transactional email",
    "6.  Anthropic  -  the AI that reads CVs and drafts letters",
    "7.  Zoom  -  create interview meetings",
    "8.  Exhaustion behaviour side by side",
    "9.  What this means for Wills Farms",
  ];
  cy = 278;
  for (const line of toc) {
    page.drawText(line, { x: MARGIN.l, y: cy, size: 10, font, color: rgb(0.82, 0.85, 0.9) });
    cy -= 16;
  }
  page.drawText("Sources: vercel.com, cloudinary.com, supabase.com, resend.com, docs.anthropic.com  |  Sep 2026", {
    x: MARGIN.l,
    y: 52,
    size: 8,
    font,
    color: rgb(0.62, 0.67, 0.74),
  });

  addPage();

  h1("1.  How this app is wired today");
  para(
    "WillsOne is a Next.js 16 app. It does not host itself. Each vendor below is a specialist: one runs the code, one stores files, one stores records and sessions, one delivers email, one runs language models, one creates video meetings. They are not interchangeable. Swapping any of them is a project, not a setting.",
  );
  table(
    ["Vendor", "Job it was built for", "What WillsOne actually uses it for"],
    [
      [
        "Vercel",
        "Host and scale Next.js (builds, CDN, serverless functions, cron)",
        "Production deploy, API routes, 4 cron jobs (appraisal reminders, task daily, hourly rollover, careers digest)",
      ],
      [
        "Cloudinary",
        "Upload, transform, and CDN-deliver images/video/raw files",
        "CVs, JDs, passports, medical reports, policies, leave attachments, task-manager documents",
      ],
      [
        "Supabase",
        "Postgres + Auth + Storage as a managed backend",
        "Every table (users, postings, appraisals, leave...), login, invite links. App uses the service-role key from the server, not Postgres RLS as the main gate.",
      ],
      [
        "Resend",
        "Transactional email API (deliverability, not a marketing suite)",
        "Invites, application confirmations, interview mail, appraisal reminders, task reminders, monthly reports",
      ],
      [
        "Anthropic API",
        "Pay-per-token language models (Claude)",
        "CV extract, AI screening, passport check, offer-letter draft, interview analysis, skill-log / appraisal template extract, task extract. Model default: claude-sonnet-4-5",
      ],
      [
        "Zoom",
        "Video meetings at work scale",
        "Server-to-Server OAuth creates a real meeting URL from the interview panel so HR does not paste a link by hand",
      ],
    ],
    [0.18, 0.36, 0.46],
  );
  callout(
    "Not on this list (and why)",
    "Next.js, React, pdf-lib, mammoth, TanStack Query are libraries, not bills. GitHub is source control; a private repo has its own seat cost if you outgrow free. There is no Stripe, Sentry, or Redis in package.json today. Claude.ai Pro (the chat product) is a different product from the Anthropic API key this app uses.",
  );

  h1("2.  Vercel  -  run the Next.js app");
  para(
    "Vercel is the company that made Next.js. The product is a hosting platform that compiles your repo, puts static assets on a global CDN, and runs server code as Functions. It was built so a Next.js app can go from git push to a live URL without you renting a Linux box, wiring nginx, or managing TLS. Compare it to Railway, Render, AWS Amplify, Cloudflare Pages/Workers, or a raw VPS (DigitalOcean, Hetzner) plus your own CI.",
  );

  h2("What it is good at (the job it was built for)");
  bullet("Zero-ops Next.js: preview URLs per branch, atomic production deploys, rollback.");
  bullet("Edge CDN in front of the app. Ghana users still hit a nearby POP for static assets.");
  bullet("Serverless Functions match this codebase: almost all business logic is Route Handlers under src/app/api.");
  bullet("Cron is first-class (vercel.json). This app already schedules four jobs. On a VPS you would run cron yourself and keep the process alive.");
  bullet("DDoS mitigation and a WAF are on by default. You are not the person patching the edge.");

  h2("What it is weak at");
  bullet("Long-running or always-on work. Functions sleep between requests. A 20MB CV sent to Claude still has to finish inside the function duration cap. A VPS does not have that cap.");
  bullet("Price is usage-shaped, not flat. A traffic spike or a chatty cron does not fail closed on Pro; it bills. Hobby fails closed (pauses).");
  bullet("Vendor lock for the platform layer (not the code). Next.js still runs elsewhere; Vercel-only pieces are Cron syntax, Fluid Compute billing, and some image/analytics add-ons.");
  bullet("Hobby is licensed for personal, non-commercial use. A company HR system is commercial. Hobby is not a legal production home for Wills Farms.");
  bullet("Cold start and region: default US/EU. Fine for Accra office hours; not the same as a Ghana VPS 8ms away from the office.");

  h2("Spec sheet");
  table(
    ["Spec", "Hobby (free)", "Pro"],
    [
      ["Platform fee", "$0. Personal / non-commercial only.", "$20 / month platform + $20 / deploying seat. $20 usage credit included."],
      ["When you hit the included usage", "Feature pauses until the window rolls (often 30 days). Site can stall.", "Does NOT shut off. Credit burns, then on-demand billing. Emails at 75% of credit."],
      ["Kill switch", "Automatic pause.", "Spend Management: you can notify or pause production at a dollar cap you set. If you do not set it, the bill grows."],
      ["Function duration", "Up to 300s. Enough for many routes; tight for big Claude + PDF jobs.", "Default 300s, configurable toward 800s (extended beta higher). Safer for CV extract / screening."],
      ["Cron", "Limited (not enough for this repo's 4 jobs as a commercial app).", "Cron included. This app needs it: appraisal 06:00, tasks 09:00, hourly rollover 17:00 weekdays, careers digest 08:00."],
      ["Bandwidth / edge", "Small included bucket, then pause.", "1 TB Fast Data Transfer + 10M edge requests, then on-demand (~$0.15/GB transfer, $2/1M extra edge requests)."],
      ["Compute billing", "4 CPU-hrs + 360 GB-hrs memory + 1M invocations included.", "Fluid Compute: Active CPU from ~$0.128/hr, memory ~$0.0106/GB-hr, invocations ~$0.60/million. Credit offsets this first."],
      ["Logs / collab", "1 hour runtime logs. No team seats.", "1 day logs. Team, RBAC, email support."],
      ["Security extras", "DDoS on. WAF: 3 IP blocks, 3 custom rules.", "DDoS on. WAF: 100 IP blocks, 40 rules. SAML SSO is an add-on. Deployment Protection add-on is expensive ($150/mo)."],
    ],
    [0.22, 0.39, 0.39],
  );

  h2("Security");
  para(
    "Vercel holds the running app and env vars (SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY). That is the crown-jewel store. Preview deployments can leak if a secret is NEXT_PUBLIC_ (Cloudinary cloud name/preset already are, by design). Production protection on Hobby is weak; Pro can password-protect previews. SOC2 is a Vercel org fact; your data classification (employee medical files) is still your problem - Vercel sees request metadata, not a substitute for how you store files.",
  );

  h2("Compare to others");
  table(
    ["Alternative", "When it wins", "When Vercel still wins"],
    [
      ["Render / Railway / Fly", "Flatter monthly VM price, long-running processes, simpler mental model.", "Worse Next.js preview story. You own more of SSL, scaling, cron reliability."],
      ["AWS Amplify / App Runner", "Already in AWS, data residency, enterprise procurement.", "Heavier. This repo is not written as ECS services."],
      ["Cloudflare Pages + Workers", "Cheap edge, great CDN, Workers CPU model.", "Node/Next API surface and 300s jobs are a poorer fit than Vercel Functions."],
      ["VPS (Hetzner / DO)", "Cheapest at steady load. No function timeout. Full control.", "You become the SRE: deploys, backups of the box, uptime, Ghana power/network is not the VPS's problem but ops is yours."],
    ],
    [0.22, 0.39, 0.39],
  );
  callout(
    "Pro exhaustion in one sentence",
    "Pro does not stop the website when the $20 credit is gone. It invoices. If you want it to stop, you must turn on Spend Management. Hobby stops you. That is the whole difference that matters for a finance conversation.",
    "red",
  );

  h1("3.  Cloudinary  -  hold and serve files");
  para(
    "Cloudinary is a media platform: upload API, on-the-fly transforms (resize, format), and a CDN in front of the bytes. It was built for sites that show a lot of images and video without running ImageMagick and S3+CloudFront themselves. Compare it to AWS S3 + CloudFront, Uploadcare, ImageKit, Cloudflare Images/R2, or Supabase Storage (which you already pay for in another product).",
  );

  h2("What WillsOne uses it for");
  para(
    "Not marketing photos. HR source documents: CVs, job descriptions, passport bios, medical reports, policy PDFs, leave attachments, task-manager manuals. Uploads go through a shared unsigned upload preset (NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET). The browser talks to Cloudinary directly. That is convenient and also a security shape: anyone who can load the app can hit that preset unless you lock it down (signed uploads, folder ACLs, allowlists).",
  );

  h2("What it is good at");
  bullet("CDN delivery worldwide without you managing a bucket + CDN pair.");
  bullet("Transform-once, cache-forever: a resized derivative is billed once, then bandwidth only.");
  bullet("Raw files (PDFs, DOCX) as well as images - this app uses resource type raw a lot.");
  bullet("Unsigned widget/API is fast to ship. The code already has one cloud name and one preset.");

  h2("What it is weak at (for this product)");
  bullet("It is not a records database and not an access-control system for 'only this employee's manager'. URLs that leak, leak. Signed URLs / token auth start at Advanced, not Free.");
  bullet("Default storage is US. Employee medical and passport files sitting in US S3/GCS is a data-residency question (Ghana Data Protection Act, GDPR if EU applicants). Enterprise can pin regions.");
  bullet("Unsigned presets are a common incident class (unrelated sites pumping files into your cloud). Plus adds allowlist/blocklist; Free does not.");
  bullet("Credits mix storage + bandwidth + transforms. A quiet month of stored CVs still burns storage credits even if nobody downloads.");
  bullet("Not the cheapest archive. Cold HR files would be cheaper on S3 Glacier or even Supabase Storage if you do not need transforms.");

  h2("Spec sheet");
  table(
    ["Spec", "Free", "Plus / Advanced (typical paid)"],
    [
      ["Price", "$0. 25 credits / month. 3 users, 1 environment.", "Plus ~$99/mo (225 credits). Advanced ~$249/mo (600). Advanced Extra ~$549 (1,350). Pro PAYG ~$1,099 (2,750) + $0.45 per extra credit."],
      ["1 credit equals", "1,000 transforms OR 1 GB storage OR 1 GB image bandwidth (video 1 GB/credit on Free).", "Same, except paid plans count 2 GB video bandwidth per credit."],
      ["Max raw / image upload", "10 MB image/raw, 100 MB video.", "Plus: 20 MB image/raw, 2 GB video. Advanced: 40 MB / 4 GB. CVs and medical PDFs often exceed 10 MB - Free can reject real applications."],
      ["When you exceed credits", "Soft limit: warnings first. If you ignore them, account is DISABLED. Uploads stop; delivery may stop. After 30 days disabled, assets are permanently deleted.", "Fixed plans: same disable path if you do not upgrade. Pro PAYG: keep serving, bill overage at $0.45/credit. That is the only self-serve tier that behaves like 'don't turn off HR files'."],
      ["Security extras", "HTTPS delivery. No custom CNAME, no token auth, no S3 backup of your own.", "Plus: backup to your S3, role-based admin, asset allow/block lists. Advanced: custom domain, token/cookie auth. SSO / multi-CDN / SLA: Enterprise."],
    ],
    [0.22, 0.39, 0.39],
  );
  callout(
    "Worst case for Wills Farms",
    "If Cloudinary disables the account and 30 days pass, CVs, medical reports, and policy PDFs in that cloud are gone. Supabase still has the application rows; the files do not come back. Pro PAYG or an S3 backup is the insurance. Free is a demo, not an archive.",
    "red",
  );

  h1("4.  Supabase  -  database + login");
  para(
    "Supabase is a managed Postgres with Auth, Storage, Realtime, and a dashboard. It was built as an open-source Firebase alternative for teams that want SQL, not a proprietary document store. Compare it to Firebase, PlanetScale, Neon, RDS + Cognito, or self-hosted Postgres + GoTrue. This app's source of truth is Postgres tables (users, job_postings, appraisals, leave, org catalogs). Auth is Supabase Auth (invite links, sessions). File blobs are mostly Cloudinary, not Supabase Storage.",
  );

  h2("Best thing about it (for this codebase)");
  bullet("Real Postgres: foreign keys, joins (users.grade_level_id -> grade_levels), RPC for dynamic org-map DDL. Firebase cannot do this without pain.");
  bullet("Auth and DB in one vendor. Invite-to-WillsOne is generateLink + insert into public.users. That glue is why the hire pipeline is short.");
  bullet("Unlimited API requests even on Free. You are not billed per row read the way some BaaS products are.");
  bullet("You can self-host later. The format is Postgres, not a locked document API. Leaving is a migration, not a rewrite of every query.");
  bullet("Row Level Security exists if you want it. This app currently enforces access in Next.js with the service-role key (bypasses RLS). That is a product choice, not a Supabase limitation.");

  h2("Worst thing about it");
  bullet("Free projects PAUSE after one week of inactivity. A quiet HR tool over Christmas looks 'down'. Pro never pauses.");
  bullet("Free DB is 500 MB on shared tiny compute. Org catalogs + applications + appraisals + JSON form blobs will grow past that. Pause + tiny disk is why Free is not production.");
  bullet("Service-role key is a master key. It lives on Vercel. If it leaks, the attacker is the database. RLS would not save you on routes that already use service role.");
  bullet("Auth emails use Supabase's mail by default (branding, rate limits). This app already sends many mails via Resend; mixing two mail paths is an ops footgun.");
  bullet("SOC2 / ISO / HIPAA are Team ($599/mo) and up, not Pro. If a customer or auditor asks for a SOC2 report on the database vendor, Pro is not enough.");
  bullet("Compute is a second bill. Pro is $25 + a Micro instance (credits cover one Micro). A second project (staging) is another compute line.");

  h2("Spec sheet");
  table(
    ["Spec", "Free", "Pro ($25/mo org)"],
    [
      ["Pause", "After 7 days idle. 2 active projects max.", "Never pauses."],
      ["Database", "500 MB, shared CPU, 500 MB RAM.", "8 GB disk included, then $0.125/GB. Dedicated compute sizes from Micro ($10, 1 GB RAM, 60 direct connections) upward."],
      ["Auth MAUs", "50,000 included.", "100,000 then $0.00325/MAU. Fine for a company HRIS."],
      ["Egress", "5 GB.", "250 GB then $0.09/GB."],
      ["Backups", "None that you can rely on.", "Daily, 7-day retention. PITR is +$100/mo per 7 days. This is the difference between 'oops drop table' being recoverable or not."],
      ["File storage", "1 GB, 50 MB max upload.", "100 GB, 500 GB max upload. (WillsOne mostly uses Cloudinary instead.)"],
      ["When you exceed", "Hard limits / pause. Spend cap N/A.", "Spend caps ON by default. Extra usage is BLOCKED until you turn the cap off or raise it. Opposite of Vercel Pro: Supabase Pro will stop you; Vercel Pro will bill you."],
      ["Compliance", "Community support. 1 day logs.", "Email support, 7-day logs, leaked-password protection. SOC2/ISO: Team plan."],
    ],
    [0.2, 0.38, 0.42],
  );

  h2("Security (this app, not the brochure)");
  para(
    "Two keys: anon (public, in the browser) and service role (server). Browser login uses anon. Almost every API route uses service role and then checks the caller in TypeScript (requireSystemDefinitionsAccess, etc.). That means: (1) a missed check in a route is a full table read; (2) you must treat Vercel env as production-secret; (3) enabling RLS later is still worth it as defense in depth for tables that should never be world-readable. Auth sessions are JWTs. Invite links are capability URLs - they are secrets in email. MFA exists on Supabase Auth; whether WillsOne forces it is a product setting, not automatic.",
  );

  h2("Compare to others");
  table(
    ["Alternative", "When it wins", "Cost of switching this repo"],
    [
      ["Firebase", "Realtime client apps, Google SSO procurement.", "Rewrite. No Postgres, no current FK model."],
      ["Neon / RDS Postgres + separate Auth (Clerk, Auth.js)", "Cheaper dedicated Postgres, or AWS already mandated.", "Auth + invite + users table coupling is the expensive part. Data can dump/restore."],
      ["Self-host Supabase", "Data stays in-country, no pause, no MAU bill.", "You own upgrades, backups, and Auth email. Needs a competent operator."],
    ],
    [0.28, 0.32, 0.4],
  );

  h1("5.  Resend  -  send transactional email");
  para(
    "Resend is an email API for mail that must arrive: password invites, 'your application was received', 'your appraisal is due'. It was built for developers who do not want to run Postfix or fight Gmail's spam folder. It is not Mailchimp. Compare it to SendGrid, Postmark, Amazon SES, Mailgun.",
  );

  h2("What it is good at");
  bullet("Deliverability tooling: SPF/DKIM/DMARC, bounce handling, simple API. This app already has one sendViaResend helper.");
  bullet("SOC2 Type II, GDPR, MFA, API key permissions on all plans - unusual for the free tier of a mail vendor.");
  bullet("React Email / HTML you control. Appraisal and offer mail are not locked to a drag-and-drop template vendor.");

  h2("What it is weak at");
  bullet("Free is 100 emails per day and 3,000 per month, no overage. The 101st email that day just fails. A recruitment burst (30 applicants x confirm + HR notify) plus appraisal reminders can hit 100 before noon.");
  bullet("Until you verify a domain, mail comes from onboarding@resend.dev (this repo's fallback). Gmail treats that as noisy. Recipients cannot reply to a real Wills Farms address unless CAREERS_REPLY_TO_EMAIL / RESEND_FROM_EMAIL are set.");
  bullet("Not for newsletters. Careers daily digest is still transactional-shaped; a farm-wide newsletter would want a different product.");
  bullet("Reputation is shared on free/shared IPs. One bad list (accidental blast) hurts everyone on the pool. Dedicated IPs start on Scale, and only after ~3,000/day.");

  h2("Spec sheet");
  table(
    ["Spec", "Free", "Pro"],
    [
      ["Price / volume", "$0. 100/day, 3,000/month. Hard stop.", "$20/mo for 50,000. $35/mo for 100,000. Overage $0.90 / 1,000. No daily cap."],
      ["When exhausted", "API returns an error. Invites, reminders, and confirmations silently do not send unless the code checks the result (some paths log and continue).", "Keeps sending; overage on the invoice. Scale plans if you live above 100k."],
      ["Domains", "3.", "10 (add-on +$20 for 100 more)."],
      ["Security", "SOC2, GDPR, DKIM/SPF/DMARC, MFA.", "Same, plus more webhooks / AI credits. SSO is Scale add-on ($150)."],
    ],
    [0.22, 0.39, 0.39],
  );
  para(
    "Postmark is often praised for the highest transactional inbox placement; SES is cheapest at volume but you do the reputation work; SendGrid is a supermarket (marketing + transactional) with a messier DX. Resend is the fit because this codebase already standardised on it and the volume of a single company HRIS is Pro-sized, not SES-million sized.",
  );

  h1("6.  Anthropic API  -  the AI in the product");
  para(
    "This is not a Claude.ai $20/month chat subscription. The app holds ANTHROPIC_API_KEY and calls claude-sonnet-4-5 (overridable via TASK_MANAGER_AI_MODEL). Anthropic's API was built to put a language model behind your own product: you send text/files, you get text back, you pay per token. Compare to OpenAI (GPT), Google Gemini, Amazon Bedrock, Azure OpenAI, or a local Llama.",
  );

  h2("Where it runs in WillsOne");
  para(
    "CV text extract, AI screening (including age cutoff vs the posting), passport bio check, medical-report check, offer-letter draft, interview stage analyses, role-report generate, job-posting JD extract, skill-log and appraisal template extract, task-manager document extract, monthly report summary. If the API is down or over quota, those buttons fail. Core HR (leave, roster, login) does not.",
  );

  h2("What it is good at");
  bullet("Strong at long documents and instructions - the exact shape of a JD, a CV, and an offer letter.");
  bullet("Tool/function calling (screening writes a structured score). The code already depends on that.");
  bullet("Commercial API: Anthropic's standard terms do not train on your API traffic by default. That matters for CVs and medical text. (Confirm on the current data-processing addendum before an audit.)");
  bullet("You can swap the model string without rewriting the app. Haiku is cheaper for extract; Opus is overkill and expensive.");

  h2("What it is weak at");
  bullet("It is a meter, not a plan with a safety net. There is no 'Free tier that runs production screening'. You buy credits or pay a bill. Rate limits start low on new orgs and rise with spend history (usage tiers). A new key can 429 during a hiring week.");
  bullet("When you hit the spend cap or rate limit, requests fail with 429/400. The UI shows an error. Applicants are not auto-screened. There is no queue in this repo.");
  bullet("Tokens on CVs + PDFs are fat. A 20-page scanned medical PDF converted to text, plus the prompt, can cost more than you expect. Sonnet 4.5: about $3 per million input tokens and $15 per million output tokens.");
  bullet("Function timeout on Vercel plus a slow model is a double ceiling. You can be billed for a call that the user saw as a timeout.");
  bullet("It will invent. Screening and offer drafts still need a human. The product already treats some of this as assistive.");
  bullet("Sending employee health and passport text to a US/EU model provider is a privacy disclosure. You need a lawful basis and a vendor DPA, not just an API key.");

  h2("Spec sheet (API, Sonnet 4.5 - what this repo defaults to)");
  table(
    ["Spec", "Value"],
    [
      ["Billing model", "Pay as you go (or prepaid credits). No Hobby equivalent that covers production."],
      ["Sonnet 4.5", "$3 / million input tokens, $15 / million output. Prompt cache hits cheaper ($0.30 / MTok)."],
      ["Haiku 4.5 (if you switch extract jobs)", "$1 / MTok in, $5 / MTok out. Same features, weaker reasoning."],
      ["When money or TPM runs out", "HTTP 429 / credit errors. Features stop. They do not degrade. Raise the spend limit or wait for the rate-limit window."],
      ["Data residency", "API is global by default. US-locked inference is a premium (~1.1x) on some products. Not Ghana-local."],
      ["Security", "TLS, key in env. You must not log prompts that contain medical/passport data. Rotate keys if a Vercel log dump ever captured one."],
    ],
    [0.28, 0.72],
  );
  para(
    "OpenAI is the usual alternative (similar price band, larger ecosystem). Gemini is cheaper on long context. Bedrock helps if AWS procurement is mandatory. None of them change the privacy fact: CVs leave your VPC.",
  );

  h1("7.  Zoom  -  create interview meetings");
  para(
    "Zoom is a meeting product. The app does not host video. It uses Server-to-Server OAuth (ZOOM_ACCOUNT_ID / CLIENT_ID / SECRET) to create a scheduled meeting and drop the join URL into interview setup. Compare to Google Meet (free with Workspace), Microsoft Teams, Whereby, or 'HR pastes a link'.",
  );
  table(
    ["Spec", "What to know"],
    [
      ["Built for", "Reliable group video with calendaring, not a WebRTC library you maintain."],
      ["Free (Basic)", "Meetings work. ~40-minute cap on multi-party. Fine for a short screen; bad for a panel."],
      ["Paid Workplace", "Per-host subscription. Removes the 40-minute cap, cloud recording, SSO on higher SKUs."],
      ["When you exhaust", "API returns errors (invalid host, meeting limits). Interviews still exist in WillsOne; they just have no join URL."],
      ["Security", "Waiting room is currently off in code (join_before_host true). That is a product choice: easier for candidates, weaker against zoom-bombing. Tokens are account-level - protect the three env vars like service role."],
      ["Why not Meet/Teams", "Meet is cheaper if everyone is already on Google Workspace. Zoom wins if the farm already standardised on Zoom and hosts exist as Zoom users (the API needs a real host email on the account)."],
    ],
    [0.22, 0.78],
  );

  h1("8.  Exhaustion behaviour side by side");
  para(
    "This is the comparison that actually affects a live HR week. Price is how you budget. Exhaustion is how you fail.",
  );
  table(
    ["Vendor", "Hobby / Free when full", "Paid when full", "Does the HRIS keep working?"],
    [
      ["Vercel", "Pauses. Deploys / functions can freeze until the window resets.", "Keeps running. Bills you. Optional spend pause.", "Pro: yes, unless you set a pause cap."],
      ["Cloudinary", "Warn, then disable. Then delete after 30 days.", "Same on fixed plans. Pro PAYG bills extra credits.", "Free/Plus over-quota: file uploads die. Worst vendor to ignore."],
      ["Supabase", "Pause after idle; tiny disk errors.", "Spend cap ON: new usage blocked. Cap off: bill grows.", "Cap on = safer bill, possible write failures."],
      ["Resend", "Hard fail at 100/day. No overage.", "Sends continue; overage $0.90/1k.", "Free: invites fail. Pro: mail keeps going."],
      ["Anthropic", "N/A for this app (no real free prod).", "429 / no credits. Calls fail immediately.", "Core app yes. Screening / extract / AI letters no."],
      ["Zoom", "40-min meeting cap, API errors.", "API errors on account limits.", "Panel proceeds; video link missing."],
    ],
    [0.16, 0.28, 0.28, 0.28],
  );

  h1("9.  What this means for Wills Farms");
  para(
    "Hobby stacks are for building. A company that stores passports, medical reports, and salaries needs the paid row of each vendor that can delete or pause production data.",
  );
  bullet("Vercel Pro is the correct hosting SKU: commercial use, four crons, function time for Claude, spend alerts. Set Spend Management so a loop cannot print a four-figure invoice.");
  bullet("Supabase Pro is the correct database SKU: no pause, backups, disk headroom. Leave the spend cap on until you know egress. Turn on PITR when the database holds irreplaceable hire history.");
  bullet("Cloudinary Free will eventually reject a 12 MB CV or disable the cloud. Plus is the minimum; Pro PAYG if you would rather be billed than go dark. Signed uploads and a private folder for medical/passport are security work still to do.");
  bullet("Resend Pro is cheap insurance versus a skipped appraisal reminder. Verify willsfarms.com (or the real sending domain) so you leave onboarding@resend.dev.");
  bullet("Anthropic is a variable cost tied to hiring volume. Cap the Console spend. Consider Haiku for extract-only routes if the bill hurts. Do not send more medical text than the feature needs.");
  bullet("Zoom paid hosts only for people who run panels longer than 40 minutes.");
  callout(
    "If you compare this stack to 'just use AWS'",
    "You can. You would buy EC2/ECS + RDS + S3 + SES + Bedrock + Chime and hire someone to operate it. The value of the current set is speed and a small ops footprint for a Next.js HRIS. The cost is several vendors, several bills, and several ways to fail independently. That is a valid trade for a farm software team. It is a bad trade only if nobody watches the dashboards.",
  );
  para(
    "Re-check live pricing before you sign anything. This PDF is a spec sheet for a decision, dated September 2026.",
  );

  const total = doc.getPageCount();
  for (let i = 1; i < total; i++) {
    const p = pages[i];
    p.drawRectangle({ x: 0, y: 0, width: PAGE.w, height: 32, color: C.wash });
    p.drawText("WillsOne  |  Vendor stack specs  |  figures from vendor docs, Sep 2026", {
      x: MARGIN.l,
      y: 14,
      size: 7.5,
      font,
      color: C.muted,
    });
    const label = `${i} / ${total - 1}`;
    p.drawText(label, {
      x: PAGE.w - MARGIN.r - font.widthOfTextAtSize(label, 7.5),
      y: 14,
      size: 7.5,
      font,
      color: C.muted,
    });
  }

  const bytes = await doc.save();
  mkdirSync(__dirname, { recursive: true });
  writeFileSync(OUT, bytes);
  console.log(`Wrote ${OUT} (${bytes.length} bytes, ${total} pages)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
