import { Kufam, Readex_Pro } from "next/font/google";

// Brand typography: Kufam for display and headings, Readex Pro for body and UI text.
const kufam = Kufam({ subsets: ["arabic", "latin"], weight: ["500", "600", "700"], variable: "--font-kufam", display: "swap" });
const readex = Readex_Pro({ subsets: ["arabic", "latin"], weight: ["300", "400", "500", "600"], variable: "--font-readex", display: "swap" });

/** Brand fonts as CSS variables, shared by both root layouts. */
export const fontVariables = `${kufam.variable} ${readex.variable}`;
