pub mod model;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use model::*;
use reqwest::{Client, StatusCode};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::Mutex;
use url::Url;

const API: &str = "https://app-api.pixiv.net";
const TOKEN_URL: &str = "https://oauth.secure.pixiv.net/auth/token";
const REDIRECT: &str = "https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback";
// Public app interoperability parameters documented by PixivPy; not user credentials.
const CLIENT_ID: &str = "MOBrBDS8blbauoSck0ZfDbtuzpyT";
const CLIENT_SECRET: &str = "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj";
const HASH_SALT: &str = "28c1fdd170a5204386cb1313c7077b34f83e4aaf4aa829ce78c231e05b0bae2c";
const USER_AGENT: &str = "PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)";

struct Session {
    access: String,
    refresh: String,
    expires: Instant,
    account: Account,
}
#[derive(Default)]
struct Auth {
    session: Option<Session>,
    restored: bool,
}
pub struct PixivService {
    http: Client,
    auth: Mutex<Auth>,
    generation: AtomicU64,
}

fn storage() -> Result<keyring::Entry, String> {
    if cfg!(target_os = "android") {
        return Err("Android 安全存储尚未接入。".into());
    }
    keyring::Entry::new("io.github.longyiqiang.pixivpp", "pixiv-refresh-token")
        .map_err(|_| "无法访问系统安全存储。".into())
}

async fn load_refresh() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| match storage()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("无法读取系统安全存储，请检查钥匙串是否已解锁。".into()),
    })
    .await
    .map_err(|_| "安全存储操作失败。".to_owned())?
}
async fn save_refresh(token: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        storage()?
            .set_password(&token)
            .map_err(|_| "无法保存登录信息到系统安全存储。".to_owned())
    })
    .await
    .map_err(|_| "安全存储操作失败。".to_owned())?
}
async fn delete_refresh() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| match storage()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("无法删除登录信息，请检查系统安全存储。".into()),
    })
    .await
    .map_err(|_| "安全存储操作失败。".to_owned())?
}

fn status_error(status: StatusCode, login: bool) -> String {
    match status.as_u16() {
        400 | 401 if login => "登录凭据无效或授权已过期，请重新登录。".into(),
        401 => "登录已过期，请重新登录。".into(),
        403 => "Pixiv 拒绝访问，请检查账号权限或稍后重试。".into(),
        404 => "作品不存在或已被删除。".into(),
        429 => "请求过于频繁，请稍后重试。".into(),
        code => format!("Pixiv 请求失败（HTTP {code}），请稍后重试。"),
    }
}
fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "连接 Pixiv 超时，请检查网络后重试。".into()
    } else {
        "无法连接 Pixiv，请检查网络连接。".into()
    }
}
fn parse_session(value: Value) -> Result<Session, String> {
    let value = value.get("response").unwrap_or(&value);
    let access = value["access_token"]
        .as_str()
        .filter(|v| !v.is_empty())
        .ok_or("Pixiv 未返回有效登录凭据。")?;
    let refresh = value["refresh_token"]
        .as_str()
        .filter(|v| !v.is_empty())
        .ok_or("Pixiv 未返回刷新凭据。")?;
    let account = Account {
        id: string_id(&value["user"]["id"]).ok_or("Pixiv 未返回账号信息。")?,
        name: value["user"]["name"]
            .as_str()
            .unwrap_or("Pixiv 用户")
            .to_owned(),
    };
    let lifetime = value["expires_in"].as_u64().unwrap_or(3600).clamp(1, 86400);
    Ok(Session {
        access: access.into(),
        refresh: refresh.into(),
        expires: Instant::now() + Duration::from_secs(lifetime.saturating_sub(60)),
        account,
    })
}

pub fn validate_cursor(cursor: &str) -> Result<Url, String> {
    let url = Url::parse(cursor).map_err(|_| "无效的分页位置。")?;
    if url.scheme() != "https"
        || url.host_str() != Some("app-api.pixiv.net")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/v1/search/novel"
    {
        return Err("无效的分页地址。".into());
    }
    Ok(url)
}

