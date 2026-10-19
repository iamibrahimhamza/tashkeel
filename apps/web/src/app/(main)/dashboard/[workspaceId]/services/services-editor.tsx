"use client";

import type { ServiceDto } from "@tashkeel/contracts";
import { formatMoney } from "@tashkeel/core/money";
import { cx } from "@tashkeel/ui";
import { useState, useTransition } from "react";
import { saveService, type ServiceForm } from "./actions";

type Locale = "ar" | "en";

const T = {
  ar: {
    add: "إضافة خدمة", edit: "تعديل", save: "حفظ الخدمة", cancel: "إلغاء", saved: "تم الحفظ",
    title: "اسم الخدمة", description: "الوصف", duration: "المدة", bufferBefore: "استراحة قبل الجلسة", bufferAfter: "استراحة بعد الجلسة",
    price: "السعر (دولار أمريكي)", location: "طريقة الجلسة", minNotice: "أقل مدة للحجز المسبق (ساعات)", maxAdvance: "أقصى مدة للحجز المسبق (أيام)",
    active: "متاحة للحجز", inactive: "غير متاحة", min: "دقيقة", free: "مجاناً", none: "لا خدمات بعد",
    noneBody: "أضف خدمتك الاستشارية الأولى: مدتها وسعرها ومتى يمكن حجزها. تظهر تلقائياً في صفحتك.",
    VIDEO: "مكالمة فيديو", IN_PERSON: "حضورياً", PHONE: "مكالمة هاتفية", bookingLink: "رابط الحجز",
  },
  en: {
    add: "Add service", edit: "Edit", save: "Save service", cancel: "Cancel", saved: "Saved",
    title: "Service name", description: "Description", duration: "Duration", bufferBefore: "Break before", bufferAfter: "Break after",
    price: "Price (USD)", location: "Format", minNotice: "Minimum notice (hours)", maxAdvance: "Book up to (days ahead)",
    active: "Bookable", inactive: "Paused", min: "min", free: "Free", none: "No services yet",
    noneBody: "Add your first consultation: its length, price and how far ahead it can be booked. It appears on your page automatically.",
    VIDEO: "Video call", IN_PERSON: "In person", PHONE: "Phone call", bookingLink: "Booking link",
  },
};

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120, 180, 240];
const BUFFERS = [0, 5, 10, 15, 30, 45, 60];

const empty: ServiceForm = { title: "", description: "", durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 15, price: "", locationType: "VIDEO", minNoticeHours: 12, maxAdvanceDays: 60, isActive: true };

function fromDto(s: ServiceDto): ServiceForm {
  return {
    title: s.title,
    description: s.description ?? "",
    durationMin: s.durationMin,
    bufferBeforeMin: s.bufferBeforeMin,
    bufferAfterMin: s.bufferAfterMin,
    price: (Number(s.priceMinor) / 100).toString(),
    locationType: s.locationType,
    minNoticeHours: s.minNoticeMin / 60,
    maxAdvanceDays: s.maxAdvanceDays,
    isActive: s.isActive,
  };
}

const input = "w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm focus:border-accent focus:outline-none";

