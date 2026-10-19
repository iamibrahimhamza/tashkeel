import type { Metadata } from "next";
import { PreviewFrame } from "./frame";

export const metadata: Metadata = { title: "Preview", robots: { index: false } };

/** Blank canvas the builder's iframe loads; content arrives from the builder via postMessage. */
export default function PreviewPage() {
  return <PreviewFrame />;
}
