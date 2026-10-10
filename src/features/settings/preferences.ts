import { defaultRules } from "../search/types";
import type { LocalRules, RemoteQuery, SortField } from "../search/types";

export interface ReadingSettings {
  theme: "paper" | "day" | "night";
  font: "serif" | "sans" | "system";
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  width: number;
  background: string;
  foreground: string;
  customColors: boolean;
  customCss: string;
}
export interface Preferences {
  version: 1;
  reading: ReadingSettings;
  search: { keyword: string; target: RemoteQuery["target"]; local: LocalRules };
  source: "pixiv" | "demo";
}
export const STORAGE_KEY = "pixivpp.preferences.v1";
export function defaultPreferences(): Preferences {
  return {
    version: 1,
    source: "pixiv",
    reading: {
      theme: "paper",
      font: "serif",
      fontSize: 20,
      lineHeight: 1.85,
      paragraphSpacing: 1.2,
      width: 720,
      background: "#f5efdf",
      foreground: "#302b25",
      customColors: false,
      customCss: "",
    },
    search: {
      keyword: "",
      target: "partial_match_for_tags",
      local: defaultRules(),
    },
  };
}
function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string").slice(0, 200)
    : [];
}
function range(value: unknown): { min?: number; max?: number } {
  const result: { min?: number; max?: number } = {};
  if (value && typeof value === "object") {
    for (const key of ["min", "max"] as const) {
      const number = (value as Record<string, unknown>)[key];
      if (typeof number === "number" && Number.isFinite(number) && number >= 0)
        result[key] = number;
    }
  }
  return result;
}
export function parsePreferences(raw: string | null): Preferences {
  const defaults = defaultPreferences();
  if (!raw) return defaults;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1) return defaults;
    const reading = value.reading ?? {};
    const local = value.search?.local ?? {};
    const sorting = Array.isArray(local.sort)
      ? local.sort
          .filter(
            (s: { field?: string; direction?: string } | null) =>
              s &&
              ["bookmarks", "views", "publishedAt"].includes(s.field ?? "") &&
              ["asc", "desc"].includes(s.direction ?? ""),
          )
          .slice(0, 3)
      : [];
    return {
      version: 1,
      source: value.source === "demo" ? "demo" : "pixiv",
      reading: {
        theme: ["paper", "day", "night"].includes(reading.theme)
          ? reading.theme
          : defaults.reading.theme,
        font: ["serif", "sans", "system"].includes(reading.font)
          ? reading.font
          : defaults.reading.font,
        fontSize: bounded(reading.fontSize, 20, 12, 40),
        lineHeight: bounded(reading.lineHeight, 1.85, 1.2, 3),
        paragraphSpacing: bounded(reading.paragraphSpacing, 1.2, 0, 3),
        width: bounded(reading.width, 720, 320, 1200),
        background: /^#[0-9a-f]{6}$/i.test(reading.background)
          ? reading.background
          : defaults.reading.background,
        foreground: /^#[0-9a-f]{6}$/i.test(reading.foreground)
          ? reading.foreground
          : defaults.reading.foreground,
        customColors: reading.customColors === true,
        customCss:
          typeof reading.customCss === "string"
            ? reading.customCss.slice(0, 20000)
            : "",
      },
      search: {
        keyword:
          typeof value.search?.keyword === "string"
            ? value.search.keyword.slice(0, 500)
            : "",
        target: [
          "partial_match_for_tags",
          "exact_match_for_tags",
          "keyword",
        ].includes(value.search?.target)
          ? value.search.target
          : defaults.search.target,
        local: {
          excludedTags: strings(local.excludedTags),
          excludedKeywords: strings(local.excludedKeywords),
          bookmarks: range(local.bookmarks),
          views: range(local.views),
          textLength: range(local.textLength),
          sort: sorting.length ? sorting : defaults.search.local.sort,
        },
      },
    };
  } catch {
    return defaults;
  }
}
export function loadPreferences(): Preferences {
  try {
    return parsePreferences(localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultPreferences();
  }
}
export function savePreferences(preferences: Preferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
export function sortRules(
  field: SortField,
  direction: "asc" | "desc",
): LocalRules["sort"] {
  return [
    { field, direction },
    ...(field === "publishedAt"
      ? []
      : [{ field: "publishedAt" as const, direction: "desc" as const }]),
  ];
}
