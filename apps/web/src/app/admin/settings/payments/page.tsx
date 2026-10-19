import type { PaymentSettings } from "@tashkeel/contracts";
import { cx } from "@tashkeel/ui";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/dash";
import { api, ApiRequestError } from "@/lib/api";
import { getLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Super Admin: how Tashkeel Pay is wired. Shows which keys are present (never their values)
 * and exactly what to paste into .env when connecting the live Stripe account.
 */
export default async function PaymentSettingsPage() {
  const { token, me } = await requireSession("/admin/settings/payments");
  if (me.platformRole !== "SUPERADMIN") notFound();
  let s: PaymentSettings;
  try {
    s = await api<PaymentSettings>("/v1/admin/settings/payments", { token });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 403) notFound();
    throw e;
  }
  const ar = (await getLocale()) === "ar";
  // The publishable key belongs to the web app's environment, so the web app checks it itself.
  const keys = [
    ...s.keys,
    { name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", isSet: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, where: "web" as const, purpose: "Reserved for embedded Stripe Elements; hosted Checkout works without it" },
  ];
  const sandbox = s.mode === "sandbox";

  return (
    <>
      <PageHeader title={ar ? "إعدادات الدفع" : "Payment settings"} lead={ar ? "تشكيل باي · بوابة الدفع" : "Tashkeel Pay · payment gateway"} />

      <section className={cx("mb-8 rounded-[18px] p-6", sandbox ? "border border-amber-300 bg-amber-50" : "bg-forest text-[#FAF8F6]")}>
        <p className="font-heading text-sm">{ar ? "الوضع الحالي" : "Current mode"}</p>
        <p className="mt-1 font-display text-2xl">{sandbox ? (ar ? "تجريبي (Sandbox)" : "Sandbox") : "Stripe"}</p>
        <p className={cx("mt-2 text-sm leading-7", sandbox ? "text-amber-900" : "text-[#FAF8F6]/70")}>
          {sandbox
            ? ar
              ? "لا يوجد مفتاح Stripe حقيقي، لذلك يعمل الدفع عبر شاشة اعتماد محلية تمرّ بمسار تشكيل باي نفسه. لا تنتقل أي أموال حقيقية."
              : "No real Stripe key is set, so checkout uses a local approval screen that runs the same Tashkeel Pay pipeline. No real money moves."
            : ar
              ? "الدفع متصل بحساب Stripe. تأكد من ضبط عنوان استقبال الأحداث أدناه في لوحة Stripe."
              : "Payments are connected to Stripe. Make sure the webhook endpoint below is configured in the Stripe dashboard."}
        </p>
      </section>

      <Panel title={ar ? "متغيرات البيئة" : "Environment keys"}>
        <ul className="divide-y divide-line">
          {keys.map((k) => (
            <li key={k.name} className="grid gap-1 px-6 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <code className="font-mono text-sm" dir="ltr">{k.name}</code>
                <p className="text-xs text-muted" dir="ltr">
                  {k.where === "api" ? ".env · API" : ".env · Web"} — {k.purpose}
                </p>
              </div>
              <span className={cx("justify-self-start rounded-full px-3 py-1 font-heading text-xs sm:justify-self-end", k.isSet ? "bg-emerald-50 text-emerald-800" : "bg-ink/5 text-muted")}>
                {k.isSet ? (ar ? "مضبوط" : "Set") : ar ? "غير مضبوط" : "Not set"}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="mt-8" title={ar ? "خطوات ربط حساب Stripe" : "Connecting your Stripe account"}>
        <ol className="list-decimal space-y-4 px-6 py-6 ps-10 text-sm leading-7">
          <li>
            {ar ? "من لوحة Stripe ← Developers ← API keys، انسخ المفتاح السري وضعه في ملف .env:" : "In Stripe → Developers → API keys, copy the secret key into .env:"}
            <pre className="mt-2 overflow-x-auto rounded-xl bg-forest p-4 text-xs leading-6 text-[#FAF8F6]" dir="ltr">{`STRIPE_SECRET_KEY=sk_live_...        # sk_test_... while testing
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...   # optional for hosted Checkout`}</pre>
          </li>
          <li>
            {ar ? "أنشئ نقطة استقبال أحداث (Webhook endpoint) بهذا العنوان، ثم انسخ مفتاح التوقيع whsec_ إلى STRIPE_WEBHOOK_SECRET:" : "Create a webhook endpoint with this URL, then copy its whsec_ signing secret into STRIPE_WEBHOOK_SECRET:"}
            <pre className="mt-2 overflow-x-auto rounded-xl bg-sand p-4 text-xs" dir="ltr">{s.webhookUrl}</pre>
          </li>
          <li>
            {ar ? "اشترك في هذه الأحداث فقط:" : "Subscribe it to exactly these events:"}
            <pre className="mt-2 overflow-x-auto rounded-xl bg-sand p-4 text-xs leading-6" dir="ltr">{s.webhookEvents.join("\n")}</pre>
          </li>
          {s.plansMissingPriceId.length > 0 && (
            <li>
              {ar ? "أنشئ أسعاراً شهرية في Stripe للخطط التالية واربط معرّف السعر price_ بكل خطة:" : "Create monthly prices in Stripe for these plans and attach each price_ id to its plan:"}{" "}
              <code dir="ltr">{s.plansMissingPriceId.join(", ")}</code>
            </li>
          )}
          <li>{ar ? "أعد تشغيل الـ API. سيتحوّل الوضع تلقائياً من التجريبي إلى Stripe." : "Restart the API. The mode switches from Sandbox to Stripe automatically."}</li>
        </ol>
      </Panel>
    </>
  );
}
