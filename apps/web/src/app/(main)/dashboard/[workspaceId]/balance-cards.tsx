import type { Balance } from "@tashkeel/contracts";
import type { Dictionary } from "@tashkeel/i18n";
import { dateTime, money, StatCard } from "@/components/dash";

/** Balance per currency. A brand-new workspace shows honest zeros in its own currency. */
export function BalanceCards({ balances, currency, t, locale }: { balances: Balance[]; currency: string; t: Dictionary; locale: "ar" | "en" }) {
  const list = balances.length ? balances : [{ currency, pendingMinor: "0", availableMinor: "0", inTransitMinor: "0", nextReleaseAt: null }];
  const b = t.dash.balance;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {list.map((x) => (
        <div key={x.currency} className="contents">
          <StatCard tone="forest" label={b.available} value={money(x.availableMinor, x.currency, locale)} />
          <StatCard label={b.pending} value={money(x.pendingMinor, x.currency, locale)} hint={x.nextReleaseAt ? `${b.nextRelease} ${dateTime(x.nextReleaseAt, locale)}` : b.pendingHint} />
          <StatCard label={b.inTransit} value={money(x.inTransitMinor, x.currency, locale)} />
        </div>
      ))}
    </div>
  );
}