pub fn callback_code(url: &Url) -> Option<String> {
    let exact_https = url.scheme() == "https"
        && url.host_str() == Some("app-api.pixiv.net")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/web/v1/users/auth/pixiv/callback";
    let exact_scheme = url.scheme() == "pixiv"
        && url.host_str() == Some("account")
        && url.path() == "/login"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none();
    if !exact_https && !exact_scheme {
        return None;
    }
    url.query_pairs()
        .find(|(key, value)| key == "code" && !value.is_empty())
        .map(|(_, value)| value.into_owned())
}

impl PixivService {
    pub fn new() -> Result<Self, reqwest::Error> {
        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(USER_AGENT)
            .build()?;
        Ok(Self {
            http,
            auth: Mutex::new(Auth::default()),
            generation: AtomicU64::new(0),
        })
    }
    async fn token(&self, extra: Vec<(&str, String)>) -> Result<Session, String> {
        let stamp = chrono::Utc::now()
            .format("%Y-%m-%dT%H:%M:%S+00:00")
            .to_string();
        let hash = format!("{:x}", md5::compute(format!("{stamp}{HASH_SALT}")));
        let mut form = vec![
            ("client_id", CLIENT_ID.to_owned()),
            ("client_secret", CLIENT_SECRET.to_owned()),
            ("get_secure_url", "1".to_owned()),
        ];
        form.extend(extra);
        let response = self
            .http
            .post(TOKEN_URL)
            .header("X-Client-Time", stamp)
            .header("X-Client-Hash", hash)
            .header("App-OS", "ios")
            .header("App-OS-Version", "14.6")
            .form(&form)
            .send()
            .await
            .map_err(network_error)?;
        if !response.status().is_success() {
            return Err(status_error(response.status(), true));
        }
        parse_session(
            response
                .json::<Value>()
                .await
                .map_err(|_| "Pixiv 登录响应格式无法解析。".to_owned())?,
        )
    }
    async fn refresh(&self, token: String) -> Result<Session, String> {
        self.token(vec![
            ("grant_type", "refresh_token".into()),
            ("refresh_token", token),
        ])
        .await
    }
    async fn ensure(&self, auth: &mut Auth) -> Result<(), String> {
        if !auth.restored {
            if let Some(token) = load_refresh().await? {
                let session = self.refresh(token).await?;
                save_refresh(session.refresh.clone()).await?;
                auth.session = Some(session);
            }
            auth.restored = true;
        }
        if let Some(session) = &auth.session
            && session.expires <= Instant::now()
        {
            let next = self.refresh(session.refresh.clone()).await?;
            save_refresh(next.refresh.clone()).await?;
            auth.session = Some(next);
        }
        Ok(())
    }
    pub async fn account(&self) -> Result<AccountStatus, String> {
        let mut auth = self.auth.lock().await;
        self.ensure(&mut auth).await?;
        Ok(AccountStatus {
            account: auth.session.as_ref().map(|s| s.account.clone()),
            error: None,
        })
    }
    async fn access(&self) -> Result<String, String> {
        let mut auth = self.auth.lock().await;
        self.ensure(&mut auth).await?;
        auth.session
            .as_ref()
            .map(|s| s.access.clone())
            .ok_or_else(|| "请先在设置中登录 Pixiv。".into())
    }
    pub async fn import(&self, token: String) -> Result<AccountStatus, String> {
        let token = token.trim();
        if token.is_empty() || token.len() > 4096 {
            return Err("请输入有效的 Refresh Token。".into());
        }
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let session = self.refresh(token.to_owned()).await?;
        self.store_session(session, generation).await
    }
    async fn store_session(
        &self,
        session: Session,
        generation: u64,
    ) -> Result<AccountStatus, String> {
        let mut auth = self.auth.lock().await;
        if self.generation.load(Ordering::SeqCst) != generation {
            return Err("登录已取消。".into());
        }
        let previous = load_refresh().await?;
        if self.generation.load(Ordering::SeqCst) != generation {
            return Err("登录已取消。".into());
        }
        save_refresh(session.refresh.clone()).await?;
        if self.generation.load(Ordering::SeqCst) != generation {
            match previous {
                Some(token) => save_refresh(token).await?,
                None => delete_refresh().await?,
            }
            return Err("登录已取消。".into());
        }
        let status = AccountStatus {
            account: Some(session.account.clone()),
            error: None,
        };
        auth.session = Some(session);
        auth.restored = true;
        Ok(status)
    }
    pub async fn logout(&self) -> Result<(), String> {
        let mut auth = self.auth.lock().await;
        self.generation.fetch_add(1, Ordering::SeqCst);
        delete_refresh().await?;
        auth.session = None;
        auth.restored = true;
        Ok(())
    }
    pub fn begin_login(self: &Arc<Self>, app: AppHandle) -> Result<(), String> {
        if let Some(window) = app.get_webview_window("pixiv-login") {
            window.set_focus().map_err(|_| "无法激活登录窗口。")?;
            return Ok(());
        }
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes).map_err(|_| "无法创建安全登录会话。")?;
        let verifier = URL_SAFE_NO_PAD.encode(bytes);
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let mut login_url = Url::parse(&format!("{API}/web/v1/login")).unwrap();
        login_url
            .query_pairs_mut()
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("client", "pixiv-android");
        let captured = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let nav_captured = captured.clone();
        let finished = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let nav_finished = finished.clone();
        let service = self.clone();
        let handle = app.clone();
        let login_window =
            WebviewWindowBuilder::new(&app, "pixiv-login", WebviewUrl::External(login_url))
                .title("登录 Pixiv · pixivpp")
                .inner_size(520.0, 740.0)
                .on_navigation(move |url| {
                    if let Some(code) = callback_code(url) {
                        if nav_captured.swap(true, Ordering::SeqCst) {
                            return false;
                        }
                        let service = service.clone();
                        let handle = handle.clone();
                        let verifier = verifier.clone();
                        let finished = nav_finished.clone();
                        tauri::async_runtime::spawn(async move {
                            let result = service
                                .token(vec![
                                    ("grant_type", "authorization_code".into()),
                                    ("code", code),
                                    ("code_verifier", verifier),
                                    ("redirect_uri", REDIRECT.into()),
                                    ("include_policy", "true".into()),
                                ])
                                .await;
                            let result = match result {
                                Ok(session) => service.store_session(session, generation).await,
                                Err(error) => Err(error),
                            };
                            if service.generation.load(Ordering::SeqCst) == generation {
                                let status = match result {
                                    Ok(status) => status,
                                    Err(error) => AccountStatus {
                                        account: None,
                                        error: Some(error),
                                    },
                                };
                                finished.store(true, Ordering::SeqCst);
                                let _ = handle.emit_to("main", "pixiv-account", status);
                                if let Some(window) = handle.get_webview_window("pixiv-login") {
                                    let _ = window.close();
                                }
                            }
                        });
                        return false;
                    }
                    url.scheme() == "https"
                })
                .build()
                .map_err(|_| "无法打开 Pixiv 登录窗口。")?;
        let service = self.clone();
        login_window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. })
                && !finished.load(Ordering::SeqCst)
                && service
                    .generation
                    .compare_exchange(
                        generation,
                        generation + 1,
                        Ordering::SeqCst,
                        Ordering::SeqCst,
                    )
                    .is_ok()
            {
                let _ = app.emit_to(
                    "main",
                    "pixiv-account",
                    AccountStatus {
                        account: None,
                        error: Some("已取消登录。".into()),
                    },
                );
            }
        });
        Ok(())
    }
    async fn get(&self, url: Url) -> Result<reqwest::Response, String> {
        let access = self.access().await?;
        let response = self
            .http
            .get(url)
            .bearer_auth(access)
            .header("App-OS", "ios")
            .header("App-OS-Version", "14.6")
            .header("Accept-Language", "zh-cn")
            .send()
            .await
            .map_err(network_error)?;
        if !response.status().is_success() {
            return Err(status_error(response.status(), false));
        }
        Ok(response)
    }
    pub async fn search(
        &self,
        query: SearchQuery,
        cursor: Option<String>,
    ) -> Result<SearchPage, String> {
        if query.keyword.trim().is_empty() {
            return Err("请输入搜索关键词。".into());
        }
        let url = if let Some(cursor) = cursor {
            validate_cursor(&cursor)?
        } else {
            let mut url = Url::parse(&format!("{API}/v1/search/novel")).unwrap();
            let target = serde_json::to_value(query.target).unwrap();
            let order = serde_json::to_value(query.order).unwrap();
            url.query_pairs_mut()
                .append_pair("word", query.keyword.trim())
                .append_pair("search_target", target.as_str().unwrap())
                .append_pair("sort", order.as_str().unwrap())
                .append_pair("filter", "for_ios")
                .append_pair("merge_plain_keyword_results", "true")
                .append_pair("include_translated_tag_results", "true");
            if let Some(start) = query.start_date {
                url.query_pairs_mut().append_pair("start_date", &start);
            }
            if let Some(end) = query.end_date {
                url.query_pairs_mut().append_pair("end_date", &end);
            }
            url
        };
        let value = self
            .get(url)
            .await?
            .json::<Value>()
            .await
            .map_err(|_| "Pixiv 搜索响应格式无法解析。".to_owned())?;
        let novels = value["novels"].as_array().ok_or("Pixiv 未返回小说列表。")?;
        let items = novels
            .iter()
            .map(map_novel)
            .collect::<Result<Vec<_>, _>>()?;
        let next_cursor = value["next_url"]
            .as_str()
            .filter(|url| !url.is_empty())
            .map(str::to_owned);
        if let Some(cursor) = &next_cursor {
            validate_cursor(cursor)?;
        }
        Ok(SearchPage { items, next_cursor })
    }
    pub async fn read(&self, id: String) -> Result<NovelContent, String> {
        if id.is_empty() || id.len() > 20 || !id.bytes().all(|b| b.is_ascii_digit()) {
            return Err("无效的小说 ID。".into());
        }
        let mut url = Url::parse(&format!("{API}/webview/v2/novel")).unwrap();
        url.query_pairs_mut()
            .append_pair("id", &id)
            .append_pair("viewer_version", "20221031_ai");
        let html = self
            .get(url)
            .await?
            .text()
            .await
            .map_err(|_| "小说正文读取失败。".to_owned())?;
        let novel = extract_novel(&html)?;
        let text = novel["text"]
            .as_str()
            .ok_or("此小说没有可读取的正文，或当前账号没有访问权限。")?
            .to_owned();
        let title = novel["title"].as_str().unwrap_or("无标题").to_owned();
        let author = novel["userName"]
            .as_str()
            .or_else(|| novel["user"]["name"].as_str())
            .unwrap_or("")
            .to_owned();
        Ok(NovelContent {
            id,
            title,
            author,
            paragraphs: text.lines().map(str::to_owned).collect(),
            text,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_accepts_pixiv_search_pagination() {
        assert!(validate_cursor("https://app-api.pixiv.net/v1/search/novel?offset=30").is_ok());
        for value in [
            "https://evil.test/v1/search/novel",
            "http://app-api.pixiv.net/v1/search/novel",
            "https://app-api.pixiv.net/v1/user/detail",
            "https://u@app-api.pixiv.net/v1/search/novel",
        ] {
            assert!(validate_cursor(value).is_err());
        }
    }
    #[test]
    fn validates_oauth_callback_origin_and_path() {
        assert_eq!(
            callback_code(&Url::parse(&format!("{REDIRECT}?code=abc")).unwrap()),
            Some("abc".into())
        );
        assert_eq!(
            callback_code(&Url::parse("pixiv://account/login?code=abc").unwrap()),
            Some("abc".into())
        );
        assert!(callback_code(&Url::parse("https://evil.test/?code=abc").unwrap()).is_none());
    }
    #[test]
    fn handles_both_oauth_response_shapes() {
        let value = serde_json::json!({"access_token":"sample","refresh_token":"sample-refresh","expires_in":3600,"user":{"id":12,"name":"name"}});
        assert_eq!(parse_session(value.clone()).unwrap().account.id, "12");
        assert_eq!(
            parse_session(serde_json::json!({"response":value}))
                .unwrap()
                .account
                .id,
            "12"
        );
        assert!(parse_session(serde_json::json!({"error":"invalid"})).is_err());
    }
}
