import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { NovelSummary } from "./domain/novel";
import { filterAndSort, mergeNovels } from "./features/search/filter";
import { createSearchPlan } from "./features/search/plan";
import type {
  LocalRules,
  RemoteQuery,
  SortField,
} from "./features/search/types";
import { Reader } from "./features/reader/Reader";
import { demoProvider } from "./providers/demo";
import { Settings } from "./features/settings/Settings";
import {
  loadPreferences,
  savePreferences,
  sortRules,
} from "./features/settings/preferences";
import type { Preferences } from "./features/settings/preferences";
import {
  accountStatus,
  asError,
  listenAccount,
  nativeAvailable,
  pixivProvider,
} from "./platform/pixiv";
import type { Account, AccountStatus } from "./platform/pixiv";
import "./App.css";

const splitWords = (text: string) =>
  text
    .split(/[,，\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
const number = (value: number | null) =>
  value === null ? "未知" : value.toLocaleString("zh-CN");

export default function App() {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState("");
  const [keyword, setKeyword] = useState(preferences.search.keyword);
  const [target, setTarget] = useState<RemoteQuery["target"]>(
    preferences.search.target,
  );
  const [rules, setRules] = useState<LocalRules>(() =>
    structuredClone(preferences.search.local),
  );
  const provider = preferences.source === "demo" ? demoProvider : pixivProvider;
  function onAccount(status: AccountStatus) {
    setAccountError(status.error ?? "");
    if (!status.error) {
      request.current?.abort();
      setItems([]);
      setCursor(null);
      setQuery(null);
      setReading(null);
      setBusy(false);
      setError("");
      setAccount(status.account);
    }
  }
  useEffect(() => {
    if (!nativeAvailable) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    let receivedEvent = false;
    listenAccount((status) => {
      receivedEvent = true;
      if (alive) onAccount(status);
    })
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch((reason) => {
        if (alive) setAccountError(asError(reason).message);
      });
    accountStatus()
      .then((status) => {
        if (alive && !receivedEvent) onAccount(status);
      })
      .catch((reason) => {
        if (alive && !receivedEvent) setAccountError(asError(reason).message);
      });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  function updatePreferences(next: Preferences) {
    savePreferences(next);
    if (next.source !== preferences.source) {
      request.current?.abort();
      setItems([]);
      setCursor(null);
      setQuery(null);
      setReading(null);
      setBusy(false);
    }
    setPreferences(next);
  }
  function restoreDefaults() {
    request.current?.abort();
    setBusy(false);
    setItems([]);
    setCursor(null);
    setQuery(null);
    setKeyword(preferences.search.keyword);
    setTarget(preferences.search.target);
    setRules(structuredClone(preferences.search.local));
  }
  const [items, setItems] = useState<NovelSummary[]>([]);
  const [query, setQuery] = useState<RemoteQuery | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => window.scrollTo(0, 0), [settingsOpen, reading]);
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
      const page = await provider.search(remote, next, controller.signal);
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
        target,
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
        <button
          className="brand brand-button"
          onClick={() => {
            setSettingsOpen(false);
            setReading(null);
          }}
        >
          pixiv<span>pp</span>
          <small>小说</small>
        </button>
        <div className="header-actions">
          <span className="stage">
            {preferences.source === "demo"
              ? "演示样例"
              : account
                ? account.name
                : "未登录"}
          </span>
          <button onClick={() => setSettingsOpen(true)}>设置</button>
        </div>
      </header>
      {settingsOpen ? (
        <Settings
          preferences={preferences}
          account={account}
          accountError={accountError}
          onSave={updatePreferences}
          onAccount={onAccount}
          close={() => setSettingsOpen(false)}
        />
      ) : reading ? (
        <Reader
          id={reading}
          provider={provider}
          author={items.find((item) => item.id === reading)?.author ?? ""}
          reading={preferences.reading}
          onReadingChange={(value) => {
            try {
              updatePreferences({ ...preferences, reading: value });
            } catch {
              setError("阅读设置保存失败。");
            }
          }}
          close={() => setReading(null)}
        />
      ) : (
        <>
          <div className="demo-notice">
            {preferences.source === "demo" ? (
              "当前使用虚构样例，可搜索「原创」「日常」或「科幻」。"
            ) : account ? (
              "从 Pixiv 获取候选，在本地自由筛选和排序。"
            ) : (
              <span>
                请先在
                <button
                  className="text-button"
                  onClick={() => setSettingsOpen(true)}
                >
                  设置
                </button>
                中登录 Pixiv，再开始搜索。
              </span>
            )}
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
            <select
              aria-label="搜索范围"
              value={target}
              onChange={(e) =>
                setTarget(e.target.value as RemoteQuery["target"])
              }
            >
              <option value="partial_match_for_tags">标签部分匹配</option>
              <option value="exact_match_for_tags">标签完全匹配</option>
              <option value="keyword">关键词</option>
            </select>
            <button
              className="primary"
              disabled={busy || (preferences.source === "pixiv" && !account)}
            >
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
                <button className="text-button" onClick={restoreDefaults}>
                  恢复默认
                </button>
              </div>
              <label>
                排除标签<small>完全匹配，多个用逗号分隔</small>
                <input
                  value={rules.excludedTags.join(",")}
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
                          ...rules[field.key],
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
                        sort: sortRules(
                          e.target.value as SortField,
                          rules.sort[0].direction,
                        ),
                      })
                    }
                  >
                    <option value="bookmarks">收藏数</option>
                    <option value="views">浏览数</option>
                    <option value="publishedAt">发布日期</option>
                  </select>
                  <select
                    aria-label="排序方向"
                    value={rules.sort[0].direction}
                    onChange={(e) =>
                      setRules({
                        ...rules,
                        sort: sortRules(
                          rules.sort[0].field,
                          e.target.value as "asc" | "desc",
                        ),
                      })
                    }
                  >
                    <option value="desc">降序</option>
                    <option value="asc">升序</option>
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
                      : "输入标签或关键词，寻找想读的小说。"}
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
                  当前没有更多可获取的结果，覆盖范围以 Pixiv 返回为准。
                </p>
              )}
            </section>
          </main>
        </>
      )}
    </div>
  );
}
