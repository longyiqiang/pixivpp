import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultPreferences,
  loadPreferences,
  parsePreferences,
  savePreferences,
  STORAGE_KEY,
} from "./preferences";

afterEach(() => vi.unstubAllGlobals());
describe("saved preferences", () => {
  it("round-trips reading styles and default filters without credentials", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const settings = defaultPreferences();
    settings.reading.customCss = ".reader p { text-indent: 2em; }";
    settings.reading.fontSize = 26;
    settings.search.keyword = "原创";
    settings.search.local.bookmarks = { min: 50, max: 300 };
    settings.search.local.excludedTags = ["悲剧"];
    savePreferences(settings);
    expect(loadPreferences()).toEqual(settings);
    expect(JSON.parse(values.get(STORAGE_KEY)!)).not.toHaveProperty("account");
    expect(JSON.parse(values.get(STORAGE_KEY)!)).not.toHaveProperty(
      "refreshToken",
    );
  });
  it("recovers from invalid JSON and inaccessible storage", () => {
    expect(parsePreferences("{broken")).toEqual(defaultPreferences());
    expect(parsePreferences('{"version":99}')).toEqual(defaultPreferences());
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadPreferences()).toEqual(defaultPreferences());
  });
  it("bounds untrusted stored values and rejects invalid filter fields", () => {
    const result = parsePreferences(
      JSON.stringify({
        version: 1,
        reading: {
          fontSize: 999,
          width: -1,
          lineHeight: "2",
          background: "red;position:fixed",
          theme: "invalid",
        },
        search: {
          target: "invalid",
          local: {
            views: { min: -2, max: 20 },
            sort: [{ field: "id", direction: "asc" }],
          },
        },
      }),
    );
    expect(result.reading.fontSize).toBe(40);
    expect(result.reading.width).toBe(320);
    expect(result.reading.lineHeight).toBe(1.85);
    expect(result.reading.background).toBe("#f5efdf");
    expect(result.search.local.views).toEqual({ max: 20 });
    expect(result.search.local.sort).toEqual(
      defaultPreferences().search.local.sort,
    );
  });
});
