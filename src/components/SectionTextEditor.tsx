"use client";

// Plain-text editor for the job description sections (Role Scope, Key
// Responsibilities, etc). Deliberately just a native <textarea> — no
// contentEditable, no execCommand — because that's what a normal text
// box is supposed to feel like: paste works, backspace works, nothing
// steals focus. Structure comes from a few simple line-start markers
// instead of a rich-text toolbar:
//   # Heading text     -> heading
//   - bullet text       -> bullet point
//   1. numbered text     -> numbered point
//   *bold* and _italic_  -> inline emphasis, same convention as WhatsApp
// The toolbar buttons below just insert these markers at the cursor
// using the textarea's own selection APIs — still a completely normal
// textarea underneath.

import { useRef } from "react";
import { Bold, Heading as HeadingIcon, Italic, List, ListOrdered } from "lucide-react";

function insertAtSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder: string,
): { next: string; selStart: number; selEnd: number } {
  const { value, selectionStart: start, selectionEnd: end } = textarea;
  const selected = value.slice(start, end) || placeholder;
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  return { next, selStart: start + before.length, selEnd: start + before.length + selected.length };
}

function insertLinePrefix(textarea: HTMLTextAreaElement, prefix: string): { next: string; selStart: number; selEnd: number } {
  const { value, selectionStart: start } = textarea;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  const cursor = start + prefix.length;
  return { next, selStart: cursor, selEnd: cursor };
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
    >
      {children}
    </button>
  );
}

export function SectionTextEditor({
  value,
  onChange,
  placeholder,
  rows = 6,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function apply(fn: (el: HTMLTextAreaElement) => { next: string; selStart: number; selEnd: number }) {
    const el = ref.current;
    if (!el) return;
    const { next, selStart, selEnd } = fn(el);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 p-1">
        <ToolbarButton label="Heading" onClick={() => apply((el) => insertLinePrefix(el, "# "))}>
          <HeadingIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Bullet point" onClick={() => apply((el) => insertLinePrefix(el, "- "))}>
          <List className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Numbered point" onClick={() => apply((el) => insertLinePrefix(el, "1. "))}>
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <ToolbarButton label="Bold (*text*)" onClick={() => apply((el) => insertAtSelection(el, "*", "*", "bold text"))}>
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Italic (_text_)" onClick={() => apply((el) => insertAtSelection(el, "_", "_", "italic text"))}>
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <p className="mt-1 text-[11px] text-gray-400">
        Start a line with "-" for a bullet, "1." for a numbered point, or "#" for a heading. Wrap text in *asterisks* for bold, _underscores_ for italic.
      </p>
    </div>
  );
}
