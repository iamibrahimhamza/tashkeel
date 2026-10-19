import { getDictionary } from "@tashkeel/i18n";
import type { Metadata } from "next";
import { getLocale } from "@/lib/locale";
import { signup } from "../actions";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "إنشاء حساب" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const d = getDictionary(await getLocale());
  const t = d.auth;
  const { slug } = await searchParams;
  return (
    <>
      <h1 className="mb-8 font-display text-3xl">{t.signupTitle}</h1>
      <AuthForm
        action={signup}
        fields={[
          { name: "slug", label: t.slug, dir: "ltr", prefix: d.hero.slugPrefix, ...(slug ? { defaultValue: slug } : {}) },
          { name: "name", label: t.name, autoComplete: "name" },
          { name: "email", label: t.email, type: "email", dir: "ltr", autoComplete: "email" },
          { name: "password", label: t.password, type: "password", dir: "ltr", autoComplete: "new-password", hint: t.passwordHint },
        ]}
        submit={t.signup}
        footer={
          <p className="text-center text-sm text-muted">
            {t.haveAccount}{" "}
            <a href="/login" className="text-accent underline-offset-4 hover:underline">{t.login}</a>
          </p>
        }
      />
    </>
  );
}
