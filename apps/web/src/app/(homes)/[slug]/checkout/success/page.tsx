import { formatMoney } from "@tashkeel/core";
import { ButtonLink, LogoMark } from "@tashkeel/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchOrderStatus } from "@/lib/api";
import { getLocale } from "@/lib/locale";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ order?: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false } };

/**
 * Stripe redirects here before (or after) the webhook settles the order, so "pending" is a
 * normal state: the page refreshes itself until the order is confirmed.
 */
export default async function CheckoutSuccess({ params, searchParams }: Props) {
  const [{ slug }, { order: orderId }] = await Promise.all([params, searchParams]);
  if (!orderId) notFound();
  const order = await fetchOrderStatus(orderId);
  if (!order || order.workspace.slug !== slug) notFound();
  const ar = (await getLocale()) === "ar";
  const paid = order.status === "PAID";
  const pending = order.status === "PENDING";

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-16">
      {pending && <meta httpEquiv="refresh" content="3" />}
      <div className="w-full max-w-md text-center">
        <LogoMark size={44} className="mx-auto" />
        <h1 className="mt-8 font-display text-3xl leading-snug">
          {paid ? (ar ? "تمّ الدفع بنجاح" : "Payment confirmed") : pending ? (ar ? "نؤكد دفعتك…" : "Confirming your payment…") : ar ? "لم تكتمل عملية الدفع" : "Payment not completed"}
        </h1>
        <p className="mt-4 text-muted">
          {paid
            ? ar
              ? "أرسلنا إيصالاً وتفاصيل الوصول إلى بريدك الإلكتروني."
              : "We've emailed your receipt and access details."
            : pending
              ? ar
                ? "قد يستغرق ذلك بضع ثوانٍ. ستتحدّث الصفحة تلقائياً."
                : "This can take a few seconds. The page refreshes automatically."
              : ar
                ? "لم يتم خصم أي مبلغ. يمكنك المحاولة مرة أخرى."
                : "You were not charged. You can try again."}
        </p>
        <div className="mt-8 rounded-[14px] border border-line bg-sand p-5 text-start">
          {order.items.map((i) => (
            <p key={i.title} className="font-heading">{i.title}</p>
          ))}
          <p className="mt-1 text-sm text-muted">{formatMoney(BigInt(order.amountMinor), order.currency, { locale: ar ? "ar" : "en" })} · {order.workspace.name}</p>
        </div>
        <ButtonLink href={`/${order.workspace.slug}`} variant="secondary" className="mt-8">
          {ar ? `العودة إلى ${order.workspace.name}` : `Back to ${order.workspace.name}`}
        </ButtonLink>
      </div>
    </main>
  );
}
