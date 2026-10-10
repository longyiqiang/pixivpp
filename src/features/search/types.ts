import type { NovelSummary } from "../../domain/novel";

export interface RemoteQuery {
  keyword: string;
  target: "partial_match_for_tags" | "exact_match_for_tags" | "keyword";
  order: "date_desc" | "date_asc";
  startDate?: string;
  endDate?: string;
}

export interface NumberRange {
  min?: number;
  max?: number;
}
export type SortField = "bookmarks" | "views" | "publishedAt";
export interface LocalRules {
  excludedTags: string[];
  excludedKeywords: string[];
  bookmarks: NumberRange;
  views: NumberRange;
  textLength: NumberRange;
  sort: { field: SortField; direction: "asc" | "desc" }[];
}

export interface SearchInput {
  keyword: string;
  target: RemoteQuery["target"];
  startDate?: string;
  endDate?: string;
  local: LocalRules;
}

export interface SearchPlan {
  remote: RemoteQuery;
  local: LocalRules;
}
export interface SearchPage {
  items: NovelSummary[];
  nextCursor: string | null;
}

export function defaultRules(): LocalRules {
  return {
    excludedTags: [],
    excludedKeywords: [],
    bookmarks: {},
    views: {},
    textLength: {},
    sort: [
      { field: "bookmarks", direction: "desc" },
      { field: "publishedAt", direction: "desc" },
    ],
  };
}
