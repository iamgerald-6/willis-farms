/**
 * One-off generator: WillsOne org structure → mapping → job posting → user.
 * Run: node docs/organizational-structure/generate-org-posting-user-pdf.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "WillsOne-Org-Structure-Job-Posting-User.pdf");

const PAGE = { w: 612, h: 792 }; // US Letter
const MARGIN = { l: 48, r: 48, t: 56, b: 48 };

const C = {
  navy: rgb(0.106, 0.165, 0.29),
  red: rgb(0.722, 0.118, 0.227),
  ink: rgb(0.122, 0.161, 0.216),
  muted: rgb(0.4, 0.447, 0.51),
  line: rgb(0.863, 0.882, 0.906),
  wash: rgb(0.965, 0.969, 0.976),
  white: rgb(1, 1, 1),
  cardNavy: rgb(0.106, 0.165, 0.29),
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
    .replace(/·/g, "|");
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
  const mono = await doc.embedFont(StandardFonts.Courier);

  doc.setTitle("WillsOne — Org structure, mapping, job posting, and the user");
  doc.setAuthor("WillsOne engineering");
  doc.setSubject("How catalogs, mapping, job postings, and hired users connect");
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
    page.drawText(ascii("WillsOne  |  Organizational structure"), {
      x: MARGIN.l,
      y: PAGE.h - 19,
      size: 8,
      font: bold,
      color: C.white,
    });
    page.drawText("From catalogs to hired employee", {
      x: PAGE.w - MARGIN.r - bold.widthOfTextAtSize("From catalogs to hired employee", 8),
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
    page.drawText(ascii(text), { x: MARGIN.l + 12, y, size: 14, font: bold, color: C.navy });
    y -= 22;
  }

  function h2(text) {
    ensure(28);
    y -= 4;
    page.drawText(ascii(text), { x: MARGIN.l, y, size: 11, font: bold, color: C.navy });
    y -= 16;
  }

  function para(text, size = 9.5, leading = 13) {
    const lines = wrap(font, text, size, contentW);
    for (const line of lines) {
      ensure(leading);
      page.drawText(line, { x: MARGIN.l, y, size, font, color: C.ink });
      y -= leading;
    }
    y -= 4;
  }

  function bullet(text) {
    const lines = wrap(font, text, 9.5, contentW - 14);
    for (let i = 0; i < lines.length; i++) {
      ensure(13);
      if (i === 0) {
        page.drawCircle({ x: MARGIN.l + 4, y: y + 3, size: 1.6, color: C.red });
      }
      page.drawText(lines[i], { x: MARGIN.l + 14, y, size: 9.5, font, color: C.ink });
      y -= 13;
    }
    y -= 2;
  }

  function callout(title, body, kind = "navy") {
    const size = 9;
    const titleLines = wrap(bold, title, 9, contentW - 24);
    const bodyLines = wrap(font, body, size, contentW - 24);
    const h = 18 + titleLines.length * 12 + bodyLines.length * 12 + 10;
    ensure(h);
    const bg = kind === "red" ? C.paleRed : C.wash;
    page.drawRectangle({
      x: MARGIN.l,
      y: y - h + 12,
      width: contentW,
      height: h,
      color: bg,
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
      cy -= 12;
    }
    y -= h + 6;
  }

  function table(headers, rows, colWeights) {
    const colW = colWeights.map((w) => contentW * w);
    const size = 8;
    const pad = 6;

    function rowHeight(cells, useBold) {
      let max = 18;
      cells.forEach((cell, i) => {
        const lines = wrap(useBold ? bold : font, String(cell), size, colW[i] - pad * 2);
        max = Math.max(max, 8 + lines.length * 11);
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
        cy -= 11;
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
          cy -= 11;
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
    y -= 10;
  }

  function flowBoxes(items) {
    const boxH = 22;
    const gap = 10;
    const arrowH = 10;
    const total = items.length * boxH + (items.length - 1) * (gap + arrowH);
    ensure(total + 8);
    items.forEach((item, i) => {
      page.drawRectangle({
        x: MARGIN.l,
        y: y - boxH + 8,
        width: contentW,
        height: boxH,
        color: i === items.length - 1 ? C.navy : C.wash,
      });
      const color = i === items.length - 1 ? C.white : C.ink;
      const f = i === 0 || i === items.length - 1 ? bold : font;
      page.drawText(ascii(item), {
        x: MARGIN.l + 12,
        y: y - 6,
        size: 9,
        font: f,
        color,
      });
      y -= boxH;
      if (i < items.length - 1) {
        const midX = MARGIN.l + contentW / 2;
        page.drawLine({
          start: { x: midX, y: y + 8 },
          end: { x: midX, y: y + 8 - arrowH },
          thickness: 1,
          color: C.red,
        });
        page.drawLine({
          start: { x: midX - 3.5, y: y + 8 - arrowH + 4 },
          end: { x: midX, y: y + 8 - arrowH },
          thickness: 1,
          color: C.red,
        });
        page.drawLine({
          start: { x: midX + 3.5, y: y + 8 - arrowH + 4 },
          end: { x: midX, y: y + 8 - arrowH },
          thickness: 1,
          color: C.red,
        });
        y -= gap + arrowH - 6;
      }
    });
    y -= 12;
  }

  function codeLine(text) {
    const lines = wrap(mono, text, 8, contentW - 16);
    const h = 10 + lines.length * 11;
    ensure(h);
    page.drawRectangle({
      x: MARGIN.l,
      y: y - h + 12,
      width: contentW,
      height: h,
      color: C.wash,
    });
    let cy = y - 2;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN.l + 8, y: cy, size: 8, font: mono, color: C.ink });
      cy -= 11;
    }
    y -= h + 4;
  }

  // ── Cover ──────────────────────────────────────────────────────────────
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
  page.drawText("Org structure, mapping,", {
    x: MARGIN.l,
    y: PAGE.h - 130,
    size: 26,
    font: bold,
    color: C.white,
  });
  page.drawText("job posting, and the user", {
    x: MARGIN.l,
    y: PAGE.h - 162,
    size: 26,
    font: bold,
    color: C.white,
  });
  page.drawRectangle({ x: MARGIN.l, y: PAGE.h - 180, width: 72, height: 3, color: C.red });

  const coverBlurb = [
    "This document describes how the live WillsOne code stores company",
    "catalogs, how those catalogs are mapped into allowed combinations,",
    "how a job posting is created from that tree, and how a hired person",
    "becomes a users row with the same placement.",
    "",
    "Source of truth: the application code and SQL in this repo — not a",
    "separate design spec. If the product and this PDF disagree, the code wins.",
  ];
  let cy = PAGE.h - 230;
  for (const line of coverBlurb) {
    page.drawText(line, { x: MARGIN.l, y: cy, size: 11, font, color: rgb(0.82, 0.85, 0.9) });
    cy -= 16;
  }

  page.drawText("Contents", { x: MARGIN.l, y: 280, size: 10, font: bold, color: C.white });
  const toc = [
    "1.  The one chain that matters",
    "2.  Catalogs — Organizational Structure lists",
    "3.  Mapping — which combinations are valid",
    "4.  Create job posting",
    "5.  Apply, onboard, invite — posting becomes a user",
    "6.  What lives on the employee after hire",
    "7.  Downstream: appraisal and skill log templates",
    "8.  Facts that must not be mixed",
  ];
  cy = 258;
  for (const line of toc) {
    page.drawText(line, { x: MARGIN.l, y: cy, size: 10, font, color: rgb(0.82, 0.85, 0.9) });
    cy -= 16;
  }
  page.drawText("As implemented in the WillsOne codebase  |  September 2026", {
    x: MARGIN.l,
    y: 52,
    size: 8,
    font,
    color: rgb(0.62, 0.67, 0.74),
  });

  // ── Body ───────────────────────────────────────────────────────────────
  addPage();

  h1("1.  The one chain that matters");
  para(
    "Four layers share the same foreign keys. A Site / Business unit / Department / Section / Position / Grade level combination is defined in catalogs, restricted by mapping, stamped onto a job posting, then copied onto the hired employee. After hire, Access Control can still edit that placement on the user — the posting is the source at invite time, not a live join forever.",
  );
  flowBoxes([
    "1  Catalogs  —  org_custom_list_types + one physical table per list (sites, business_units, …)",
    "2  Mapping  —  org_mapping_levels + org_map_* tables (valid child IDs under a parent path)",
    "3  Job posting  —  job_postings holds one real FK column per list (site_id, position_id, …)",
    "4  Application  —  job_applications.job_posting_id points at that posting",
    "5  User  —  users gets the same FKs at invite, plus supervisor_id and application_id",
  ]);
  callout(
    "Where this is configured in the product",
    "System Definitions → Organizational structure (lists). System Definitions → Org structure mapping set up (allowed tree). System Definitions → Create job posting (the vacancy). Recruitment → apply / interview / onboarding → Invite to WillsOne (the user).",
  );

  h1("2.  Catalogs — Organizational Structure lists");
  para(
    "Every list — the original five plus anything added from Set up — is a row in org_custom_list_types. Each row names its own physical Postgres table. The five original catalogs were not renamed when they were folded into this registry; sites, business_units, departments, sections, and grade_levels still exist as those tables.",
  );
  h2("Built-in lists the rest of hiring depends on");
  table(
    ["List (table_name)", "Typical job_postings column", "Role in hiring"],
    [
      ["Sites (sites)", "site_id", "Root of the org path. Label + region become the posting location."],
      ["Business units (business_units)", "business_unit_id", "Second step of the required cascade."],
      ["Departments (departments)", "department_id", "Third step of the required cascade."],
      ["Sections (sections)", "section_id", "Fourth step of the required cascade."],
      ["Position (custom_position)", "position_id", "Fifth step. The Position label becomes the posting title and slug."],
      ["Grade levels (grade_levels)", "grade_level_id", "Required on the posting. Copied to users.grade_level_id. Display code comes from grade_levels.code via join — not a free-text users.grade_level column."],
      ["Salary (custom_salary)", "salary_id", "Required on the posting (bands). Offer terms read salary from the posting, not from a separate pay table."],
      ["Employment type (custom_employment_type)", "employment_type_id (or similar)", "Label is copied into job_postings.employment_type text."],
      ["Age (custom_age)", "age_id, plus age_min_id / age_max_id", "Digits-mode range. AI screening reads the posting’s age band."],
      ["User role (custom table, by label)", "user_role_id", "Copied to users.user_role_id. This is who may act as a supervisor — not users.supervisor_id."],
    ],
    [0.28, 0.28, 0.44],
  );
  para(
    "Admins can add more lists from Organizational structure → Add new list. Creating a list creates a physical table and a matching foreign-key column on job_postings (add_job_posting_org_column). Digits-mode numeric lists also get min/max columns so a posting can store a range of catalog rows, not raw numbers. Disabled lists (is_active = false) are hidden from Create job posting; existing rows and references stay.",
  );
  callout(
    "Grade levels catalog extra columns",
    "grade_levels also carries rank, role_kind (ranked | consultant), age_min, and age_max. fetchGradeLevelsConfig reads this table — there is no hardcoded L1–L7 fallback in that path. users.grade_level (text) is retired; users.grade_level_id is the FK.",
  );

  h1("3.  Mapping — which combinations are valid");
  para(
    "Catalogs are flat. Mapping is the tree that says “this Business unit exists under this Site,” and so on. Without mapping, every Site could pair with every Position. Mapping is what Create job posting, Access Control org placement, Appraisal scope, and Skill log scope all consult — through two read shapes described below.",
  );
  h2("Registry: org_mapping_levels");
  para(
    "One row per participating list. parent_level_id is the parent in the tree. Site is the root (no parent). The mapping-setup page auto-seeds this required chain if it is missing, and those five levels cannot be removed, because Create job posting’s cascade depends on them:",
  );
  codeLine("sites  →  business_units  →  departments  →  sections  →  custom_position");
  para(
    "Grade level is not part of that required five. It is still a catalog, still required on a posting, and it has its own mapping table (org_map_grade_levels) used by Appraisal / Skill log templates so a grade is only offered under a full org path. Admins may add extra levels (for example User role under Position).",
  );
  h2("Physical mapping tables (org_map_*)");
  para(
    "Every non-root level has a real table named org_map_<list table>, with one real FK column per ancestor plus itself. A unique constraint on that column set means each combination is stored once.",
  );
  table(
    ["Table", "FK columns (root → self)"],
    [
      ["org_map_business_units", "site_id, business_unit_id"],
      ["org_map_departments", "site_id, business_unit_id, department_id"],
      ["org_map_sections", "site_id, business_unit_id, department_id, section_id"],
      ["org_map_custom_position", "site_id, business_unit_id, department_id, section_id, position_id"],
      ["org_map_grade_levels", "site_id, business_unit_id, department_id, section_id, position_id, grade_level_id"],
    ],
    [0.38, 0.62],
  );
  para(
    "Site has no org_map_sites table. There is nothing to constrain a root against. Checked Sites (rare root checkboxes) still live in the older shared table org_mapping_nodes.",
  );
  h2("How the mapping UI writes, and how screens read");
  para(
    "Org structure mapping set up talks to GET/POST/DELETE /api/organizational-structure/mapping-nodes. That API is a translator. Root rows still go to org_mapping_nodes. Every other level is inserted into the matching org_map_* table with the full ancestor chain filled in. The JSON the UI sees is always a flat node: { id, level_id, item_id, parent_node_id }, with id shaped as level_id::rawId so the page never has to know which storage was used.",
  );
  para("Two consumers then read that same data differently:");
  table(
    ["Consumer", "API / helper", "Empty mapping behaviour"],
    [
      [
        "Create job posting cascade, and Access Control org placement",
        "GET mapping-nodes, then walk parent_node_id",
        "Fail open. If a level has no nodes yet, the dropdown shows the whole catalog so hiring is not blocked while mapping is rolled out one level at a time.",
      ],
      [
        "Appraisal grade templates and Skill log templates",
        "GET /organizational-structure/org-maps + itemsForOrgMapField",
        "Fail closed. Child lists only include IDs that exist in org_map_* under the selected parents. No parent selected → empty child list.",
      ],
    ],
    [0.28, 0.28, 0.44],
  );
  callout(
    "Do not use org_mapping_levels / org_mapping_nodes as the Appraisal or Skill log picker source",
    "Those screens load the real org_map_* rows. Labels still come from the catalog tables. Mapping rows only decide which IDs are valid under the current pick.",
    "red",
  );

  h1("4.  Create job posting");
  para(
    "The page lives at System Definitions → Create job posting (not on the Recruitment careers list — that list is for operating published roles). Creating a posting is a two-step save: Details, then Interview setup for the same posting id.",
  );
  h2("Always-on cascade (five fields)");
  para(
    "Site, Business unit, Department, Section, and Position are always shown and always required. Changing a parent clears downstream picks. Options for each child are filtered by the mapping-nodes tree described above. Title is not typed: resolveTitleFromPosition reads custom_position.label. The slug is a unique snake_case of that title (generateUniquePostingSlug).",
  );
  h2("Also required, but not in that cascade");
  bullet("Grade level — every posting needs a grade so the hired user and offer/appraisal matching have grade_level_id.");
  bullet("Salary — Offer Terms and onboarding HR fields read salary only from the linked posting.");
  para(
    "On the form, every other active list (Age, Employment type, User role, future custom lists) is opt-in per posting. The order those extras were added is stored on job_postings.optional_org_field_order so they do not jump around by list sort_order. Numeric Age can be one value or min/max, both still FKs into custom_age.",
  );
  callout(
    "Server vs form on “all fields required”",
    "The Details form requires the cascade plus Grade and Salary, and any extras the HR added. POST /api/careers/postings (new posting, not Republish) runs findMissingOrgFields against every active org list. Republish of a closed posting carries org fields forward and does not re-apply that full-list rule, so a legacy posting can be reopened without backfilling missing catalogs.",
  );
  h2("Derived posting fields (not separate catalogs)");
  table(
    ["Stored on job_postings", "Comes from"],
    [
      ["title, slug, job_title_key", "Position label"],
      ["location", "Site label + Site region (Ghana region list)"],
      ["employment_type (text)", "Employment type item label"],
      ["summary", "Truncated description preview"],
      ["closes_at / status", "Ghana-local closing datetime; published vs closed"],
      ["role_scope, key_responsibilities, …", "JD sections; may be extracted from an uploaded JD"],
      ["interview_setup, panel, duration", "Interview step after Save"],
    ],
    [0.38, 0.62],
  );
  para(
    "A published posting appears on the public careers page. Closing hides it from apply. Archive hides it from the main Create job posting table. Republish creates a new row and sets superseded_by on the old one.",
  );

  h1("5.  Apply, onboard, invite — posting becomes a user");
  para(
    "The posting does not create a user. The hire pipeline does. The link that carries org placement is always job_posting_id on the application, then application_id on the user.",
  );
  flowBoxes([
    "Public apply  →  job_applications row with job_posting_id, reference number, form JSON",
    "Interview / shortlist  →  still keyed by that application (and therefore that posting)",
    "Onboarding submission  →  candidate form + HR Section O (employee id, company email, supervisor)",
    "Senior HR / authorised consultant approves  →  POST /api/careers/onboarding/finish-hr",
    "resolveEmployeeOrgPlacementFromPosting(job_posting_id) copies the six path FKs + user_role_id",
    "invitePlatformEmployee inserts users with those FKs, supervisor_id, application_id, auth invite",
  ]);
  para(
    "resolveEmployeeOrgPlacementFromPosting selects site_id, business_unit_id, department_id, section_id, position_id, grade_level_id, and user_role_id from job_postings. Nulls mean a legacy posting or a missing list — they are not invented. Existing employees hired before org columns existed can be backfilled with docs/access-control/backfill-employee-org-placement.sql (only fills still-null columns from the linked posting).",
  );
  para(
    "The invite also writes job_position as text (from the application / HR position title) for display, and may resolve a leftover text grade hint to grade_levels.id if the posting did not already supply grade_level_id. Supervisor is not on the posting. It is chosen in onboarding HR review and stored as users.supervisor_id, after canAssignAsSupervisor checks the target person’s User role.",
  );

  h1("6.  What lives on the employee after hire");
  para(
    "users is the employee record. Org placement columns are the same physical FKs as the posting (ON DELETE SET NULL — deleting a Site never deletes a person).",
  );
  table(
    ["users column", "Meaning", "Copied from posting?"],
    [
      ["site_id … position_id", "Org path", "Yes, at invite"],
      ["grade_level_id", "Grade catalog row. Display via grade_levels(code)", "Yes, at invite"],
      ["user_role_id", "Whether they may act as supervisor / which permission group", "Yes, if the posting had User role"],
      ["supervisor_id", "Reporting line: whose team they are on", "No — set in onboarding / Access Control"],
      ["application_id", "The job_applications row they were hired from", "N/A — set at invite"],
      ["job_position", "Free-text title snapshot", "From application / HR title, not the Position FK itself"],
      ["employment_status", "e.g. probation on first invite", "No"],
    ],
    [0.26, 0.4, 0.34],
  );
  para(
    "After invite, Access Control → that user → Org placement can change the same seven FKs. Dropdowns there reuse the mapping tree (fail-open like Create job posting). Appraisal and skill log then read the user’s current placement, not the original posting. If HR later moves someone, their next appraisal looks up templates for the new combination.",
  );
  callout(
    "Two different supervisor_id columns",
    "users.supervisor_id is the reporting line (who they report to). appraisals.supervisor_id and skill_logs.supervisor_id are who filled that record. Do not treat a filled appraisal’s supervisor_id as the employee’s manager, and do not drop users.supervisor_id — assignment still scopes “people I supervise.” User role opens the supervisor tab even if that list is empty.",
    "red",
  );

  h1("7.  Downstream: appraisal and skill log templates");
  para(
    "Once the user has a complete org placement, live Appraisal and Skill log forms look up a template with all six FKs equal — no partial match:",
  );
  codeLine(
    "site_id + business_unit_id + department_id + section_id + position_id + grade_level_id",
  );
  para(
    "Those templates are authored under System Definitions (Appraisal scope / Skill log scope) using the fail-closed org_map_* pickers. Incomplete user placement, or a combination with no template, shows the same empty states as “place this person first” / “no template for this path.” That is why mapping and posting and hire all have to carry the same IDs: the later modules never re-derive org from a job title string.",
  );

  h1("8.  Facts that must not be mixed");
  table(
    ["Fact", "Source", "Not this"],
    [
      [
        "What lists exist",
        "org_custom_list_types + physical catalog tables",
        "Hardcoded L1–L7 or a retired job-title-options list",
      ],
      [
        "Which combinations are allowed",
        "org_map_* (and root checkboxes in org_mapping_nodes)",
        "A free join of every catalog row to every other catalog row",
      ],
      [
        "What this vacancy is",
        "job_postings FKs + Position-derived title",
        "A typed job title disconnected from Position",
      ],
      [
        "What this employee is, org-wise",
        "users.site_id … grade_level_id (copied at hire, editable later)",
        "Re-reading the posting on every appraisal",
      ],
      [
        "May they act as a supervisor?",
        "users.user_role_id → User role catalog (Supervisory / Executive / HR / Super Admin)",
        "Whether anyone currently has supervisor_id = them",
      ],
      [
        "Who reports to them?",
        "users.supervisor_id of other people",
        "appraisals.supervisor_id / skill_logs.supervisor_id",
      ],
    ],
    [0.28, 0.36, 0.36],
  );

  h2("Primary code and SQL to open");
  bullet("src/lib/organizationalStructureCustomLists.ts — list registry types.");
  bullet("src/lib/organizationalStructureMapping.ts — fail-closed org_map_* helper.");
  bullet("src/app/api/organizational-structure/mapping-nodes/route.ts — mapping UI translator.");
  bullet("src/lib/careers/jobPostingOrgFields.ts — posting FK whitelist, title from Position.");
  bullet("src/app/(dashboard)/dashboard/system-definitions/create-job-posting/page.tsx — create UI.");
  bullet("src/lib/careers/resolveEmployeeOrgPlacement.ts — posting → user copy.");
  bullet("src/app/api/careers/onboarding/finish-hr/route.ts — hire invite.");
  bullet("docs/access-control/users-org-placement.sql and users-org-placement-user-role.sql.");
  bullet("docs/organizational-structure/org-structure-mapping-real-tables.sql and job-postings-org-fields.sql.");

  y -= 8;
  callout(
    "How to use this PDF",
    "Walk a real posting: pick a mapped Site → BU → Department → Section → Position → Grade, save, apply as a candidate, finish onboarding, then open that user in Access Control. Confirm the seven placement FKs match the posting (except supervisor_id, which you set in HR review). Then open Appraisal for that employee and confirm the template match uses those same six IDs.",
  );

  // Footers
  const total = doc.getPageCount();
  for (let i = 1; i < total; i++) {
    const p = pages[i];
    p.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE.w,
      height: 32,
      color: C.wash,
    });
    p.drawText(ascii("WillsOne  |  Org structure, mapping, job posting, user"), {
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
