#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Stronghold salt dosyası snapshot ve şifreli materyallerle aynı
            // AppData/mihenk-vault klasöründe tutulur; böylece şifreli yedek
            // snapshot + salt + materyal dosyalarını birlikte taşıyabilir.
            let app_data_dir = app.path().app_data_dir()?;
            let vault_dir = app_data_dir.join("mihenk-vault");
            std::fs::create_dir_all(&vault_dir)?;

            let salt_path = vault_dir.join("stronghold.salt");

            // Önceki geliştirme önizlemesindeki salt konumundan geriye uyumlu taşıma.
            let legacy_salt_path = app
                .path()
                .app_local_data_dir()?
                .join("mihenk-stronghold.salt");

            if !salt_path.exists() && legacy_salt_path.exists() {
                std::fs::copy(&legacy_salt_path, &salt_path)?;
                std::fs::File::open(&salt_path)?.sync_all()?;
                std::fs::remove_file(&legacy_salt_path)?;
            }

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
