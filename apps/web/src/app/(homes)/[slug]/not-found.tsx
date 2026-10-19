import { ButtonLink, LogoMark } from "@tashkeel/ui";

export default function HomeNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <LogoMark size={48} />
      <h1 className="font-display text-3xl">لم نجد هذه الصفحة</h1>
      <ButtonLink href="/" variant="secondary">العودة إلى الرئيسية</ButtonLink>
    </main>
  );
}
