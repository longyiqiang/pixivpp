// Native Pixiv authentication, networking and short-lived cache will be added here.
// No credentials or unrestricted network bridge are exposed in the initial scaffold.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running pixivpp");
}
