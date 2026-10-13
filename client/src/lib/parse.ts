/* Turns the model's plain-text answers (numbered lists, nested bullets, light markdown) into display data.
   Parsing is best-effort; the raw text is always available in the UI as a fallback. */

export const NOT_FOUND = "I could not find this information in the meeting transcript.";

/** Strip markdown emphasis/heading marks and tidy whitespace. */
export const clean = (s: string) =>
  s
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)\*(\S[^*]*\S|\S)\*(?=\s|[.,;:!?]|$)/g, "$1$2")
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

const ITEM = /^(\s*)(?:\d+[.)]|[-*•–])\s+/;
const NONE = /\bno\s+(?:explicit\s+|clear\s+)?(?:action items|key decisions|decisions|open questions|unresolved questions|questions)\s+(?:were\s+)?(?:found|made|identified|mentioned)\b/i;

export type Point = { text: string; children: string[] };
export type Section = { heading: string | null; items: Point[] };

const isHeading = (line: string) => {
  const t = line.trim();
  if (/^#{1,6}\s+\S/.test(t)) return true;
  if (/^\*\*[^*]+\*\*:?$/.test(t)) return true; // **Bold line**
  if (/^[A-Z][^.!?]{0,48}:$/.test(clean(t))) return true; // Short "Key points:"
  return false;
};

/** Headings → sections; top-level bullets → points; deeper bullets → children. */
export function parseOutline(text: string): Section[] {
  if (!text) return [];
  const sections: Section[] = [{ heading: null, items: [] }];
  let baseIndent: number | null = null;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    if (!raw.trim() || /^\s*[-*_]{3,}\s*$/.test(raw)) continue;
    const cur = sections[sections.length - 1];
    const m = raw.match(ITEM);
    if (m) {
      const indent = m[1].replace(/\t/g, "    ").length;
      if (baseIndent === null) baseIndent = indent;
      const body = clean(raw.slice(m[0].length));
      if (!body) continue;
      const last = cur.items[cur.items.length - 1];
      if (indent > baseIndent && last) last.children.push(body);
      else cur.items.push({ text: body, children: [] });
    } else if (isHeading(raw)) {
      sections.push({ heading: clean(raw).replace(/:$/, ""), items: [] });
      baseIndent = null;
    } else {
      const last = cur.items[cur.items.length - 1];
      const body = clean(raw);
      if (last && /^\s{2,}/.test(raw)) {
        if (last.children.length) last.children[last.children.length - 1] += " " + body;
        else last.text += " " + body;
      }
      // Lines outside any list (preambles such as "Here's a numbered list…") are dropped.
    }
  }
  for (const s of sections) for (const i of s.items) if (i.children.length) i.text = i.text.replace(/:$/, "");
  return sections.filter((s) => s.items.length);
}

const count = (secs: Section[]) => secs.reduce((n, s) => n + s.items.length, 0);

/** True when the model says there is nothing to report (anywhere in its answer). */
export function isNone(text: string) {
  return !!text && NONE.test(clean(text)) && count(parseOutline(text)) === 0;
}

/** Summary: an outline; falls back to paragraphs when the model wrote prose. */
export function parseSummary(text: string): Section[] {
  const secs = parseOutline(text);
  if (count(secs)) return secs;
  const paras = (text || "")
    .split(/\n{2,}/)
    .map(clean)
    .filter((p) => p && !/^[^.]{1,60}:$/.test(p));
  return paras.length ? [{ heading: null, items: paras.map((p) => ({ text: p, children: [] })) }] : [];
}

/** Decisions / questions: flat list of points (sections merged), empty when the model found none. */
export function parsePoints(text: string): Point[] {
  if (!text || isNone(text)) return [];
  const items = parseOutline(text).flatMap((s) => s.items);
  if (items.length) return items;
  if (NONE.test(clean(text))) return [];
  return text
    .split(/\n{2,}/)
    .map(clean)
    .filter((p) => p && !/:$/.test(p))
    .map((p) => ({ text: p, children: [] }));
}

export type ActionItem = { task: string; owner: string; due: string; notes: string[] };

const FIELD = {
  owner: /^(?:owner|responsible|assignee|assigned to|who)\b[^:]*:\s*/i,
  due: /^(?:deadline|due date|due|by when|timeline|when)\b[^:]*:\s*/i,
  task: /^(?:task description|task|action|what)\b[^:]*:\s*/i,
};

export function parseActions(text: string): ActionItem[] {
  if (!text || isNone(text)) return [];
  return parseOutline(text)
    .flatMap((s) => s.items)
    .map((item) => {
      let task = "",
        owner = "",
        due = "";
      const notes: string[] = [];
      for (const part of [item.text, ...item.children]) {
        // a line may hold several fields: "Task: X – Owner: Y – Deadline: Z"
        const bits = part.split(/\s+[–—|]\s+|;\s+(?=(?:owner|deadline|due|responsible)\b)/i);
        for (const b of bits) {
          if (FIELD.owner.test(b)) owner = b.replace(FIELD.owner, "");
          else if (FIELD.due.test(b)) due = b.replace(FIELD.due, "");
          else if (FIELD.task.test(b)) task = b.replace(FIELD.task, "");
          else if (!task) task = b;
          else notes.push(b);
        }
      }
      // "Do X (Owner: Daniel, Deadline: Friday)"
      const paren = task.match(/\((?:[^)]*?(owner|responsible)[^:]*:\s*([^,)]+))?(?:[^)]*?(deadline|due)[^:]*:\s*([^,)]+))?[^)]*\)\s*$/i);
      if (paren && (paren[2] || paren[4])) {
        owner ||= paren[2]?.trim() || "";
        due ||= paren[4]?.trim() || "";
        task = task.slice(0, paren.index).trim();
      }
      const ns = (v: string) => (!v || /^(n\/a|none|not (specified|mentioned|given)|unspecified|tbd)\.?$/i.test(v) ? "Not specified" : v.replace(/\.$/, ""));
      return { task: task.replace(/[-–:,]\s*$/, "") || item.text, owner: ns(owner), due: ns(due), notes };
    });
}

/** Plain-text version of an outline, used by "Copy summary". */
export const outlineText = (secs: Section[]) =>
  secs
    .map((s) => [s.heading ? `${s.heading}` : "", ...s.items.map((i) => [`• ${i.text}`, ...i.children.map((c) => `   – ${c}`)].join("\n"))].filter(Boolean).join("\n"))
    .join("\n\n");

export const words = (s: string) => (s ? s.trim().split(/\s+/).filter(Boolean).length : 0);

/** Tidy the model's title: drop quotes, asterisks and a trailing period. */
export const cleanTitle = (t: string) => clean(t || "").replace(/^["'“”‘’]+|["'“”‘’.]+$/g, "").trim() || "Untitled video";
