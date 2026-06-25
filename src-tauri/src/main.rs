// HCW-SMS desktop shell. Loads the React SPA (dev: Vite at devUrl; prod:
// bundled frontendDist). The SPA talks to the PHP API over HTTP via the
// webview's native fetch, so no Tauri commands are needed yet.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running HCW-SMS");
}
