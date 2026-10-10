import { useState } from "react";
import type { Preferences } from "./preferences";
import { defaultPreferences, sortRules } from "./preferences";
import type { SortField } from "../search/types";
import { createSearchPlan } from "../search/plan";
import {
  asError,
  importToken,
  login,
  logout,
  nativeAvailable,
} from "../../platform/pixiv";
import type { Account, AccountStatus } from "../../platform/pixiv";

export function Settings({
  preferences,
  account,
  accountError,
  onSave,
  onAccount,
  close,
}: {
  preferences: Preferences;
  account: Account | null;
  accountError: string;
  onSave: (value: Preferences) => void;
  onAccount: (value: AccountStatus) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(preferences));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  async function accountAction(action: () => Promise<void | AccountStatus>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await action();
      if (result) {
        onAccount(result);
        setToken("");
      }
    } catch (reason) {
      setError(asError(reason).message);
    } finally {
      setBusy(false);
    }
  }
  function save() {
    setError("");
    try {
      createSearchPlan({
        keyword: draft.search.keyword || "_",
        target: draft.search.target,
        local: draft.search.local,
      });
      onSave(draft);
      setMessage(
        "设置已保存。默认搜索条件将在下次启动或点击“恢复默认”时使用。",
      );
    } catch (reason) {
      setError(asError(reason).message);
    }
  }
  const reading = draft.reading;
  const local = draft.search.local;
  return (
    <main className="settings-page">
      <div className="settings-heading">
        <div>
          <span className="eyebrow">按照自己的习惯</span>
          <h1>设置</h1>
        </div>
        <button onClick={close}>← 返回</button>
      </div>
      <section className="settings-card">
        <h2>Pixiv 账号</h2>
        <p>
          {account
            ? `已登录：${account.name}（${account.id}）`
            : "登录后即可搜索并阅读真实 Pixiv 小说。"}
        </p>
        {accountError && (
          <p className="error" role="alert">
            {accountError}
          </p>
        )}
        {!nativeAvailable && (
          <p className="error">在线功能需要在独立 App 中使用。</p>
        )}
        <div className="button-row">
          <button
            className="primary"
            disabled={busy || !nativeAvailable}
            onClick={() => void accountAction(login)}
          >
            {account ? "切换账号" : "登录 Pixiv"}
          </button>
          {account && (
            <button
              disabled={busy}
              onClick={() =>
                void accountAction(async () => {
                  await logout();
                  onAccount({ account: null, error: null });
                })
              }
            >
              退出登录
            </button>
          )}
        </div>
        <small className="help-text">
          在弹出的 Pixiv 页面完成登录。登录凭据由系统安全存储保管。
        </small>
        <details>
          <summary>高级：使用 Refresh Token 登录</summary>
          <p className="help-text">
            已有第三方客户端令牌时可使用此方式。令牌只发送给
            Pixiv，并保存到本机系统安全存储。
          </p>
          <label>
            Refresh Token
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="粘贴令牌"
            />
          </label>
          <button
            disabled={busy || !token.trim() || !nativeAvailable}
            onClick={() => void accountAction(() => importToken(token))}
          >
            验证并登录
          </button>
        </details>
      </section>
      <section className="settings-card">
        <h2>阅读偏好</h2>
        <div className="settings-grid">
          <label>
            默认主题
            <select
              value={reading.theme}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  reading: {
                    ...reading,
                    theme: e.target.value as typeof reading.theme,
                  },
                })
              }
            >
              <option value="paper">暖纸</option>
              <option value="day">日间</option>
              <option value="night">夜间</option>
            </select>
          </label>
          <label>
            字体
            <select
              value={reading.font}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  reading: {
                    ...reading,
                    font: e.target.value as typeof reading.font,
                  },
                })
              }
            >
              <option value="serif">衬线字体</option>
              <option value="sans">无衬线字体</option>
              <option value="system">系统字体</option>
            </select>
          </label>
          {(
            [
              { key: "fontSize", label: "字号", min: 12, max: 40, step: 1 },
              {
                key: "lineHeight",
                label: "行距",
                min: 1.2,
                max: 3,
                step: 0.05,
              },
              {
                key: "paragraphSpacing",
                label: "段间距",
                min: 0,
                max: 3,
                step: 0.1,
              },
              {
                key: "width",
                label: "阅读宽度",
                min: 320,
                max: 1200,
                step: 20,
              },
            ] as const
          ).map((field) => (
            <label key={field.key}>
              {field.label} · {reading[field.key]}
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={reading[field.key]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    reading: {
                      ...reading,
                      [field.key]: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          ))}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={reading.customColors}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  reading: { ...reading, customColors: e.target.checked },
                })
              }
            />
            使用自定义颜色
          </label>
          <label>
            背景颜色
            <input
              type="color"
              value={reading.background}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  reading: { ...reading, background: e.target.value },
                })
              }
            />
          </label>
          <label>
            文字颜色
            <input
              type="color"
              value={reading.foreground}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  reading: { ...reading, foreground: e.target.value },
                })
              }
            />
          </label>
        </div>
        <details>
          <summary>高级：自定义阅读 CSS</summary>
          <p className="help-text">
            可使用 .reader、.reader p、.reader h2、ruby
            等选择器。样式仅作用于正文，外部资源加载被禁用。
          </p>
          <textarea
            aria-label="自定义阅读 CSS"
            className="css-editor"
            spellCheck={false}
            value={reading.customCss}
            onChange={(e) =>
              setDraft({
                ...draft,
                reading: {
                  ...reading,
                  customCss: e.target.value.slice(0, 20000),
                },
              })
            }
            placeholder={".reader p { text-indent: 2em; }"}
          />
          <button
            onClick={() =>
              setDraft({ ...draft, reading: defaultPreferences().reading })
            }
          >
            恢复默认阅读样式
          </button>
        </details>
      </section>
      <section className="settings-card">
        <h2>默认搜索条件</h2>
        <p className="help-text">
          启动时载入这些条件；搜索页的“恢复默认”也会重新应用它们。
        </p>
        <div className="settings-grid">
          <label>
            默认关键词
            <input
              value={draft.search.keyword}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  search: { ...draft.search, keyword: e.target.value },
                })
              }
              placeholder="留空，每次自行输入"
            />
          </label>
          <label>
            匹配范围
            <select
              value={draft.search.target}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  search: {
                    ...draft.search,
                    target: e.target.value as typeof draft.search.target,
                  },
                })
              }
            >
              <option value="partial_match_for_tags">标签部分匹配</option>
              <option value="exact_match_for_tags">标签完全匹配</option>
              <option value="keyword">关键词搜索</option>
            </select>
          </label>
          <label>
            排除标签
            <input
              value={local.excludedTags.join(",")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  search: {
                    ...draft.search,
                    local: {
                      ...local,
                      excludedTags: e.target.value.split(/[,，]/),
                    },
                  },
                })
              }
              placeholder="多个标签用逗号分隔"
            />
          </label>
          <label>
            排除标题 / 简介关键词
            <input
              value={local.excludedKeywords.join(",")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  search: {
                    ...draft.search,
                    local: {
                      ...local,
                      excludedKeywords: e.target.value.split(/[,，]/),
                    },
                  },
                })
              }
            />
          </label>
          {(
            [
              { key: "bookmarks", label: "收藏数" },
              { key: "views", label: "浏览数" },
              { key: "textLength", label: "字数" },
            ] as const
          ).map((field) => (
            <div className="range-fields" key={field.key}>
              <span>{field.label}</span>
              {(["min", "max"] as const).map((bound) => (
                <label key={bound}>
                  {bound === "min" ? "下限" : "上限"}
                  <input
                    type="number"
                    min="0"
                    placeholder="不限"
                    value={local[field.key][bound] ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        search: {
                          ...draft.search,
                          local: {
                            ...local,
                            [field.key]: {
                              ...local[field.key],
                              [bound]:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            },
                          },
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          ))}
          <label>
            默认排序
            <select
              value={local.sort[0].field}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  search: {
                    ...draft.search,
                    local: {
                      ...local,
                      sort: sortRules(
                        e.target.value as SortField,
                        local.sort[0].direction,
                      ),
                    },
                  },
                })
              }
            >
              <option value="bookmarks">收藏数</option>
              <option value="views">浏览数</option>
              <option value="publishedAt">发布日期</option>
            </select>
          </label>
          <label>
            排序方向
            <select
              value={local.sort[0].direction}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  search: {
                    ...draft.search,
                    local: {
                      ...local,
                      sort: sortRules(
                        local.sort[0].field,
                        e.target.value as "asc" | "desc",
                      ),
                    },
                  },
                })
              }
            >
              <option value="desc">从高到低 / 从新到旧</option>
              <option value="asc">从低到高 / 从旧到新</option>
            </select>
          </label>
        </div>
      </section>
      <section className="settings-card">
        <h2>数据来源</h2>
        <label>
          作品来源
          <select
            value={draft.source}
            onChange={(e) =>
              setDraft({
                ...draft,
                source: e.target.value as Preferences["source"],
              })
            }
          >
            <option value="pixiv">Pixiv 在线作品</option>
            <option value="demo">虚构演示样例</option>
          </select>
        </label>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="save-message">
          {message}
        </p>
      )}
      <div className="settings-actions">
        <button className="primary" onClick={save}>
          保存设置
        </button>
        <button onClick={close}>返回搜索</button>
      </div>
    </main>
  );
}
