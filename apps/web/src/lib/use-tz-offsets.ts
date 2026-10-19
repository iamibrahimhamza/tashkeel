"use client";

import { useEffect, useState } from "react";
import { tzOffset } from "./timezones";

/**
 * UTC offsets for timezone pickers, computed in the browser only. Server and browser can ship
 * different timezone databases (e.g. Morocco's rules), so rendering offsets on the server
 * causes hydration mismatches. Until mounted, labels render without the offset.
 */
export function useTzOffsets(ids: string[]): (id: string) => string {
  const [offsets, setOffsets] = useState<Record<string, string>>({});
  const key = ids.join("|");
  useEffect(() => {
    setOffsets(Object.fromEntries(key.split("|").map((id) => [id, tzOffset(id)])));
  }, [key]);
  return (id) => (offsets[id] ? ` (${offsets[id]})` : "");
}
