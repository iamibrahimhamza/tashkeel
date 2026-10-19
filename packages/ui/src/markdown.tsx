import { Fragment, type ReactNode } from "react";

/**
 * Small, safe Markdown subset → React elements (no HTML injection is possible: nothing is
 * rendered with dangerouslySetInnerHTML). Supports headings (##, ###), paragraphs,
 * unordered/ordered lists, **bold**, *italic* and blockquotes. The blog engine uses a full
 * remark + sanitize pipeline; this is for short expert-authored texts in page blocks.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={className}>{parseBlocks(source)}</div>;
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(tok.startsWith("**") ? <strong key={i++}>{tok.slice(2, -2)}</strong> : <em key={i++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function parseBlocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let k = 0;

  const flushPara = () => {
    if (para.length) nodes.push(<p key={k++}>{inline(para.join(" "))}</p>);
    para = [];
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
      nodes.push(list.ordered ? <ol key={k++} className="list-decimal ps-6">{items}</ol> : <ul key={k++} className="list-disc ps-6">{items}</ul>);
    }
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      nodes.push(h[1] === "##" ? <h2 key={k++}>{inline(h[2]!)}</h2> : <h3 key={k++}>{inline(h[2]!)}</h3>);
    } else if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]!);
    } else if (quote) {
      flushPara();
      flushList();
      nodes.push(<blockquote key={k++} className="border-s-2 border-accent ps-4 text-muted">{inline(quote[1]!)}</blockquote>);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>);
}
