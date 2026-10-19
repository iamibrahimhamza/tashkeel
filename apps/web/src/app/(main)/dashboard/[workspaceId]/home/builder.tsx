"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageBlocks, type Block, type BlockType, type PageVersionSummary, type PublicHome, type SiteEditorState, type ThemeTokens } from "@tashkeel/contracts";
import { cx } from "@tashkeel/ui";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { z } from "zod";
import type { PreviewMessage, SelectMessage } from "@/app/(main)/preview/home/frame";
import { listVersions, loadVersion, publish, publishVersion, saveDraft, updateSite } from "./actions";
import { BLOCKS, metaOf, newBlock } from "./block-meta";
import { IconButton, Inspector, type Catalog } from "./inspector";

type Locale = "ar" | "en";
type Tab = "sections" | "design" | "history";
type Status = { kind: "idle" | "ok" | "error"; text: string };

const S = {
  ar: {
    sections: "الأقسام", design: "المظهر", history: "السجل",
    save: "حفظ المسودة", publish: "نشر", publishing: "جارٍ النشر…", saving: "جارٍ الحفظ…",
    saved: "تم حفظ المسودة", published: "تم النشر، صفحتك محدّثة الآن", noChanges: "لا تغييرات جديدة",
    dirty: "تغييرات غير محفوظة", clean: "كل التغييرات محفوظة", unpublished: "مسودة لم تُنشر بعد",
    view: "عرض الصفحة", add: "إضافة قسم", hide: "إخفاء", show: "إظهار", duplicate: "تكرار", remove: "حذف", drag: "اسحب لإعادة الترتيب",
    fix: "أكمل الحقول المطلوبة قبل الحفظ", back: "كل الأقسام", desktop: "سطح المكتب", mobile: "الجوال",
    theme: "السمة", seo: "محركات البحث والمشاركة", seoTitle: "عنوان الصفحة", seoDesc: "وصف مختصر", saveDesign: "حفظ المظهر", designSaved: "تم تطبيق المظهر على صفحتك",
    load: "تحميل للتعديل", rollback: "نشر هذه النسخة", live: "منشورة", loaded: "حُمّلت النسخة في المحرر، احفظ أو انشر لاعتمادها",
    blocks: "أقسام", leave: "لديك تغييرات غير محفوظة", empty: "صفحتك فارغة. أضف قسماً للبدء.",
    required: "مطلوب", tooLong: "أطول من المسموح", invalidUrl: "رابط غير صالح", invalid: "قيمة غير صالحة",
  },
  en: {
    sections: "Sections", design: "Design", history: "History",
    save: "Save draft", publish: "Publish", publishing: "Publishing…", saving: "Saving…",
    saved: "Draft saved", published: "Published — your page is live", noChanges: "No new changes",
    dirty: "Unsaved changes", clean: "All changes saved", unpublished: "Draft not published yet",
    view: "View page", add: "Add section", hide: "Hide", show: "Show", duplicate: "Duplicate", remove: "Remove", drag: "Drag to reorder",
    fix: "Complete the required fields before saving", back: "All sections", desktop: "Desktop", mobile: "Mobile",
    theme: "Theme", seo: "Search & sharing", seoTitle: "Page title", seoDesc: "Short description", saveDesign: "Save design", designSaved: "Design applied to your page",
    load: "Load into editor", rollback: "Publish this version", live: "Live", loaded: "Version loaded — save or publish to keep it",
    blocks: "sections", leave: "You have unsaved changes", empty: "Your page is empty. Add a section to begin.",
    required: "Required", tooLong: "Too long", invalidUrl: "Invalid URL", invalid: "Invalid value",
  },
};

type Errors = Record<string, Record<string, string>>;

function collectErrors(blocks: Block[], locale: Locale): Errors {
  const r = PageBlocks.safeParse(blocks);
  if (r.success) return {};
  const s = S[locale];
  const out: Errors = {};
  for (const issue of r.error.issues as z.ZodIssue[]) {
    const [index, , ...rest] = issue.path;
    const block = typeof index === "number" ? blocks[index] : undefined;
    if (!block) continue;
    const msg = issue.code === "too_small" ? s.required : issue.code === "too_big" ? s.tooLong : issue.code === "invalid_string" ? s.invalidUrl : s.invalid;
    (out[block.id] ??= {})[rest.join(".")] = msg;
  }
  return out;
}

