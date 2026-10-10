import { useEffect, useMemo, useState } from "react";
import type { NovelContent } from "../../domain/novel";
import type { NovelProvider } from "../../providers/novel-provider";
import type { ReadingSettings } from "../settings/preferences";
import { asError } from "../../platform/pixiv";
import { readerDocument } from "./document";

export function Reader({
  id,
  author,
  provider,
  reading,
  onReadingChange,
  close,
}: {
  id: string;
  author: string;
  provider: NovelProvider;
  reading: ReadingSettings;
  onReadingChange: (value: ReadingSettings) => void;
  close: () => void;
}) {
  const [content, setContent] = useState<NovelContent | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setContent(null);
    setError("");
    window.scrollTo(0, 0);
    provider
      .read(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setContent(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(asError(reason).message);
      });
    return () => controller.abort();
  }, [id, provider]);
  const document = useMemo(
    () =>
      content
        ? readerDocument(
            content.title,
            content.author || author,
            content.text ?? content.paragraphs.join("\n"),
            reading,
          )
        : "",
    [content, reading, author],
  );
  return (
    <section
      className={`reader theme-${reading.theme}`}
      aria-label="小说阅读器"
    >
      <div className="reader-toolbar">
        <button onClick={close}>← 返回结果</button>
        <div className="reader-controls">
          <label>
            主题
            <select
              value={reading.theme}
              onChange={(e) =>
                onReadingChange({
                  ...reading,
                  theme: e.target.value as ReadingSettings["theme"],
                  customColors: false,
                })
              }
            >
              <option value="paper">暖纸</option>
              <option value="day">日间</option>
              <option value="night">夜间</option>
            </select>
          </label>
          <label>
            字号
            <input
              aria-label="字号"
              type="range"
              min="12"
              max="40"
              value={reading.fontSize}
              onChange={(e) =>
                onReadingChange({
                  ...reading,
                  fontSize: Number(e.target.value),
                })
              }
            />
          </label>
          {reading.customCss && (
            <button
              onClick={() => onReadingChange({ ...reading, customCss: "" })}
            >
              关闭自定义样式
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="error reader-status" role="alert">
          {error}
        </p>
      )}
      {!content && !error && (
        <p className="reader-status" role="status">
          正在加载正文…
        </p>
      )}
      {content && (
        <iframe
          className="reader-frame"
          title="小说正文"
          sandbox=""
          srcDoc={document}
        />
      )}
    </section>
  );
}
