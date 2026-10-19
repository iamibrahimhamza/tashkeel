"use client";

import type { PublicHome } from "@tashkeel/contracts";
import { cx, themeStyle } from "@tashkeel/ui";
import { BlockView } from "@tashkeel/ui/blocks";
import { useEffect, useState } from "react";

export type PreviewMessage = { type: "tashkeel:preview"; home: PublicHome; selectedId: string | null; locale: "ar" | "en" };
export type SelectMessage = { type: "tashkeel:select"; id: string };

/**
 * Renders the builder's unsaved draft. Runs inside an iframe so media queries see the
 * preview's own width (real mobile vs desktop layout). Accepts messages from its own origin only.
 */
export function PreviewFrame() {
  const [state, setState] = useState<PreviewMessage | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const msg = e.data as PreviewMessage;
      if (msg?.type === "tashkeel:preview") setState(msg);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "tashkeel:ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!state?.selectedId) return;
    document.getElementById(`block-${state.selectedId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state?.selectedId]);

  if (!state) return null;
  const ctx = { home: state.home, locale: state.locale, editing: true, href: (p: string) => `/${state.home.workspace.slug}${p}` };
  const select = (id: string) => window.parent.postMessage({ type: "tashkeel:select", id } satisfies SelectMessage, window.location.origin);

  return (
    <div style={themeStyle(state.home.theme)} className="min-h-dvh">
      {state.home.blocks.map((b) => (
        <div
          key={b.id}
          id={`block-${b.id}`}
          // Links inside the preview must not navigate away from the builder.
          onClickCapture={(e) => {
            e.preventDefault();
            select(b.id);
          }}
          className={cx("relative cursor-pointer outline-offset-[-2px] transition", b.id === state.selectedId ? "outline outline-2 outline-[#A98B4C]" : "hover:outline hover:outline-1 hover:outline-[#A98B4C]/50", b.hidden && "opacity-40")}
        >
          <BlockView block={{ ...b, hidden: false }} ctx={ctx} />
        </div>
      ))}
    </div>
  );
}
