// Turns a plain-text job description section (written in
// SectionTextEditor's shorthand) into formatted JSX for the public job
// details page. Server-safe — no client-only APIs — so it can render
// inside a server component.
//
// Syntax recognized, line by line:
//   # Heading text     -> heading
//   - bullet text       -> bullet point (consecutive lines group into one list)
//   1. numbered text     -> numbered point (consecutive lines group into one list)
//   anything else         -> plain paragraph
// Inline, within any line type: *bold* and _italic_.

import type { ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*[^*\n]+\*|_[^_\n]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("*")) {
      nodes.push(<strong key={`${keyPrefix}-${i}`}>{token.slice(1, -1)}</strong>);
    } else {
      nodes.push(<em key={`${keyPrefix}-${i}`}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
    i += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function SectionText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text || !text.trim()) return null;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let numberBuffer: string[] = [];

  function flushBullets(key: string) {
    if (bulletBuffer.length === 0) return;
    nodes.push(
      <ul key={key} className="list-disc space-y-1 pl-5">
        {bulletBuffer.map((item, idx) => (
          <li key={idx} className="text-justify">{renderInline(item, `${key}-${idx}`)}</li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  }

  function flushNumbers(key: string) {
    if (numberBuffer.length === 0) return;
    nodes.push(
      <ol key={key} className="list-decimal space-y-1 pl-5">
        {numberBuffer.map((item, idx) => (
          <li key={idx} className="text-justify">{renderInline(item, `${key}-${idx}`)}</li>
        ))}
      </ol>,
    );
    numberBuffer = [];
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const bulletMatch = /^[-•]\s+(.*)$/.exec(line);
    const numberMatch = /^\d+[.)]\s+(.*)$/.exec(line);
    const headingMatch = /^#{1,3}\s+(.*)$/.exec(line);

    if (bulletMatch) {
      flushNumbers(`ol-${idx}`);
      bulletBuffer.push(bulletMatch[1]);
      return;
    }
    if (numberMatch) {
      flushBullets(`ul-${idx}`);
      numberBuffer.push(numberMatch[1]);
      return;
    }

    flushBullets(`ul-${idx}`);
    flushNumbers(`ol-${idx}`);

    if (headingMatch) {
      nodes.push(
        <p key={idx} className="font-bold text-brand-dark">
          {renderInline(headingMatch[1], `h-${idx}`)}
        </p>,
      );
      return;
    }

    if (line) {
      nodes.push(
        <p key={idx} className="leading-relaxed text-justify">
          {renderInline(line, `p-${idx}`)}
        </p>,
      );
    }
  });

  flushBullets("ul-end");
  flushNumbers("ol-end");

  return <div className={`space-y-2 text-sm text-brand-gray ${className ?? ""}`}>{nodes}</div>;
}
