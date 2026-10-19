import { getDictionary } from "@tashkeel/i18n";
import { ButtonLink, LogoMark } from "@tashkeel/ui";
import { getLocale } from "@/lib/locale";

export default async function NotFound() {
  const t = getDictionary(await getLocale());
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <LogoMark size={48} />
      <h1 className="font-display text-3xl">{t.home.notFound}</h1>
      <ButtonLink href="/" variant="secondary">{t.home.back}</ButtonLink>
    </main>
  );
}
