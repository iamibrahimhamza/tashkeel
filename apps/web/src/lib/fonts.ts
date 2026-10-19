import { IBM_Plex_Sans_Arabic, Kufam, Readex_Pro } from "next/font/google";

const kufam = Kufam({ subsets: ["arabic", "latin"], weight: ["500", "600", "700"], variable: "--font-kufam", display: "swap" });
const readex = Readex_Pro({ subsets: ["arabic", "latin"], weight: ["400", "500", "600"], variable: "--font-readex", display: "swap" });
const plex = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

/** Brand fonts as CSS variables, shared by both root layouts. */
export const fontVariables = `${kufam.variable} ${readex.variable} ${plex.variable}`;
