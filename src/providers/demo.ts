import type { NovelSummary } from "../domain/novel";
import { normalize } from "../features/search/filter";
import type { NovelProvider } from "./novel-provider";

// Entirely fictional fixtures, not copied from Pixiv or assigned real Pixiv IDs.
const samples = [
  [
    "demo-1",
    "雨停之前的书店",
    "青禾",
    ["原创", "日常"],
    320,
    4200,
    24000,
    "一封寄错地址的信，让两位陌生人在雨天相遇。",
  ],
  [
    "demo-2",
    "银河末班车",
    "远山",
    ["原创", "科幻"],
    860,
    12000,
    42000,
    "最后一班列车开往尚未命名的星球。",
  ],
  [
    "demo-3",
    "旧宅来信",
    "千夜",
    ["原创", "恐怖"],
    1200,
    18000,
    18000,
    "门缝里出现了一封来自旧宅的信。",
  ],
  [
    "demo-4",
    "风穿过夏天",
    "青禾",
    ["原创", "日常"],
    95,
    1800,
    8500,
    "关于夏天、单车与未说出口的告别。",
  ],
  [
    "demo-5",
    "灯塔以北",
    "远山",
    ["原创", "冒险"],
    2400,
    32000,
    68000,
    "守塔人决定第一次离开海岸。",
  ],
  [
    "demo-6",
    "尚未写完的诗",
    "白纸",
    ["原创", "短篇"],
    null,
    null,
    3600,
    "这条样例展示统计字段缺失时的处理方式。",
  ],
] as const;

const novels: NovelSummary[] = samples.map((row, i) => ({
  id: row[0],
  title: row[1],
  author: row[2],
  tags: [...row[3]],
  bookmarks: row[4],
  views: row[5],
  textLength: row[6],
  caption: row[7],
  publishedAt: `2026-09-${String(20 - i).padStart(2, "0")}T08:00:00Z`,
  series: null,
}));

export const demoProvider: NovelProvider = {
  async search(query, cursor, signal) {
    signal.throwIfAborted();
    const keyword = normalize(query.keyword);
    const matches = novels
      .filter((novel) => {
        const match =
          query.target === "exact_match_for_tags"
            ? novel.tags.some((tag) => normalize(tag) === keyword)
            : query.target === "partial_match_for_tags"
              ? novel.tags.some((tag) => normalize(tag).includes(keyword))
              : normalize(
                  [novel.title, novel.caption, ...novel.tags].join(" "),
                ).includes(keyword);
        const date = novel.publishedAt.slice(0, 10);
        return (
          match &&
          (!query.startDate || date >= query.startDate) &&
          (!query.endDate || date <= query.endDate)
        );
      })
      .sort((a, b) =>
        query.order === "date_desc"
          ? b.publishedAt.localeCompare(a.publishedAt)
          : a.publishedAt.localeCompare(b.publishedAt),
      );
    const offset = Number(cursor ?? 0);
    if (!Number.isInteger(offset) || offset < 0)
      throw new Error("无效的分页位置。");
    return {
      items: matches.slice(offset, offset + 3),
      nextCursor: offset + 3 < matches.length ? String(offset + 3) : null,
    };
  },
  async read(id, signal) {
    signal.throwIfAborted();
    const novel = novels.find((item) => item.id === id);
    if (!novel) throw new Error("未找到演示小说。");
    return {
      id,
      title: novel.title,
      author: novel.author,
      paragraphs: [
        "这是一段为 pixivpp 编写的阅读演示文字，并非真实 Pixiv 作品。你可以在右上方切换纸张颜色，或调整文字大小。",
        "雨停的时候，街上的灯刚刚亮起。书店门口放着一把深蓝色的伞，伞柄上系着一张没有署名的纸条。",
        "她推开门，听见风铃轻轻响了一声。书架之间留着足够宽的通道，窗边的椅子上摊开一本还没有读完的书。",
        "“你在找什么？”柜台后的人问。",
        "她想了想，说：“也许只是一个能把这一页读完的地方。”",
        "窗外的风穿过树叶。她坐了下来，让故事从这里慢慢开始。",
      ],
    };
  },
};
