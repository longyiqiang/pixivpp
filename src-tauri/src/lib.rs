mod pixiv;
use pixiv::{PixivService, model::*};
use std::sync::Arc;
use tauri::{Emitter, Manager};

fn main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("此窗口无权访问应用数据。".into())
    }
}

#[tauri::command]
async fn pixiv_account(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Arc<PixivService>>,
) -> Result<AccountStatus, String> {
    main_window(&window)?;
    state.account().await
}
#[tauri::command]
async fn pixiv_login(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<PixivService>>,
) -> Result<(), String> {
    main_window(&window)?;
    state.inner().begin_login(app)
}
#[tauri::command]
async fn pixiv_import_token(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    token: String,
    state: tauri::State<'_, Arc<PixivService>>,
) -> Result<AccountStatus, String> {
    main_window(&window)?;
    if let Some(login) = app.get_webview_window("pixiv-login") {
        let _ = login.close();
    }
    state.import(token).await
}
#[tauri::command]
async fn pixiv_logout(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<PixivService>>,
) -> Result<(), String> {
    main_window(&window)?;
    state.logout().await?;
    if let Some(login) = app.get_webview_window("pixiv-login") {
        let _ = login.close();
    }
    let _ = app.emit_to("main", "pixiv-account", AccountStatus::default());
    Ok(())
}
#[tauri::command]
async fn pixiv_search(
    window: tauri::WebviewWindow,
    query: SearchQuery,
    cursor: Option<String>,
    state: tauri::State<'_, Arc<PixivService>>,
) -> Result<SearchPage, String> {
    main_window(&window)?;
    state.search(query, cursor).await
}
#[tauri::command]
async fn pixiv_read(
    window: tauri::WebviewWindow,
    id: String,
    state: tauri::State<'_, Arc<PixivService>>,
) -> Result<NovelContent, String> {
    main_window(&window)?;
    state.read(id).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(Arc::new(PixivService::new()?));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pixiv_account,
            pixiv_login,
            pixiv_import_token,
            pixiv_logout,
            pixiv_search,
            pixiv_read
        ])
        .run(tauri::generate_context!())
        .expect("error while running pixivpp");
}