export function ServicesEditor({ services, workspaceId, slug, locale }: { services: ServiceDto[]; workspaceId: string; slug: string; locale: Locale }) {
  const t = T[locale];
  const [editing, setEditing] = useState<string | "new" | null>(services.length ? null : "new");

  return (
    <div className="grid gap-4">
      {services.map((s) =>
        editing === s.id ? (
          <ServiceFormCard key={s.id} initial={fromDto(s)} serviceId={s.id} workspaceId={workspaceId} slug={slug} locale={locale} onDone={() => setEditing(null)} />
        ) : (
          <article key={s.id} className={cx("flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-line bg-paper p-6", !s.isActive && "opacity-60")}>
            <div>
              <h3 className="font-heading text-lg font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">
                {s.durationMin} {t.min} · {t[s.locationType]} · {s.priceMinor === "0" ? t.free : formatMoney(BigInt(s.priceMinor), s.currency, { locale })} · {s.isActive ? t.active : t.inactive}
              </p>
              <a href={`/${slug}/book/${s.id}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent" dir="ltr">
                {t.bookingLink}: /{slug}/book/{s.id}
              </a>
            </div>
            <button type="button" onClick={() => setEditing(s.id)} className="rounded-full border border-ink/20 px-4 py-2 font-heading text-sm hover:border-ink/50">{t.edit}</button>
          </article>
        ),
      )}

      {editing === "new" ? (
        <ServiceFormCard initial={empty} serviceId={null} workspaceId={workspaceId} slug={slug} locale={locale} onDone={() => setEditing(null)} canCancel={services.length > 0} />
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="justify-self-start rounded-full border border-dashed border-accent/60 px-5 py-2.5 font-heading text-sm text-accent hover:bg-sand">
          + {t.add}
        </button>
      )}

      {services.length === 0 && editing !== "new" && (
        <p className="text-sm text-muted">
          {t.none}. {t.noneBody}
        </p>
      )}
    </div>
  );
}

function ServiceFormCard({ initial, serviceId, workspaceId, slug, locale, onDone, canCancel = true }: { initial: ServiceForm; serviceId: string | null; workspaceId: string; slug: string; locale: Locale; onDone: () => void; canCancel?: boolean }) {
  const t = T[locale];
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ServiceForm>(k: K, v: ServiceForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = () =>
    start(async () => {
      const r = await saveService(workspaceId, slug, serviceId, f);
      if (!r.ok) return setError(r.error);
      setError(null);
      onDone();
    });

  return (
    <form
      className="grid gap-4 rounded-[18px] border border-accent/50 bg-paper p-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {!serviceId && <p className="font-heading text-sm text-muted">{t.add}</p>}
      <label className="grid gap-1.5 text-sm">
        <span className="font-heading text-xs text-muted">{t.title}</span>
        <input required minLength={2} maxLength={120} value={f.title} onChange={(e) => set("title", e.target.value)} className={input} />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="font-heading text-xs text-muted">{t.description}</span>
        <textarea rows={3} maxLength={2000} value={f.description} onChange={(e) => set("description", e.target.value)} className={cx(input, "leading-7")} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <Select label={t.duration} value={f.durationMin} options={DURATIONS.map((d) => [d, `${d} ${t.min}`])} onChange={(v) => set("durationMin", v)} />
        <Select label={t.bufferBefore} value={f.bufferBeforeMin} options={BUFFERS.map((d) => [d, `${d} ${t.min}`])} onChange={(v) => set("bufferBeforeMin", v)} />
        <Select label={t.bufferAfter} value={f.bufferAfterMin} options={BUFFERS.map((d) => [d, `${d} ${t.min}`])} onChange={(v) => set("bufferAfterMin", v)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-heading text-xs text-muted">{t.price}</span>
          <input required inputMode="decimal" pattern="\d+(\.\d{1,2})?" dir="ltr" placeholder="0" value={f.price} onChange={(e) => set("price", e.target.value)} className={input} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-heading text-xs text-muted">{t.location}</span>
          <select value={f.locationType} onChange={(e) => set("locationType", e.target.value as ServiceForm["locationType"])} className={input}>
            {(["VIDEO", "IN_PERSON", "PHONE"] as const).map((l) => <option key={l} value={l}>{t[l]}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-heading text-xs text-muted">{t.minNotice}</span>
          <input type="number" min={0} max={336} dir="ltr" value={f.minNoticeHours} onChange={(e) => set("minNoticeHours", Number(e.target.value))} className={input} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-heading text-xs text-muted">{t.maxAdvance}</span>
          <input type="number" min={1} max={365} dir="ltr" value={f.maxAdvanceDays} onChange={(e) => set("maxAdvanceDays", Number(e.target.value))} className={input} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} />
        {t.active}
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className="rounded-full bg-ink px-6 py-2.5 font-heading text-sm text-paper disabled:opacity-60">{t.save}</button>
        {canCancel && (
          <button type="button" onClick={onDone} className="rounded-full px-4 py-2.5 font-heading text-sm text-muted hover:text-ink">{t.cancel}</button>
        )}
      </div>
    </form>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: number; options: Array<[number, string]>; onChange: (v: number) => void }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-heading text-xs text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={input}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
