#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init());

    // Geliştirme/test derlemelerinde updater servisi başlatılmaz.
    // Yayın derlemesi gerçek public key ve endpoint'i release config katmanından alır.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("MİHENK masaüstü uygulaması başlatılamadı.");
}
