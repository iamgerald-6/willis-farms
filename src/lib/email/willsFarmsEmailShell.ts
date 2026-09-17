/** Standard Wills Farms transactional email wrapper (careers / HR). */

export function escapeHtmlForEmail(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function willsFarmsEmailShell(
  title: string,
  innerBodyHtml: string,
  footerNote = "Human Capital · Wills Farms Ltd.",
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="background:#991b1b;padding:24px 28px;">
          <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#fecaca;">Wills Farms Ltd.</p>
          <h1 style="margin:8px 0 0;font-size:20px;color:#fff;">${escapeHtmlForEmail(title)}</h1>
        </td></tr>
        <tr><td style="padding:28px;">${innerBodyHtml}</td></tr>
        <tr><td style="padding:16px 28px;background:#fafafa;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">${escapeHtmlForEmail(footerNote)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Turn `**bold**` segments into `<strong>` after escaping the rest. */
export function formatInlineEmailText(text: string): string {
  const re = /\*\*(.+?)\*\*/g;
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    out += escapeHtmlForEmail(text.slice(last, match.index));
    out += `<strong>${escapeHtmlForEmail(match[1])}</strong>`;
    last = re.lastIndex;
  }
  out += escapeHtmlForEmail(text.slice(last));
  return out;
}

function isSectionHeaderLine(line: string): boolean {
  return /^\*\*.+\*\*:?\s*$/.test(line.trim());
}

function stripSectionHeaderMarkdown(line: string): string {
  return line.trim().replace(/^\*\*(.+?)\*\*:?\s*$/, "$1");
}

function isNumberedListLine(line: string): boolean {
  return /^\d+\.\s/.test(line.trim());
}

function renderNumberedListHtml(lines: string[]): string {
  return `<ol style="margin:0 0 16px;padding-left:20px;font-size:15px;color:#374151;">${lines
    .map((line) => {
      const item = line.trim().replace(/^\d+\.\s*/, "");
      return `<li style="margin:0 0 10px;">${formatInlineEmailText(item)}</li>`;
    })
    .join("")}</ol>`;
}

function renderSectionHeaderHtml(title: string): string {
  return `<p style="margin:16px 0 8px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">${escapeHtmlForEmail(title)}</p>`;
}

export function plainTextToEmailBodyHtml(text: string): string {
  const blocks = text.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const htmlParts: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);

    if (lines.length === 0) continue;

    // Numbered list block
    if (lines.length >= 1 && lines.every(isNumberedListLine)) {
      htmlParts.push(renderNumberedListHtml(lines));
      continue;
    }

    // Section header + numbered list in one block
    if (lines.length > 1 && isSectionHeaderLine(lines[0]) && lines.slice(1).every(isNumberedListLine)) {
      htmlParts.push(renderSectionHeaderHtml(stripSectionHeaderMarkdown(lines[0])));
      htmlParts.push(renderNumberedListHtml(lines.slice(1)));
      continue;
    }

    // Section header + label/value detail lines → details box
    if (lines.length > 1 && isSectionHeaderLine(lines[0])) {
      const detailLines = lines.slice(1);
      const labelValueRows = detailLines
        .map((line) => {
          const idx = line.indexOf(":");
          if (idx <= 0) return null;
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()] as [string, string];
        })
        .filter((row): row is [string, string] => !!row && !!row[1]);

      if (labelValueRows.length === detailLines.length) {
        htmlParts.push(emailDetailsBox(stripSectionHeaderMarkdown(lines[0]), labelValueRows));
        continue;
      }
    }

    // Lone section header
    if (lines.length === 1 && isSectionHeaderLine(lines[0])) {
      htmlParts.push(renderSectionHeaderHtml(stripSectionHeaderMarkdown(lines[0])));
      continue;
    }

    // Default paragraph — preserve line breaks, render inline bold
    htmlParts.push(
      `<p style="margin:0 0 16px;font-size:15px;color:#374151;">${formatInlineEmailText(block).replace(/\n/g, "<br/>")}</p>`,
    );
  }

  return htmlParts.join("");
}

export function emailPrimaryButton(label: string, href: string): string {
  return `<p style="margin:24px 0;"><a href="${escapeHtmlForEmail(href)}" style="display:inline-block;background:#991b1b;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtmlForEmail(label)}</a></p>`;
}

export function emailDetailsBox(title: string, rows: Array<[string, string | undefined | null]>): string {
  const items = rows
    .filter(([, value]) => value?.toString().trim())
    .map(
      ([label, value]) =>
        `<p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>${escapeHtmlForEmail(label)}:</strong> ${escapeHtmlForEmail(String(value))}</p>`,
    )
    .join("");

  if (!items) return "";

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;">
    <tr><td style="padding:20px 24px;">
      <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">${escapeHtmlForEmail(title)}</p>
      ${items}
    </td></tr>
  </table>`;
}
