#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let local_data_dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&local_data_dir)?;
            let salt_path = local_data_dir.join("mihenk-stronghold.salt");

            // Stronghold, Argon2 tabanlı parola türetimiyle kasa snapshot'ını korur.
            app.handle().plugin(
                tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build()
            )?;
            Ok(())
        });

    // Geliştirme/test derlemelerinde updater servisi başlatılmaz.
    // Yayın derlemesi gerçek public key ve endpoint'i release config katmanından alır.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("MİHENK masaüstü uygulaması başlatılamadı.");
}
