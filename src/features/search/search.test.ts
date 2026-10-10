import { describe, expect, it } from "vitest";
import type { NovelSummary } from "../../domain/novel";
import { demoProvider } from "../../providers/demo";
import { filterAndSort, mergeNovels } from "./filter";
import { createSearchPlan } from "./plan";
import { defaultRules } from "./types";

const novel = (
  id: string,
  changes: Partial<NovelSummary> = {},
): NovelSummary => ({
  id,
  title: "雨天",
  caption: "普通故事",
  author: "作者",
  tags: ["原创"],
  publishedAt: "2026-09-01T00:00:00Z",
  bookmarks: 100,
  views: 500,
  textLength: 20000,
  series: null,
  ...changes,
});

describe("search planning", () => {
  it("keeps local exclusions and popularity sorting out of remote parameters", () => {
    const local = defaultRules();
    local.excludedTags = ["恐怖"];
    const plan = createSearchPlan({
      keyword: " 原创 ",
      target: "exact_match_for_tags",
      local,
    });
    expect(plan.remote).toEqual({
      keyword: "原创",
      target: "exact_match_for_tags",
      order: "date_desc",
      startDate: undefined,
      endDate: undefined,
    });
    local.excludedTags.push("悲剧");
    expect(plan.local.excludedTags).toEqual(["恐怖"]);
  });
  it("rejects blank queries, reversed dates and invalid ranges", () => {
    const base = {
      keyword: "原创",
      target: "keyword" as const,
      local: defaultRules(),
    };
    expect(() => createSearchPlan({ ...base, keyword: " " })).toThrow();
    expect(() =>
      createSearchPlan({
        ...base,
        startDate: "2026-09-02",
        endDate: "2026-09-01",
      }),
    ).toThrow();
    base.local.bookmarks = { min: 20, max: 10 };
    expect(() => createSearchPlan(base)).toThrow();
    base.local.bookmarks = { min: NaN };
    expect(() => createSearchPlan(base)).toThrow();
  });
});

describe("local filtering and sorting", () => {
  it("matches excluded tags exactly after normalization and ignores empty exclusions", () => {
    const rules = defaultRules();
    rules.excludedTags = [" ＡＩ ", "", "恐怖"];
    const result = filterAndSort(
      [
        novel("1", { tags: ["ai"] }),
        novel("2", { tags: ["恐怖"] }),
        novel("3", { tags: ["非恐怖"] }),
      ],
      rules,
    );
    expect(result.map((n) => n.id)).toEqual(["3"]);
  });
  it("excludes title/caption keywords without accidentally filtering authors", () => {
    const rules = defaultRules();
    rules.excludedKeywords = ["悲剧"];
    expect(
      filterAndSort(
        [
          novel("1", { title: "悲剧故事" }),
          novel("2", { caption: "这是悲剧" }),
          novel("3", { author: "悲剧" }),
        ],
        rules,
      ).map((n) => n.id),
    ).toEqual(["3"]);
  });
  it("combines inclusive ranges and excludes unknown statistics only when constrained", () => {
    const rules = defaultRules();
    const items = [
      novel("1"),
      novel("2", { bookmarks: null }),
      novel("3", { views: 50 }),
    ];
    expect(filterAndSort(items, rules)).toHaveLength(3);
    rules.bookmarks = { min: 100, max: 100 };
    rules.views = { min: 500 };
    rules.textLength = { max: 20000 };
    expect(filterAndSort(items, rules).map((n) => n.id)).toEqual(["1"]);
  });
  it("sorts the cumulative set, uses secondary dates and does not mutate source data", () => {
    const items = [
      novel("1"),
      novel("2", { bookmarks: 900 }),
      novel("3", { publishedAt: "2026-09-02T00:00:00Z" }),
    ];
    expect(filterAndSort(items, defaultRules()).map((n) => n.id)).toEqual([
      "2",
      "3",
      "1",
    ]);
    expect(items.map((n) => n.id)).toEqual(["1", "2", "3"]);
  });
  it("keeps unknown values last even in ascending order and resolves ties by ID", () => {
    const rules = defaultRules();
    rules.sort = [{ field: "views", direction: "asc" }];
    expect(
      filterAndSort(
        [novel("3", { views: null }), novel("2"), novel("1")],
        rules,
      ).map((n) => n.id),
    ).toEqual(["1", "2", "3"]);
  });
  it("deduplicates pages and replaces stale metadata before filtering", () => {
    const merged = mergeNovels(
      [novel("1")],
      [novel("1", { bookmarks: 1000 }), novel("2")],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0].bookmarks).toBe(1000);
  });
});

describe("demo provider contract", () => {
  it("paginates independently from local rules and loads content on demand", async () => {
    const signal = new AbortController().signal;
    const remote = createSearchPlan({
      keyword: "原创",
      target: "keyword",
      local: defaultRules(),
    }).remote;
    const first = await demoProvider.search(remote, null, signal);
    expect(first.items).toHaveLength(3);
    const second = await demoProvider.search(remote, first.nextCursor, signal);
    expect(second.nextCursor).toBeNull();
    const merged = mergeNovels(first.items, second.items);
    expect(merged).toHaveLength(6);
    expect(filterAndSort(merged, defaultRules())[0].id).toBe("demo-5");
    expect(
      (await demoProvider.read("demo-1", signal)).paragraphs.length,
    ).toBeGreaterThan(0);
  });
  it("rejects cancelled requests and missing works", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      demoProvider.read("demo-1", controller.signal),
    ).rejects.toThrow();
    await expect(
      demoProvider.read("missing", new AbortController().signal),
    ).rejects.toThrow();
  });
});
