import { useEffect, useState } from "react";
import type { NovelContent } from "../../domain/novel";
import type { NovelProvider } from "../../providers/novel-provider";

export function Reader({
  id,
  provider,
  close,
}: {
  id: string;
  provider: NovelProvider;
  close: () => void;
}) {
  const [content, setContent] = useState<NovelContent | null>(null);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("paper");
  const [size, setSize] = useState(20);
  useEffect(() => {
    const controller = new AbortController();
    setContent(null);
    setError("");
    provider
      .read(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setContent(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "读取失败。");
      });
    return () => controller.abort();
  }, [id, provider]);
  return (
    <section className={`reader theme-${theme}`} aria-label="小说阅读器">
      <div className="reader-toolbar">
        <button onClick={close}>← 返回结果</button>
        <div className="reader-controls">
          <label>
            主题
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="paper">暖纸</option>
              <option value="day">日间</option>
              <option value="night">夜间</option>
            </select>
          </label>
          <label>
            字号{" "}
            <input
              aria-label="字号"
              type="range"
              min="16"
              max="30"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </label>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!content && !error && <p role="status">正在加载正文…</p>}
      {content && (
        <article className="reader-content" style={{ fontSize: size }}>
          <span className="eyebrow">阅读演示</span>
          <h1>{content.title}</h1>
          <div className="reader-author">{content.author}</div>
          {content.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          <div className="reader-end">— 演示结束 —</div>
        </article>
      )}
    </section>
  );
}
