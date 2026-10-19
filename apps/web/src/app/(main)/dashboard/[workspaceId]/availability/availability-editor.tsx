"use client";

import { PutAvailabilityInput, type AvailabilityDto } from "@tashkeel/contracts";
import { cx } from "@tashkeel/ui";
import { useMemo, useState, useTransition } from "react";
import { TIMEZONES, tzLabel } from "@/lib/timezones";
import { useTzOffsets } from "@/lib/use-tz-offsets";
import { saveAvailability } from "../services/actions";

type Locale = "ar" | "en";
type Win = { startLocal: string; endLocal: string };

const DAYS = {
  ar: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

const T = {
  ar: {
    tz: "منطقتك الزمنية", tzHint: "تُفسَّر كل الأوقات أدناه بهذه المنطقة، ويراها عملاؤك بتوقيتهم المحلي.",
    weekly: "الأوقات الأسبوعية", unavailable: "غير متاح", addWindow: "إضافة فترة", remove: "حذف",
    overrides: "استثناءات لأيام محددة", overridesHint: "إجازة أو ساعات مختلفة لتاريخ بعينه.", addOverride: "إضافة استثناء",
    dayOff: "يوم إجازة", customHours: "ساعات مختلفة", save: "حفظ الأوقات", saved: "تم حفظ أوقاتك", invalid: "تحقق من الفترات: يجب أن تنتهي كل فترة بعد بدايتها ولا تتداخل الفترات",
    to: "إلى",
  },
  en: {
    tz: "Your timezone", tzHint: "All times below are in this zone; clients see them in their own local time.",
    weekly: "Weekly hours", unavailable: "Unavailable", addWindow: "Add hours", remove: "Remove",
    overrides: "Date exceptions", overridesHint: "A day off or different hours on a specific date.", addOverride: "Add exception",
    dayOff: "Day off", customHours: "Custom hours", save: "Save hours", saved: "Your hours are saved", invalid: "Check the hours: each must end after it starts, without overlaps",
    to: "to",
  },
};

const input = "rounded-xl border border-line bg-paper px-3 py-2 text-sm focus:border-accent focus:outline-none";

export function AvailabilityEditor({ initial, workspaceId, slug, locale }: { initial: AvailabilityDto; workspaceId: string; slug: string; locale: Locale }) {
  const t = T[locale];
  const [tz, setTz] = useState(initial.timezone);
  const [weekly, setWeekly] = useState<Win[][]>(() => DAYS.en.map((_, d) => initial.weekly.find((w) => w.weekday === d)?.windows ?? []));
  const [overrides, setOverrides] = useState(initial.overrides);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const payload = useMemo(
    () => ({ timezone: tz, weekly: weekly.map((windows, weekday) => ({ weekday, windows })).filter((d) => d.windows.length), overrides }),
    [tz, weekly, overrides],
  );
  const valid = PutAvailabilityInput.safeParse(payload).success;
  const zones = TIMEZONES.some((z) => z.id === tz) ? TIMEZONES : [{ id: tz, ar: tz, en: tz }, ...TIMEZONES];
  const offset = useTzOffsets(zones.map((z) => z.id));

  const setDay = (d: number, ws: Win[]) => setWeekly((all) => all.map((x, i) => (i === d ? ws : x)));
  const save = () =>
    start(async () => {
      if (!valid) return setStatus({ ok: false, text: t.invalid });
      const r = await saveAvailability(workspaceId, slug, PutAvailabilityInput.parse(payload));
      setStatus(r.ok ? { ok: true, text: t.saved } : { ok: false, text: r.error });
    });

  return (
    <div className="grid gap-8">
      <section className="rounded-[18px] border border-line bg-paper p-6">
        <label className="grid max-w-md gap-1.5">
          <span className="font-heading text-sm">{t.tz}</span>
          <select value={tz} onChange={(e) => setTz(e.target.value)} className={input}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {tzLabel(z.id, locale)}
                {offset(z.id)}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">{t.tzHint}</span>
        </label>
      </section>

      <section className="rounded-[18px] border border-line bg-paper">
        <h2 className="border-b border-line px-6 py-4 font-heading font-semibold">{t.weekly}</h2>
        <ul className="divide-y divide-line">
          {weekly.map((wins, d) => (
            <li key={d} className="grid gap-3 px-6 py-4 sm:grid-cols-[9rem_1fr] sm:items-start">
              <label className="flex items-center gap-2 pt-2 font-heading text-sm">
                <input type="checkbox" checked={wins.length > 0} onChange={(e) => setDay(d, e.target.checked ? [{ startLocal: "09:00", endLocal: "17:00" }] : [])} />
                {DAYS[locale][d]}
              </label>
              <div className="grid gap-2">
                {wins.length === 0 && <span className="pt-2 text-sm text-muted">{t.unavailable}</span>}
                {wins.map((w, i) => (
                  <WindowRow key={i} w={w} to={t.to} removeLabel={t.remove} onChange={(nw) => setDay(d, wins.map((x, j) => (j === i ? nw : x)))} onRemove={() => setDay(d, wins.filter((_, j) => j !== i))} />
                ))}
                {wins.length > 0 && wins.length < 6 && (
                  <button type="button" onClick={() => setDay(d, [...wins, nextWindow(wins)])} className="justify-self-start font-heading text-xs text-accent">
                    + {t.addWindow}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[18px] border border-line bg-paper">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-heading font-semibold">{t.overrides}</h2>
          <p className="text-xs text-muted">{t.overridesHint}</p>
        </div>
        <ul className="divide-y divide-line">
          {overrides.map((o, i) => (
            <li key={i} className="grid gap-3 px-6 py-4 sm:grid-cols-[12rem_1fr_auto] sm:items-start">
              <input type="date" value={o.date} dir="ltr" onChange={(e) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} className={input} />
              <div className="grid gap-2">
                <div className="flex gap-2">
                  {[true, false].map((off) => (
                    <button key={String(off)} type="button" onClick={() => setOverrides(overrides.map((x, j) => (j === i ? { ...x, windows: off ? [] : [{ startLocal: "10:00", endLocal: "14:00" }] } : x)))} className={cx("rounded-full border px-3 py-1 font-heading text-xs", (o.windows.length === 0) === off ? "border-accent bg-sand" : "border-line")}>
                      {off ? t.dayOff : t.customHours}
                    </button>
                  ))}
                </div>
                {o.windows.map((w, k) => (
                  <WindowRow key={k} w={w} to={t.to} removeLabel={t.remove} onChange={(nw) => setOverrides(overrides.map((x, j) => (j === i ? { ...x, windows: x.windows.map((y, m) => (m === k ? nw : y)) } : x)))} onRemove={() => setOverrides(overrides.map((x, j) => (j === i ? { ...x, windows: x.windows.filter((_, m) => m !== k) } : x)))} />
                ))}
              </div>
              <button type="button" onClick={() => setOverrides(overrides.filter((_, j) => j !== i))} className="font-heading text-xs text-muted hover:text-ink">{t.remove}</button>
            </li>
          ))}
        </ul>
        <div className="px-6 py-4">
          <button type="button" onClick={() => setOverrides([...overrides, { date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), windows: [] }])} className="font-heading text-sm text-accent">
            + {t.addOverride}
          </button>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button type="button" disabled={pending} onClick={save} className="rounded-full bg-ink px-7 py-3 font-heading text-sm text-paper disabled:opacity-60">{t.save}</button>
        {status && <span role="status" className={cx("text-sm", status.ok ? "text-emerald-800" : "text-red-700")}>{status.text}</span>}
        {!status && !valid && <span className="text-sm text-red-700">{t.invalid}</span>}
      </div>
    </div>
  );
}

function WindowRow({ w, to, removeLabel, onChange, onRemove }: { w: Win; to: string; removeLabel: string; onChange: (w: Win) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="time" step={900} value={w.startLocal} dir="ltr" onChange={(e) => onChange({ ...w, startLocal: e.target.value })} className={input} />
      <span className="text-sm text-muted">{to}</span>
      <input type="time" step={900} value={w.endLocal} dir="ltr" onChange={(e) => onChange({ ...w, endLocal: e.target.value })} className={input} />
      <button type="button" aria-label={removeLabel} onClick={onRemove} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-ink/5">×</button>
    </div>
  );
}

/** A sensible next window after the last one on the same day. */
function nextWindow(wins: Win[]): Win {
  const last = wins.at(-1)?.endLocal ?? "09:00";
  const [h] = last.split(":").map(Number) as [number];
  const start = Math.min(h + 1, 22);
  return { startLocal: `${String(start).padStart(2, "0")}:00`, endLocal: `${String(Math.min(start + 2, 23)).padStart(2, "0")}:00` };
}
