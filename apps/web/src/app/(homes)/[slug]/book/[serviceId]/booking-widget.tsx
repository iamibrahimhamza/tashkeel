"use client";

import { SlotsResponse, type PublicServicePage, type Slot } from "@tashkeel/contracts";
import { formatMoney } from "@tashkeel/core/money";
import { cx } from "@tashkeel/ui";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { TIMEZONES, tzLabel } from "@/lib/timezones";
import { useTzOffsets } from "@/lib/use-tz-offsets";
import { holdSlot } from "./actions";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Locale = "ar" | "en";

const T = {
  ar: {
    pickDay: "اختر يوماً", pickTime: "اختر وقتاً", noTimes: "لا توجد أوقات متاحة في هذا اليوم", noMonth: "لا توجد أوقات متاحة في هذا الشهر",
    tz: "تظهر الأوقات بتوقيت", change: "تغيير", prev: "الشهر السابق", next: "الشهر التالي", loading: "جارٍ تحميل الأوقات…",
    details: "بياناتك", name: "الاسم", email: "البريد الإلكتروني", phone: "الهاتف (اختياري)", notes: "ما الذي تودّ مناقشته؟ (اختياري)",
    back: "تغيير الموعد", confirm: "تأكيد الحجز والدفع", confirmFree: "تأكيد الحجز", holding: "جارٍ حجز الموعد…",
    hold: "نحجز لك هذا الموعد 10 دقائق لإتمام الدفع.", expertTime: "بتوقيت الخبير", min: "دقيقة", free: "مجاناً",
    retry: "اختر وقتاً آخر", loadError: "تعذّر تحميل الأوقات، حدّث الصفحة",
  },
  en: {
    pickDay: "Pick a day", pickTime: "Pick a time", noTimes: "No times available on this day", noMonth: "No times available this month",
    tz: "Times shown in", change: "Change", prev: "Previous month", next: "Next month", loading: "Loading times…",
    details: "Your details", name: "Name", email: "Email", phone: "Phone (optional)", notes: "What would you like to discuss? (optional)",
    back: "Change time", confirm: "Confirm and pay", confirmFree: "Confirm booking", holding: "Holding your time…",
    hold: "We hold this time for 10 minutes while you pay.", expertTime: "expert's time", min: "min", free: "Free",
    retry: "Pick another time", loadError: "Could not load times, refresh the page",
  },
};

const WEEKDAYS = { ar: ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };

/** "YYYY-MM-DD" helpers on plain calendar dates (timezone-free). */
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

