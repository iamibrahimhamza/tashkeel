import { getDictionary } from "@tashkeel/i18n";
import { intlLocale } from "@tashkeel/core";
import { Logo } from "@tashkeel/ui";
import type { Metadata } from "next";
import { fetchDownloadPage } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { DownloadButton, ResendForm } from "./client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Downloads", robots: { index: false, follow: false }, referrer: "no-referrer" };

const size = (bytes: string) => {
  const n = Number(bytes);
  return n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};

/** The buyer's private download page, opened from the purchase email. No account needed. */
export default async function Downloads({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await getLocale();
  const t = getDictionary(locale).downloads;
  const result = await fetchDownloadPage(token);

  return (
    <main className="min-h-dvh bg-sand">
      <div className="mx-auto max-w-xl px-4 py-12">
        <Logo className="mb-10" />
        <div className="rounded-[18px] border border-line bg-paper p-7 shadow-[0_30px_80px_-50px_rgba(25,34,30,.5)]">
          {"page" in result ? (
            <>
              <h1 className="font-display text-2xl">{t.title}</h1>
              <p className="mt-2 text-muted">
                {result.page.product.title} · {t.from} {result.page.expert.name}
              </p>
              <ul className="my-6 divide-y divide-line rounded-xl border border-line">
                {result.page.files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                    <span className="min-w-0">
                      <span className="block break-all text-sm font-heading">{f.fileName}</span>
                      <span className="text-xs text-muted" dir="ltr">{size(f.sizeBytes)}</span>
                    </span>
                    {result.page.downloadsLeft > 0 && <DownloadButton token={token} fileId={f.id} label={t.download} busyLabel={t.preparing} />}
                  </li>
                ))}
              </ul>
              <dl className="grid gap-1.5 text-sm text-muted">
                <div className="flex justify-between gap-4">
                  <dt>{t.left}</dt>
                  <dd className="font-heading text-ink">{result.page.downloadsLeft}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>{t.until}</dt>
                  <dd className="font-heading text-ink">{new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(result.page.expiresAt))}</dd>
                </div>
              </dl>
              <p className="mt-6 text-xs leading-6 text-muted">{t.keep}</p>
              {result.page.downloadsLeft === 0 && (
                <div className="mt-6 border-t border-line pt-6">
                  <h2 className="font-heading font-semibold">{t.resendTitle}</h2>
                  <p className="mb-4 mt-1 text-sm leading-7 text-muted">{t.resendBody}</p>
                  <ResendForm labels={t} />
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl">{t[result.problem]}</h1>
              <p className="mb-5 mt-3 text-sm leading-7 text-muted">{t.resendBody}</p>
              <ResendForm labels={t} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
