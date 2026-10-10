use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::LazyLock;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountStatus {
    pub account: Option<Account>,
    pub error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    pub keyword: String,
    pub target: SearchTarget,
    pub order: SearchOrder,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchTarget {
    PartialMatchForTags,
    ExactMatchForTags,
    Keyword,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchOrder {
    DateDesc,
    DateAsc,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Series {
    pub id: String,
    pub title: String,
    pub order: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NovelSummary {
    pub id: String,
    pub title: String,
    pub author: String,
    pub caption: String,
    pub tags: Vec<String>,
    pub published_at: String,
    pub bookmarks: Option<u64>,
    pub views: Option<u64>,
    pub text_length: Option<u64>,
    pub series: Option<Series>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub items: Vec<NovelSummary>,
    pub next_cursor: Option<String>,
}

#[derive(Serialize)]
pub struct NovelContent {
    pub id: String,
    pub title: String,
    pub author: String,
    pub text: String,
    pub paragraphs: Vec<String>,
}

pub fn string_id(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_owned)
        .or_else(|| value.as_u64().map(|v| v.to_string()))
}

pub fn plain_caption(value: &str) -> String {
    static BREAKS: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"(?i)<br\s*/?>").unwrap());
    static TAGS: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"<[^>]*>").unwrap());
    let with_breaks = BREAKS.replace_all(value, "\n");
    html_escape::decode_html_entities(&TAGS.replace_all(&with_breaks, "")).into_owned()
}

pub fn map_novel(value: &Value) -> Result<NovelSummary, String> {
    let id = string_id(&value["id"]).ok_or("Pixiv 返回了缺少 ID 的作品。")?;
    let series = string_id(&value["series"]["id"]).map(|id| Series {
        id,
        title: value["series"]["title"].as_str().unwrap_or("").to_owned(),
        order: value["series"]["content_order"].as_u64(),
    });
    Ok(NovelSummary {
        id,
        title: value["title"].as_str().unwrap_or("无标题").to_owned(),
        author: value["user"]["name"]
            .as_str()
            .unwrap_or("未知作者")
            .to_owned(),
        caption: plain_caption(value["caption"].as_str().unwrap_or("")),
        tags: value["tags"]
            .as_array()
            .map(|tags| {
                tags.iter()
                    .filter_map(|tag| tag["name"].as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default(),
        published_at: value["create_date"].as_str().unwrap_or("").to_owned(),
        bookmarks: value["total_bookmarks"].as_u64(),
        views: value["total_view"].as_u64(),
        text_length: value["text_length"].as_u64(),
        series,
    })
}

pub fn extract_novel(html: &str) -> Result<Value, String> {
    static MARKER: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"\bnovel\s*:\s*\{").unwrap());
    let marker = MARKER
        .find(html)
        .ok_or("小说正文格式已变化，暂时无法解析。")?;
    // Stream decoding consumes one JSON object, correctly handling braces inside strings.
    serde_json::Deserializer::from_str(&html[marker.end() - 1..])
        .into_iter::<Value>()
        .next()
        .ok_or("小说正文为空。")?
        .map_err(|_| "小说正文格式无法解析。".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_statistics_without_inventing_missing_values() {
        let value = serde_json::json!({"id":123,"title":"标题","caption":"a<br />b &amp; c", "tags":[{"name":"原创"}],"total_bookmarks":0});
        let novel = map_novel(&value).unwrap();
        assert_eq!(novel.id, "123");
        assert_eq!(novel.bookmarks, Some(0));
        assert_eq!(novel.views, None);
        assert_eq!(novel.caption, "a\nb & c");
    }
    #[test]
    fn parses_embedded_json_without_executing_scripts() {
        let value = extract_novel(r#"<script>var x={ novel: {"text":"a } { b","title":"标题"}, isOwnWork: false };</script>"#).unwrap();
        assert_eq!(value["text"], "a } { b");
        assert!(extract_novel("<html>login required</html>").is_err());
    }
}
