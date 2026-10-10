import type { NovelSummary } from "../../domain/novel";
import type { LocalRules, NumberRange } from "./types";

export const normalize = (text: string) =>
  text.normalize("NFKC").trim().toLocaleLowerCase("en-US");

export function mergeNovels(
  previous: NovelSummary[],
  incoming: NovelSummary[],
): NovelSummary[] {
  return [
    ...new Map(
      [...previous, ...incoming].map((item) => [item.id, item]),
    ).values(),
  ];
}

function inRange(value: number | null, range: NumberRange): boolean {
  if (range.min === undefined && range.max === undefined) return true;
  if (value === null) return false;
  return (
    (range.min === undefined || value >= range.min) &&
    (range.max === undefined || value <= range.max)
  );
}

export function filterAndSort(
  items: NovelSummary[],
  rules: LocalRules,
): NovelSummary[] {
  const tags = rules.excludedTags.map(normalize).filter(Boolean);
  const keywords = rules.excludedKeywords.map(normalize).filter(Boolean);
  return items
    .filter((item) => {
      const itemTags = item.tags.map(normalize);
      const text = normalize(`${item.title}
${item.caption}`);
      return (
        !tags.some((tag) => itemTags.includes(tag)) &&
        !keywords.some((keyword) => text.includes(keyword)) &&
        inRange(item.bookmarks, rules.bookmarks) &&
        inRange(item.views, rules.views) &&
        inRange(item.textLength, rules.textLength)
      );
    })
    .sort((a, b) => {
      for (const rule of rules.sort) {
        const av = a[rule.field];
        const bv = b[rule.field];
        // Unknown statistics always appear last, including ascending sorts.
        if (av === null && bv === null) continue;
        if (av === null) return 1;
        if (bv === null) return -1;
        const diff =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        if (diff) return rule.direction === "asc" ? diff : -diff;
      }
      return a.id.localeCompare(b.id, "en", { numeric: true });
    });
}