export function BookingWidget({ page, idempotencyKey }: { page: PublicServicePage; idempotencyKey: string }) {
  const locale: Locale = "ar";
  const t = T[locale];
  const { service, workspace } = page;

  // Start in the expert's zone (matches the server render), then switch to the visitor's own.
  const [tz, setTz] = useState(workspace.timezone);
  const [tzOpen, setTzOpen] = useState(false);
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) setTz(detected);
  }, []);

  const zones = TIMEZONES.some((z) => z.id === tz) ? TIMEZONES : [{ id: tz, ar: tz, en: tz }, ...TIMEZONES];
  const offset = useTzOffsets(zones.map((z) => z.id));
  const today = todayIn(tz);
  const [month, setMonth] = useState(() => today.slice(0, 7)); // "YYYY-MM"
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const lastBookable = useMemo(() => new Date(Date.now() + service.maxAdvanceDays * 86_400_000).toISOString().slice(0, 7), [service.maxAdvanceDays]);

  const load = useCallback(async () => {
    setSlots(null);
    setLoadError(false);
    const [y, m] = month.split("-").map(Number) as [number, number];
    const from = ymd(y, m - 1, 1);
    const to = ymd(y, m - 1, new Date(Date.UTC(y, m, 0)).getUTCDate());
    try {
      const res = await fetch(`${API}/v1/public/homes/${workspace.slug}/services/${service.id}/slots?from=${from}&to=${to}&tz=${encodeURIComponent(tz)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setSlots(SlotsResponse.parse(await res.json()).slots);
    } catch {
      setLoadError(true);
      setSlots([]);
    }
  }, [month, tz, workspace.slug, service.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots ?? []) m.set(s.localDate, [...(m.get(s.localDate) ?? []), s]);
    return m;
  }, [slots]);

  // Keep the selection valid when the month or timezone changes.
  useEffect(() => {
    setSlot(null);
    setDay((d) => (d && byDay.has(d) ? d : ([...byDay.keys()].sort()[0] ?? null)));
  }, [byDay]);

  // 24-hour clock: AM/PM markers break the ordering of time ranges inside right-to-left text.
  const timeFmt = (iso: string, zone: string) => new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(new Date(iso));
  const dayFmt = (iso: string, zone: string) => new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { weekday: "long", day: "numeric", month: "long", timeZone: zone }).format(new Date(iso));
  const monthLabel = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const price = service.priceMinor === "0" ? t.free : formatMoney(BigInt(service.priceMinor), service.currency, { locale });

  const shiftMonth = (d: number) => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const n = new Date(Date.UTC(y, m - 1 + d, 1));
    setMonth(n.toISOString().slice(0, 7));
  };

  const submit = (form: FormData) =>
    start(async () => {
      if (!slot) return;
      const r = await holdSlot({
        slug: workspace.slug,
        serviceId: service.id,
        startsAt: slot.startsAt,
        customerTz: tz,
        customer: { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), phone: String(form.get("phone") ?? "") || undefined },
        notes: String(form.get("notes") ?? "") || undefined,
        idempotencyKey: `${idempotencyKey}:${slot.startsAt}`,
        locale,
      });
      if (r.ok) return window.location.assign(r.redirectTo);
      setError(r.error);
      if (r.slotTaken) {
        setSlot(null);
        void load();
      }
    });

  // ── Calendar grid ──
  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<string | null> = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => ymd(y, m - 1, i + 1))];

  if (slot) {
    return (
      <div className="rounded-[var(--radius)] border border-line bg-paper p-6 sm:p-8">
        <button type="button" onClick={() => { setSlot(null); setError(null); }} className="font-heading text-sm text-muted hover:text-ink">→ {t.back}</button>
        <div className="mt-5 rounded-[calc(var(--radius)/1.5)] bg-sand p-5">
          <p className="font-heading text-lg">{dayFmt(slot.startsAt, tz)}</p>
          <p className="mt-1 font-display text-2xl" dir="ltr" style={{ textAlign: "end" }}>{timeFmt(slot.startsAt, tz)} – {timeFmt(slot.endsAt, tz)}</p>
          <p className="mt-2 text-xs text-muted">
            {tzLabel(tz, locale)} · {timeFmt(slot.startsAt, workspace.timezone)} {t.expertTime} ({tzLabel(workspace.timezone, locale)})
          </p>
        </div>
        <form action={submit} className="mt-6 grid gap-4">
          <h3 className="font-heading font-semibold">{t.details}</h3>
          <Field name="name" label={t.name} required autoComplete="name" />
          <Field name="email" label={t.email} type="email" required dir="ltr" autoComplete="email" />
          <Field name="phone" label={t.phone} type="tel" dir="ltr" autoComplete="tel" />
          <label className="grid gap-1.5 text-sm">
            <span className="font-heading text-xs text-muted">{t.notes}</span>
            <textarea name="notes" rows={3} maxLength={1000} className="rounded-xl border border-line bg-paper px-4 py-3 leading-7 focus:border-accent focus:outline-none" />
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
          <button disabled={pending} className="rounded-full bg-ink py-3.5 font-heading font-medium text-paper transition hover:opacity-90 disabled:opacity-60">
            {pending ? t.holding : service.priceMinor === "0" ? t.confirmFree : `${t.confirm} · ${price}`}
          </button>
          {service.priceMinor !== "0" && <p className="text-center text-xs text-muted">{t.hold}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius)] border border-line bg-paper p-5 sm:p-7">
      {/* Timezone */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{t.tz}</span>
        <span className="font-heading">
          {tzLabel(tz, locale)}
          {offset(tz)}
        </span>
        <button type="button" onClick={() => setTzOpen((o) => !o)} className="font-heading text-accent">{t.change}</button>
        {tzOpen && (
          <select
            autoFocus
            value={tz}
            onChange={(e) => {
              setTz(e.target.value);
              setTzOpen(false);
            }}
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 sm:w-auto"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {tzLabel(z.id, locale)}
                {offset(z.id)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
        {/* Calendar */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <button type="button" aria-label={t.prev} disabled={month <= today.slice(0, 7)} onClick={() => shiftMonth(-1)} className="grid size-9 place-items-center rounded-full border border-line disabled:opacity-30">→</button>
            <p className="font-heading">{monthLabel}</p>
            <button type="button" aria-label={t.next} disabled={month >= lastBookable} onClick={() => shiftMonth(1)} className="grid size-9 place-items-center rounded-full border border-line disabled:opacity-30">←</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS[locale].map((w) => <span key={w} className="pb-2 text-xs text-muted">{w}</span>)}
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const has = byDay.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!has}
                  onClick={() => { setDay(d); setError(null); }}
                  aria-pressed={day === d}
                  className={cx(
                    "aspect-square rounded-full font-heading text-sm transition",
                    day === d ? "bg-ink text-paper" : has ? "bg-sand text-ink hover:bg-accent-soft" : "text-muted/40",
                    d === today && day !== d && "ring-1 ring-accent",
                  )}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
          {slots === null && <p className="mt-4 text-sm text-muted">{t.loading}</p>}
          {slots !== null && byDay.size === 0 && <p className="mt-4 text-sm text-muted">{loadError ? t.loadError : t.noMonth}</p>}
        </div>

        {/* Times */}
        <div>
          <p className="mb-3 font-heading text-sm">{day ? dayFmt(`${day}T12:00:00Z`, "UTC") : t.pickDay}</p>
          {day && !byDay.get(day)?.length && <p className="text-sm text-muted">{t.noTimes}</p>}
          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
            {(day ? byDay.get(day) ?? [] : []).map((s) => (
              <button key={s.startsAt} type="button" onClick={() => setSlot(s)} className="rounded-xl border border-line py-2.5 font-heading text-sm transition hover:border-accent hover:bg-sand" dir="ltr">
                {timeFmt(s.startsAt, tz)}
              </button>
            ))}
          </div>
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error} — {t.retry}</p>}
        </div>
      </div>
    </div>
  );
}

function Field({ name, label, type = "text", required, dir, autoComplete }: { name: string; label: string; type?: string; required?: boolean; dir?: "ltr"; autoComplete?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-heading text-xs text-muted">{label}</span>
      <input name={name} type={type} required={required} dir={dir} autoComplete={autoComplete} className="rounded-xl border border-line bg-paper px-4 py-3 focus:border-accent focus:outline-none" />
    </label>
  );
}
