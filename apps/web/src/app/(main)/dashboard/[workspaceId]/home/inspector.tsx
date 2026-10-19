"use client";

import type { Block } from "@tashkeel/contracts";
import { cx } from "@tashkeel/ui";
import type { FieldDef } from "./block-meta";
import { metaOf } from "./block-meta";

export type Catalog = {
  services: Array<{ id: string; title: string }>;
  products: Array<{ id: string; title: string; type: "FILE" | "COURSE" }>;
};

type Props = Record<string, unknown>;
type Locale = "ar" | "en";

const inputCls = "w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none aria-[invalid=true]:border-red-600";

const T = {
  ar: { add: "إضافة", remove: "حذف", up: "تحريك للأعلى", down: "تحريك للأسفل", required: "مطلوب", none: "لا توجد عناصر بعد.", ctaLabel: "نص الزر", ctaHref: "الرابط (مثل #services)", empty: "لا يوجد ما يُختار بعد" },
  en: { add: "Add", remove: "Remove", up: "Move up", down: "Move down", required: "Required", none: "Nothing here yet.", ctaLabel: "Button label", ctaHref: "Link (e.g. #services)", empty: "Nothing to choose yet" },
};

/** Form for one block, generated from its field definitions. Errors are keyed by prop path. */
export function Inspector({ block, onChange, catalog, errors, locale }: { block: Block; onChange: (props: Props) => void; catalog: Catalog; errors: Record<string, string>; locale: Locale }) {
  const meta = metaOf(block.type);
  const props = block.props as Props;
  return (
    <div className="grid gap-5">
      {meta.fields.map((f) => (
        <Field key={f.key} def={f} value={props[f.key]} onChange={(v) => onChange(setKey(props, f.key, v))} catalog={catalog} errors={errors} path={f.key} locale={locale} />
      ))}
    </div>
  );
}

/** Empty optional strings are removed rather than stored as "". */
function setKey(obj: Props, key: string, v: unknown): Props {
  const next = { ...obj };
  if (v === undefined || v === "") delete next[key];
  else next[key] = v;
  return next;
}

function Label({ text, required, locale }: { text: string; required?: boolean; locale: Locale }) {
  return (
    <span className="font-heading text-xs text-muted">
      {text}
      {required && <span className="text-accent"> · {T[locale].required}</span>}
    </span>
  );
}

function ErrorText({ msg }: { msg?: string }) {
  return msg ? <span className="text-xs text-red-700">{msg}</span> : null;
}

