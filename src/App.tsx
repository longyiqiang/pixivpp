import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { NovelSummary } from "./domain/novel";
import { filterAndSort, mergeNovels } from "./features/search/filter";
import { createSearchPlan } from "./features/search/plan";
import { defaultRules } from "./features/search/types";
import type {
  LocalRules,
  RemoteQuery,
  SortField,
} from "./features/search/types";
import { Reader } from "./features/reader/Reader";
import { demoProvider } from "./providers/demo";
import "./App.css";

const splitWords = (text: string) =>
  text
    .split(/[,，\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
const number = (value: number | null) =>
  value === null ? "未知" : value.toLocaleString("zh-CN");

export default function App() {
  const [keyword, setKeyword] = useState("原创");
  const [rules, setRules] = useState<LocalRules>(defaultRules);
  const [items, setItems] = useState<NovelSummary[]>([]);
  const [query, setQuery] = useState<RemoteQuery | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const results = useMemo(() => filterAndSort(items, rules), [items, rules]);
  useEffect(() => () => request.current?.abort(), []);

  async function fetchPage(
    remote: RemoteQuery,
    next: string | null,
    reset: boolean,
  ) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    if (reset) {
      setItems([]);
      setCursor(null);
      setQuery(remote);
    }
    try {
      const page = await demoProvider.search(remote, next, controller.signal);
      if (request.current !== controller || controller.signal.aborted) return;
      setItems((previous) => mergeNovels(reset ? [] : previous, page.items));
      setCursor(page.nextCursor);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : "搜索失败，请重试。",
        );
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }

  function search(event: FormEvent) {
    event.preventDefault();
    try {
      const plan = createSearchPlan({
        keyword,
        target: "partial_match_for_tags",
        local: rules,
      });
      void fetchPage(plan.remote, null, true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "搜索条件无效。");
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/">
          pixiv<span>pp</span>
          <small>小说</small>
        </a>
        <span className="stage">早期原型 · 演示数据</span>
      </header>
      {reading ? (
        <Reader
          id={reading}
          provider={demoProvider}
          close={() => setReading(null)}
        />
      ) : (
        <>
          <section className="intro">
            <span className="eyebrow">寻找故事，按你的方式。</span>
            <h1>让下一篇，更合心意。</h1>
            <p>在线发现作品，本地自由筛选。把时间留给阅读。</p>
          </section>
          <div className="demo-notice">
            当前使用 6 篇虚构样例，尚未接入
            Pixiv。试试搜索「原创」「日常」或「科幻」。
          </div>
          <form className="search-bar" onSubmit={search}>
            <label className="sr-only" htmlFor="keyword">
              搜索标签
            </label>
            <span aria-hidden="true">⌕</span>
            <input
              id="keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索小说标签"
            />
            <button className="primary" disabled={busy}>
              搜索小说
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <main className="workspace">
            <aside className="filters">
              <div className="section-top">
                <h2>精细筛选</h2>
                <button
                  className="text-button"
                  onClick={() => setRules(defaultRules())}
                >
                  重置
                </button>
              </div>
              <label>
                排除标签<small>完全匹配，多个用逗号分隔</small>
                <input
                  value={rules.excludedTags.join(", ")}
                  placeholder="恐怖, 悲剧"
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      excludedTags: e.target.value.split(/[,，]/),
                    })
                  }
                />
              </label>
              <label>
                排除关键词<small>匹配标题与简介，多个用逗号分隔</small>
                <input
                  value={rules.excludedKeywords.join(",")}
                  placeholder="不想看到的内容"
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      excludedKeywords: e.target.value.split(/[,，]/),
                    })
                  }
                  onBlur={() =>
                    setRules((current) => ({
                      ...current,
                      excludedKeywords: splitWords(
                        current.excludedKeywords.join(","),
                      ),
                    }))
                  }
                />
              </label>
              {(
                [
                  { key: "bookmarks", label: "最低收藏数" },
                  { key: "views", label: "最低浏览数" },
                  { key: "textLength", label: "最少字数" },
                ] as const
              ).map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="不限"
                    value={rules[field.key].min ?? ""}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        [field.key]: {
                          min:
                            e.target.value === ""
                              ? undefined
                              : Math.max(0, Number(e.target.value)),
                        },
                      })
                    }
                  />
                </label>
              ))}
              <p className="filter-note">
                筛选仅作用于已获取结果。更换条件无需重新获取。
              </p>
            </aside>
            <section className="results" aria-label="搜索结果">
              <div className="results-toolbar">
                <div>
                  <h2>
                    {query
                      ? `「${query.keyword}」的搜索结果`
                      : "从一个关键词开始"}
                  </h2>
                  <p role="status">
                    已获取 {items.length} 篇 · 筛选后 {results.length} 篇
                  </p>
                </div>
                <label className="sort-label">
                  排序
                  <select
                    aria-label="排序"
                    value={rules.sort[0].field}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        sort: [
                          {
                            field: e.target.value as SortField,
                            direction: "desc",
                          },
                          ...(e.target.value === "publishedAt"
                            ? []
                            : [
                                {
                                  field: "publishedAt" as const,
                                  direction: "desc" as const,
                                },
                              ]),
                        ],
                      })
                    }
                  >
                    <option value="bookmarks">收藏最多</option>
                    <option value="views">浏览最多</option>
                    <option value="publishedAt">最新发布</option>
                  </select>
                </label>
              </div>
              {!results.length && (
                <div className="empty">
                  <span aria-hidden="true">文</span>
                  <h3>
                    {query
                      ? "当前没有符合条件的作品"
                      : "你的下一篇故事，在这里"}
                  </h3>
                  <p>
                    {query
                      ? "调整筛选条件，或继续获取更多候选。"
                      : "搜索样例标签，体验筛选和小说阅读流程。"}
                  </p>
                </div>
              )}
              <div className="novel-list">
                {results.map((novel) => (
                  <article className="novel-card" key={novel.id}>
                    <div className="novel-mark" aria-hidden="true">
                      {novel.title.slice(0, 1)}
                    </div>
                    <div className="novel-info">
                      <div className="novel-meta">
                        {novel.author} <span>·</span>{" "}
                        {novel.publishedAt.slice(0, 10)}
                      </div>
                      <h3>
                        <button onClick={() => setReading(novel.id)}>
                          {novel.title}
                        </button>
                      </h3>
                      <p>{novel.caption}</p>
                      <div className="tags">
                        {novel.tags.map((tag) => (
                          <span key={tag}>#{tag}</span>
                        ))}
                      </div>
                      <div className="statistics">
                        <span>{number(novel.textLength)} 字</span>
                        <span>收藏 {number(novel.bookmarks)}</span>
                        <span>浏览 {number(novel.views)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {cursor && (
                <button
                  className="load-more"
                  disabled={busy}
                  onClick={() => query && void fetchPage(query, cursor, false)}
                >
                  {busy ? "正在获取…" : "继续获取 · 更新排序"}
                </button>
              )}
              {query && !cursor && !busy && (
                <p className="end-note">
                  已读取此查询的全部演示结果；真实搜索的覆盖范围以后端返回为准。
                </p>
              )}
            </section>
          </main>
        </>
      )}
      <footer>
        pixivpp <span>·</span> 为小说而起步的开源阅读器
      </footer>
    </div>
  );
}
