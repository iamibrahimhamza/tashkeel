import type { ThemeTokens } from "@tashkeel/contracts";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function mergeTheme(base: ThemeTokens, overrides: DeepPartial<ThemeTokens> | null | undefined): ThemeTokens {
  if (!overrides) return base;
  return {
    colors: { ...base.colors, ...(overrides.colors ?? {}) },
    fonts: { ...base.fonts, ...(overrides.fonts ?? {}) },
    radius: overrides.radius ?? base.radius,
    mode: overrides.mode ?? base.mode,
  };
}
