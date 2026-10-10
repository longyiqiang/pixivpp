import type { SearchInput, SearchPlan } from "./types";

// Only supported candidate-retrieval conditions cross the provider boundary.
export function createSearchPlan(input: SearchInput): SearchPlan {
  const keyword = input.keyword.trim();
  if (!keyword) throw new Error("请输入搜索关键词。");
  if (input.startDate && input.endDate && input.startDate > input.endDate) {
    throw new Error("开始日期不能晚于结束日期。");
  }
  for (const range of [
    input.local.bookmarks,
    input.local.views,
    input.local.textLength,
  ]) {
    for (const value of [range.min, range.max]) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        throw new Error("数值筛选条件必须是非负数字。");
      }
    }
    if (
      range.min !== undefined &&
      range.max !== undefined &&
      range.min > range.max
    ) {
      throw new Error("筛选下限不能大于上限。");
    }
  }
  return {
    remote: {
      keyword,
      target: input.target,
      order: "date_desc",
      startDate: input.startDate,
      endDate: input.endDate,
    },
    local: structuredClone(input.local),
  };
}