export function Builder({ initial, catalog, previewData, locale }: { initial: SiteEditorState; catalog: Catalog; previewData: Pick<PublicHome, "services" | "products" | "posts">; locale: Locale }) {
  const s = S[locale];
  const ws = initial.workspace;
  const [blocks, setBlocks] = useState<Block[]>(initial.page.blocks);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial.page.blocks));
  const [hasUnpublished, setHasUnpublished] = useState(initial.page.hasUnpublishedChanges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("sections");
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const [pending, startTransition] = useTransition();
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [themeId, setThemeId] = useState(initial.themeId);
  const [seo, setSeo] = useState({ title: initial.seo.title ?? "", description: initial.seo.description ?? "" });
  const [versions, setVersions] = useState<PageVersionSummary[] | null>(null);

  const dirty = JSON.stringify(blocks) !== savedJson;
  const errors = useMemo(() => collectErrors(blocks, locale), [blocks, locale]);
  const invalid = Object.keys(errors).length > 0;
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  // Warn before leaving with unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ── Live preview (iframe) ──
  const frame = useRef<HTMLIFrameElement>(null);
  const theme = useMemo<ThemeTokens>(() => {
    const base = initial.themes.find((t) => t.id === themeId)?.tokens ?? initial.themes[0]!.tokens;
    const o = (themeId === initial.themeId ? initial.themeOverrides : {}) as Partial<ThemeTokens>;
    return { ...base, colors: { ...base.colors, ...(o.colors ?? {}) }, fonts: { ...base.fonts, ...(o.fonts ?? {}) } };
  }, [themeId, initial]);
  const pushPreview = useCallback(() => {
    const home: PublicHome = {
      workspace: { slug: ws.slug, name: ws.name, timezone: ws.timezone },
      theme,
      seo: { title: seo.title || ws.name },
      blocks,
      publishedAt: "",
      ...previewData,
    };
    frame.current?.contentWindow?.postMessage({ type: "tashkeel:preview", home, selectedId, locale } satisfies PreviewMessage, window.location.origin);
  }, [blocks, selectedId, theme, seo.title, ws, previewData, locale]);
  useEffect(pushPreview, [pushPreview]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const m = e.data as SelectMessage | { type: "tashkeel:ready" };
      if (m?.type === "tashkeel:ready") pushPreview();
      if (m?.type === "tashkeel:select") {
        setSelectedId(m.id);
        setTab("sections");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushPreview]);

  // ── Edits ──
  const update = (id: string, fn: (b: Block) => Block) => setBlocks((bs) => bs.map((b) => (b.id === id ? fn(b) : b)));
  const add = (type: BlockType) => {
    const b = newBlock(type);
    setBlocks((bs) => {
      const at = selectedId ? bs.findIndex((x) => x.id === selectedId) + 1 : bs.length;
      return [...bs.slice(0, at), b, ...bs.slice(at)];
    });
    setSelectedId(b.id);
  };
  const duplicate = (b: Block) => {
    const copy = { ...structuredClone(b), id: newBlock(b.type).id } as Block;
    setBlocks((bs) => {
      const i = bs.findIndex((x) => x.id === b.id);
      return [...bs.slice(0, i + 1), copy, ...bs.slice(i + 1)];
    });
    setSelectedId(copy.id);
  };
  const remove = (id: string) => {
    setBlocks((bs) => bs.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setBlocks((bs) => arrayMove(bs, bs.findIndex((b) => b.id === active.id), bs.findIndex((b) => b.id === over.id)));
  };

  // ── Persistence ──
  const doSave = () =>
    startTransition(async () => {
      if (invalid) return setStatus({ kind: "error", text: s.fix });
      const r = await saveDraft(ws.id, blocks);
      if (!r.ok) return setStatus({ kind: "error", text: r.error });
      setSavedJson(JSON.stringify(blocks));
      if (!r.data.unchanged) setHasUnpublished(true);
      setStatus({ kind: "ok", text: r.data.unchanged ? s.noChanges : s.saved });
    });
  const doPublish = () =>
    startTransition(async () => {
      if (invalid) return setStatus({ kind: "error", text: s.fix });
      const r = await publish(ws.id, blocks);
      if (!r.ok) return setStatus({ kind: "error", text: r.error });
      setSavedJson(JSON.stringify(blocks));
      setHasUnpublished(false);
      setVersions(null);
      setStatus({ kind: "ok", text: s.published });
    });
  const doSaveDesign = () =>
    startTransition(async () => {
      const r = await updateSite(ws.id, ws.slug, { themeId, seo: { ...(seo.title ? { title: seo.title } : {}), ...(seo.description ? { description: seo.description } : {}) } });
      setStatus(r.ok ? { kind: "ok", text: s.designSaved } : { kind: "error", text: r.error });
    });
  const openHistory = () => {
    setTab("history");
    startTransition(async () => {
      const r = await listVersions(ws.id);
      if (r.ok) setVersions(r.data);
    });
  };
  const doLoad = (versionId: string) =>
    startTransition(async () => {
      const r = await loadVersion(ws.id, versionId);
      if (!r.ok) return setStatus({ kind: "error", text: r.error });
      setBlocks(r.data);
      setSelectedId(null);
      setTab("sections");
      setStatus({ kind: "ok", text: s.loaded });
    });
  const doRollback = (versionId: string) =>
    startTransition(async () => {
      const r = await publishVersion(ws.id, versionId);
      if (!r.ok) return setStatus({ kind: "error", text: r.error });
      setVersions(null);
      openHistory();
      setStatus({ kind: "ok", text: s.published });
    });

  const fmt = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="-mx-4 -my-8 grid min-h-[calc(100dvh-4rem)] sm:-mx-8 lg:-mx-12 lg:-my-12 lg:h-dvh lg:grid-cols-[24rem_1fr]">
      {/* ── Sidebar ── */}
      <aside className="flex min-h-0 flex-col border-line bg-paper lg:border-e">
        <div className="flex items-center gap-1 border-b border-line p-3">
          {(["sections", "design", "history"] as const).map((k) => (
            <button key={k} type="button" onClick={() => (k === "history" ? openHistory() : setTab(k))} aria-pressed={tab === k} className={cx("flex-1 rounded-lg py-2 font-heading text-sm transition", tab === k ? "bg-sand text-ink" : "text-muted hover:text-ink")}>
              {s[k]}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "sections" && !selected && (
            <>
              {blocks.length === 0 && <p className="mb-4 rounded-xl border border-dashed border-line p-4 text-sm text-muted">{s.empty}</p>}
              <DndContext id="home-sections" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <ul className="grid gap-2">
                    {blocks.map((b) => (
                      <SectionRow key={b.id} block={b} locale={locale} hasError={!!errors[b.id]} onSelect={() => setSelectedId(b.id)} onToggle={() => update(b.id, (x) => ({ ...x, hidden: !x.hidden }) as Block)} labels={s} />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
              <h3 className="mb-2 mt-6 font-heading text-xs text-muted">{s.add}</h3>
              <div className="grid grid-cols-2 gap-2">
                {BLOCKS.map((m) => (
                  <button key={m.type} type="button" onClick={() => add(m.type)} className="rounded-xl border border-line p-3 text-start transition hover:border-accent hover:bg-sand/60">
                    <span className="block font-heading text-sm">{m.label[locale]}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted">{m.description[locale]}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === "sections" && selected && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <button type="button" onClick={() => setSelectedId(null)} className="font-heading text-sm text-muted hover:text-ink">
                  {locale === "ar" ? "→" : "←"} {s.back}
                </button>
                <div className="flex gap-1">
                  <IconButton label={selected.hidden ? s.show : s.hide} onClick={() => update(selected.id, (x) => ({ ...x, hidden: !x.hidden }) as Block)}>{selected.hidden ? "◌" : "●"}</IconButton>
                  <IconButton label={s.duplicate} onClick={() => duplicate(selected)}>⧉</IconButton>
                  <IconButton label={s.remove} onClick={() => remove(selected.id)}>×</IconButton>
                </div>
              </div>
              <h2 className="mb-5 font-display text-xl">{metaOf(selected.type).label[locale]}</h2>
              <Inspector block={selected} catalog={catalog} errors={errors[selected.id] ?? {}} locale={locale} onChange={(props) => update(selected.id, (x) => ({ ...x, props }) as Block)} />
            </div>
          )}

          {tab === "design" && (
            <div className="grid gap-6">
              <section>
                <h3 className="mb-3 font-heading text-sm">{s.theme}</h3>
                <div className="grid gap-2">
                  {initial.themes.map((t) => (
                    <button key={t.id} type="button" onClick={() => setThemeId(t.id)} aria-pressed={themeId === t.id} className={cx("flex items-center justify-between rounded-xl border p-3 transition", themeId === t.id ? "border-accent bg-sand/60" : "border-line hover:border-accent/60")}>
                      <span className="font-heading text-sm">{locale === "ar" ? t.nameAr : t.name}</span>
                      <span className="flex gap-1" aria-hidden="true">
                        {[t.tokens.colors.paper, t.tokens.colors.ink, t.tokens.colors.accent, t.tokens.colors.sand].map((c, i) => (
                          <span key={i} className="size-5 rounded-full border border-line" style={{ background: c }} />
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="grid gap-3">
                <h3 className="font-heading text-sm">{s.seo}</h3>
                <label className="grid gap-1.5">
                  <span className="font-heading text-xs text-muted">{s.seoTitle} ({seo.title.length}/70)</span>
                  <input value={seo.title} maxLength={70} placeholder={ws.name} onChange={(e) => setSeo({ ...seo, title: e.target.value })} className="rounded-xl border border-line px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none" />
                </label>
                <label className="grid gap-1.5">
                  <span className="font-heading text-xs text-muted">{s.seoDesc} ({seo.description.length}/170)</span>
                  <textarea value={seo.description} maxLength={170} rows={3} onChange={(e) => setSeo({ ...seo, description: e.target.value })} className="rounded-xl border border-line px-3.5 py-2.5 text-sm leading-7 focus:border-accent focus:outline-none" />
                </label>
              </section>
              <button type="button" disabled={pending} onClick={doSaveDesign} className="rounded-full bg-ink py-2.5 font-heading text-sm text-paper disabled:opacity-60">{s.saveDesign}</button>
            </div>
          )}

          {tab === "history" && (
            <ul className="grid gap-2">
              {(versions ?? []).map((v) => (
                <li key={v.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-sm">{fmt.format(new Date(v.createdAt))}</span>
                    {v.isPublished && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-heading text-xs text-emerald-800">{s.live}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {v.createdBy} · {v.blockCount} {s.blocks}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={pending} onClick={() => doLoad(v.id)} className="rounded-full border border-line px-3 py-1 font-heading text-xs hover:border-accent">{s.load}</button>
                    {!v.isPublished && (
                      <button type="button" disabled={pending} onClick={() => doRollback(v.id)} className="rounded-full border border-line px-3 py-1 font-heading text-xs hover:border-accent">{s.rollback}</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Toolbar + preview ── */}
      <section className="flex min-h-[70dvh] min-w-0 flex-col bg-sand">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-paper px-4 py-3">
          <span role="status" className={cx("font-heading text-xs", status.kind === "error" ? "text-red-700" : status.kind === "ok" ? "text-emerald-800" : "text-muted")}>
            {status.text || (dirty ? s.dirty : hasUnpublished ? s.unpublished : s.clean)}
          </span>
          <div className="ms-auto flex items-center gap-2">
            <div className="hidden rounded-full border border-line p-0.5 sm:flex">
              {(["desktop", "mobile"] as const).map((d) => (
                <button key={d} type="button" onClick={() => setDevice(d)} aria-pressed={device === d} className={cx("rounded-full px-3 py-1 font-heading text-xs", device === d ? "bg-sand text-ink" : "text-muted")}>
                  {s[d]}
                </button>
              ))}
            </div>
            <a href={`/${ws.slug}`} target="_blank" rel="noreferrer" className="px-2 font-heading text-xs text-muted hover:text-ink">{s.view}</a>
            <button type="button" disabled={pending || !dirty} onClick={doSave} className="rounded-full border border-ink/20 px-4 py-2 font-heading text-sm transition hover:border-ink/50 disabled:opacity-40">
              {pending ? s.saving : s.save}
            </button>
            <button type="button" disabled={pending || invalid || (!dirty && !hasUnpublished)} onClick={doPublish} className="rounded-full bg-ink px-5 py-2 font-heading text-sm text-paper transition hover:opacity-90 disabled:opacity-40">
              {pending ? s.publishing : s.publish}
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden p-4">
          <iframe
            ref={frame}
            src="/preview/home"
            title="preview"
            onLoad={pushPreview}
            className={cx("h-full min-h-[60dvh] rounded-[14px] border border-line bg-paper shadow-[0_20px_60px_-40px_rgba(25,34,30,.5)] transition-[width]", device === "mobile" ? "w-[390px]" : "w-full")}
          />
        </div>
      </section>
    </div>
  );
}

function SectionRow({ block, locale, hasError, onSelect, onToggle, labels }: { block: Block; locale: Locale; hasError: boolean; onSelect: () => void; onToggle: () => void; labels: (typeof S)["ar"] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const title = metaOf(block.type).label[locale];
  const sub = "heading" in block.props && typeof block.props.heading === "string" ? block.props.heading : block.type === "hero" ? block.props.title : "";
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx("flex items-center gap-2 rounded-xl border bg-paper p-2 transition", isDragging ? "z-10 border-accent shadow-lg" : "border-line", block.hidden && "opacity-50")}>
      <button type="button" {...attributes} {...listeners} aria-label={labels.drag} className="grid size-8 cursor-grab touch-none place-items-center rounded-lg text-muted hover:bg-sand active:cursor-grabbing">⋮⋮</button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-start">
        <span className="flex items-center gap-2 font-heading text-sm">
          {title}
          {hasError && <span className="size-1.5 rounded-full bg-red-600" aria-label="!" />}
        </span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </button>
      <IconButton label={block.hidden ? labels.show : labels.hide} onClick={onToggle}>{block.hidden ? "◌" : "●"}</IconButton>
    </li>
  );
}
