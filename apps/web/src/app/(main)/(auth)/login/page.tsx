import { getDictionary } from "@tashkeel/i18n";
import type { Metadata } from "next";
import { getLocale } from "@/lib/locale";
import { login } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "تسجيل الدخول", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const d = getDictionary(await getLocale());
  const t = d.auth;
  const { next } = await searchParams;
  return (
    <>
      <h1 className="mb-8 font-display text-3xl">{t.loginTitle}</h1>
      <AuthForm
        action={login}
        hidden={next ? { next } : undefined}
        fields={[
          { name: "email", label: t.email, type: "email", dir: "ltr", autoComplete: "email" },
          { name: "password", label: t.password, type: "password", dir: "ltr", autoComplete: "current-password" },
        ]}
        submit={t.login}
        footer={
          <p className="text-center text-sm text-muted">
            {t.noAccount}{" "}
            <a href="/#waitlist" className="text-accent underline-offset-4 hover:underline">{d.nav.join}</a>
          </p>
        }
      />
    </>
  );
}
