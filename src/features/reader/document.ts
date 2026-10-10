import type { ReadingSettings } from "../settings/preferences";

export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
function inline(text: string): string {
  const matcher =
    /\[ruby:([^\]\n]+)>([^\]\n]+)\]|\[\[jumpuri:([^\]\n]+)>(https?:\/\/[^\]\n]+)\]\]/g;
  let html = "";
  let cursor = 0;
  for (const match of text.matchAll(matcher)) {
    html += escapeHtml(text.slice(cursor, match.index));
    if (match[1])
      html += `<ruby>${escapeHtml(match[1])}<rp>(</rp><rt>${escapeHtml(match[2])}</rt><rp>)</rp></ruby>`;
    else html += `${escapeHtml(match[3])}（${escapeHtml(match[4])}）`;
    cursor = match.index! + match[0].length;
  }
  return html + escapeHtml(text.slice(cursor));
}
export function novelMarkup(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/(\[newpage\]|\[chapter:[^\]]*\])/)
    .map((part) => {
      if (part === "[newpage]") return '<hr class="page-break" />';
      if (part.startsWith("[chapter:") && part.endsWith("]"))
        return `<h2>${escapeHtml(part.slice(9, -1))}</h2>`;
      return part
        .split("\n")
        .map((line) => {
          const readable = line
            .replace(/\[(?:uploadedimage|pixivimage):[^\]]*\]/g, "〔插图〕")
            .replace(/\[jump:\d+\]/g, "")
            .replace(/\[\[rb:([^>]+)>([^\]]+)\]\]/g, "$1（$2）");
          return readable
            ? `<p>${inline(readable)}</p>`
            : '<div class="blank-line"></div>';
        })
        .join("");
    })
    .join("");
}
export function readerDocument(
  title: string,
  author: string,
  text: string,
  settings: ReadingSettings,
): string {
  const colors = settings.customColors
    ? [settings.background, settings.foreground]
    : {
        paper: ["#f5efdf", "#302b25"],
        day: ["#ffffff", "#273b38"],
        night: ["#232b27", "#d0d5cd"],
      }[settings.theme];
  const font = {
    serif: '"Songti SC", "Noto Serif CJK SC", serif',
    sans: '"PingFang SC", "Noto Sans CJK SC", sans-serif',
    system: "-apple-system, BlinkMacSystemFont, sans-serif",
  }[settings.font];
  // Escaping '<' prevents user CSS from breaking out of the style element.
  const css = settings.customCss.replace(/</g, "\\3c ");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>
    *{box-sizing:border-box}body{margin:0;background:${colors[0]};color:${colors[1]}}
    .reader{max-width:${settings.width}px;margin:auto;padding:40px clamp(18px,5vw,64px) 80px;font-family:${font};font-size:${settings.fontSize}px;line-height:${settings.lineHeight}}
    .reader h1{font-size:1.6em;line-height:1.4;margin:0 0 12px}.reader h2{font-size:1.2em;margin:2em 0 1em}.reader .author{font-size:13px;opacity:.65;margin-bottom:36px}.reader p{margin:0 0 ${settings.paragraphSpacing}em;overflow-wrap:anywhere}.blank-line{height:.6em}.page-break{border:0;border-top:1px solid #8884;margin:2em 0}rt{font-size:.55em}.end{font-size:13px;text-align:center;opacity:.5;margin-top:40px}
    ${css}</style></head><body><article class="reader"><h1>${escapeHtml(title)}</h1><div class="author">${escapeHtml(author)}</div>${novelMarkup(text)}<div class="end">— 正文结束 —</div></article></body></html>`;
}
