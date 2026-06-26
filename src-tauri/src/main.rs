// LEOS desktop shell. Loads the React SPA (dev: Vite at devUrl; prod:
// bundled frontendDist). The SPA talks to the Rust API over HTTP via the
// webview's native fetch, so no Tauri commands are needed yet.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Embedded API server (Rust + SQLite) on :8787 — single self-contained app,
    // no separate server process.
    std::thread::spawn(leos_server::run);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running LEOS");
}
