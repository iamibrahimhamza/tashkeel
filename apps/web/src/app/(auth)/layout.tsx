import { Logo } from "@tashkeel/ui";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-sand px-4 py-12">
      <div className="w-full max-w-md">
        <a href="/" className="mb-10 inline-block">
          <Logo />
        </a>
        <div className="rounded-[18px] border border-line bg-paper p-8">{children}</div>
      </div>
    </main>
  );
}