function Field({ def, value, onChange, catalog, errors, path, locale }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void; catalog: Catalog; errors: Record<string, string>; path: string; locale: Locale }) {
  const t = T[locale];
  const label = def.label[locale];
  const err = errors[path];

  switch (def.kind) {
    case "text":
    case "url":
      return (
        <label className="grid gap-1.5">
          <Label text={label} required={def.required} locale={locale} />
          <input value={(value as string) ?? ""} maxLength={def.max} dir={def.ltr ? "ltr" : undefined} type={def.kind === "url" ? "url" : "text"} aria-invalid={!!err} onChange={(e) => onChange(e.target.value)} className={inputCls} />
          <ErrorText msg={err} />
        </label>
      );
    case "textarea":
      return (
        <label className="grid gap-1.5">
          <Label text={label} required={def.required} locale={locale} />
          <textarea value={(value as string) ?? ""} maxLength={def.max} rows={def.max && def.max > 1000 ? 8 : 3} aria-invalid={!!err} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, "leading-7")} />
          <ErrorText msg={err} />
        </label>
      );
    case "select":
      return (
        <label className="grid gap-1.5">
          <Label text={label} locale={locale} />
          <select value={(value as string) ?? def.options[0]?.value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
            {def.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label[locale]}</option>
            ))}
          </select>
        </label>
      );
    case "number":
      return (
        <label className="grid gap-1.5">
          <Label text={label} locale={locale} />
          <input type="number" min={def.min} max={def.max} value={(value as number) ?? def.min} onChange={(e) => onChange(Math.min(def.max, Math.max(def.min, Number(e.target.value) || def.min)))} className={inputCls} dir="ltr" />
        </label>
      );
    case "cta": {
      const cta = (value as { label?: string; href?: string } | undefined) ?? {};
      const update = (k: "label" | "href", v: string) => {
        const next = { ...cta, [k]: v };
        onChange(next.label || next.href ? next : undefined);
      };
      return (
        <fieldset className="grid gap-2 rounded-xl border border-line p-3">
          <Label text={label} locale={locale} />
          <input placeholder={t.ctaLabel} value={cta.label ?? ""} maxLength={40} aria-invalid={!!errors[`${path}.label`]} onChange={(e) => update("label", e.target.value)} className={inputCls} />
          <input placeholder={t.ctaHref} value={cta.href ?? ""} dir="ltr" aria-invalid={!!errors[`${path}.href`]} onChange={(e) => update("href", e.target.value)} className={inputCls} />
          <ErrorText msg={errors[`${path}.label`] ?? errors[`${path}.href`]} />
        </fieldset>
      );
    }
    case "stringList": {
      const list = (value as string[] | undefined) ?? [];
      return (
        <div className="grid gap-2">
          <Label text={label} locale={locale} />
          {list.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input value={s} aria-invalid={!!errors[`${path}.${i}`]} onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))} className={inputCls} />
              <IconButton label={t.remove} onClick={() => onChange(list.filter((_, j) => j !== i))}>×</IconButton>
            </div>
          ))}
          {list.length < def.max && <AddButton onClick={() => onChange([...list, ""])}>{`${t.add} ${def.itemLabel[locale]}`}</AddButton>}
        </div>
      );
    }
    case "items": {
      const list = (value as Props[] | undefined) ?? [];
      const move = (i: number, d: -1 | 1) => {
        const next = [...list];
        const [x] = next.splice(i, 1);
        next.splice(i + d, 0, x!);
        onChange(next);
      };
      return (
        <div className="grid gap-3">
          <Label text={label} locale={locale} />
          {list.length === 0 && <p className="text-xs text-muted">{t.none}</p>}
          {list.map((item, i) => (
            <div key={i} className="grid gap-3 rounded-xl border border-line bg-sand/50 p-3">
              <div className="flex items-center justify-between">
                <span className="font-heading text-xs">{`${def.itemLabel[locale]} ${i + 1}`}</span>
                <div className="flex gap-1">
                  <IconButton label={t.up} disabled={i === 0} onClick={() => move(i, -1)}>↑</IconButton>
                  <IconButton label={t.down} disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</IconButton>
                  <IconButton label={t.remove} onClick={() => onChange(list.filter((_, j) => j !== i))}>×</IconButton>
                </div>
              </div>
              {def.fields.map((f) => (
                <Field key={f.key} def={f} value={item[f.key]} onChange={(v) => onChange(list.map((x, j) => (j === i ? setKey(x, f.key, v) : x)))} catalog={catalog} errors={errors} path={`${path}.${i}.${f.key}`} locale={locale} />
              ))}
            </div>
          ))}
          {list.length < def.max && <AddButton onClick={() => onChange([...list, defaultItem(def.fields)])}>{`${t.add} ${def.itemLabel[locale]}`}</AddButton>}
        </div>
      );
    }
    case "picker": {
      const options =
        def.source === "services"
          ? catalog.services
          : catalog.products.filter((p) => (def.source === "courses" ? p.type === "COURSE" : true));
      const selected = (value as string[] | undefined) ?? [];
      const toggle = (id: string) => {
        const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
        onChange(next.length ? next : undefined);
      };
      return (
        <div className="grid gap-2">
          <Label text={label} locale={locale} />
          <p className="text-xs text-muted">{def.hint[locale]}</p>
          {options.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-2.5 text-xs text-muted">{t.empty}</p>
          ) : (
            options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
                {o.title}
              </label>
            ))
          )}
        </div>
      );
    }
  }
}

function defaultItem(fields: FieldDef[]): Props {
  const item: Props = {};
  for (const f of fields) {
    if (f.kind === "select") item[f.key] = f.options[0]?.value;
    else if (f.kind === "text" || f.kind === "textarea" || f.kind === "url") if (f.required) item[f.key] = "";
  }
  return item;
}

export function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-ink/5 hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="justify-self-start rounded-full border border-dashed border-accent/60 px-4 py-1.5 font-heading text-xs text-accent hover:bg-sand">
      + {children}
    </button>
  );
}
