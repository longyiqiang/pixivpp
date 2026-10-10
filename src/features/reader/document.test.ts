import { describe, expect, it } from "vitest";
import { novelMarkup, readerDocument } from "./document";
import { defaultPreferences } from "../settings/preferences";

describe("isolated novel document", () => {
  it("preserves paragraphs, chapter markers, page breaks and ruby", () => {
    const html = novelMarkup(
      "[chapter:第一章]正文\r\n[ruby:漢字>かんじ][newpage]第二页",
    );
    expect(html).toContain("<h2>第一章</h2>");
    expect(html).toContain("<p>正文</p>");
    expect(html).toContain("<ruby>漢字<rp>(</rp><rt>かんじ</rt>");
    expect(html).toContain('class="page-break"');
    expect(html).toContain("<p>第二页</p>");
  });
  it("escapes hostile titles, text and CSS style breakouts", () => {
    const settings = defaultPreferences().reading;
    settings.customCss = "</style><script>alert(1)</script>";
    const html = readerDocument(
      "<img src=x onerror=alert(1)>",
      "<b>作者</b>",
      "<script>steal()</script>",
      settings,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;steal()");
    expect(html).toContain("default-src 'none'");
    expect(html.match(/<\/style>/g)).toHaveLength(1);
  });
  it("represents links and illustrations without external requests", () => {
    const html = novelMarkup(
      "[[jumpuri:链接>https://example.org]][uploadedimage:123][pixivimage:456][jump:2]",
    );
    expect(html).toContain("链接（https://example.org）");
    expect(html).toContain("〔插图〕");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("[jump:");
  });
});
