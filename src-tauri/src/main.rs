#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::Manager;

static STARTUP_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

fn fallback_startup_log_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return std::env::var_os("LOCALAPPDATA").map(|root| {
            PathBuf::from(root)
                .join("com.mihenk.desktop")
                .join("logs")
                .join("startup.log")
        });
    }

    #[cfg(target_os = "macos")]
    {
        return std::env::var_os("HOME").map(|root| {
            PathBuf::from(root)
                .join("Library")
                .join("Logs")
                .join("com.mihenk.desktop")
                .join("startup.log")
        });
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|root| PathBuf::from(root).join(".local/share")))
            .map(|root| root.join("com.mihenk.desktop").join("logs").join("startup.log"))
    }
}

fn startup_log(event: &str, detail: &str) {
    let path = STARTUP_LOG_PATH
        .get()
        .cloned()
        .or_else(fallback_startup_log_path);
    let Some(path) = path else {
        return;
    };

    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let safe_detail = detail.replace('\r', " ").replace('\n', " ");

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{timestamp} [{event}] {safe_detail}");
    }
}

fn configure_startup_log(app: &tauri::App) {
    if let Ok(log_dir) = app.path().app_log_dir() {
        let _ = fs::create_dir_all(&log_dir);
        let _ = STARTUP_LOG_PATH.set(log_dir.join("startup.log"));
    }
    startup_log("baslangic", "MİHENK masaüstü süreci başladı.");
}

fn show_startup_error() {
    #[cfg(target_os = "windows")]
    {
        use std::{ffi::OsStr, os::windows::ffi::OsStrExt};

        let message = OsStr::new(
            "MİHENK açılırken bir başlangıç hatası oluştu. Ayrıntılar %LOCALAPPDATA%\\com.mihenk.desktop\\logs\\startup.log dosyasına yazıldı.",
        )
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<u16>>();
        let title = OsStr::new("MİHENK başlatılamadı")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<u16>>();

        #[link(name = "user32")]
        extern "system" {
            fn MessageBoxW(
                window: *mut std::ffi::c_void,
                text: *const u16,
                caption: *const u16,
                kind: u32,
            ) -> i32;
        }

        unsafe {
            let _ = MessageBoxW(std::ptr::null_mut(), message.as_ptr(), title.as_ptr(), 0x10);
        }
    }
}

fn main() {
    std::panic::set_hook(Box::new(|panic| {
        startup_log("panic", &panic.to_string());
        show_startup_error();
    }));

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            configure_startup_log(app);

            let setup_result = (|| -> Result<(), Box<dyn std::error::Error>> {
                // Stronghold salt dosyası snapshot ve şifreli materyallerle aynı
                // AppData/mihenk-vault klasöründe tutulur; böylece şifreli yedek
                // snapshot + salt + materyal dosyalarını birlikte taşıyabilir.
                startup_log("app_data", "Uygulama veri dizini çözümleniyor.");
                let app_data_dir = app.path().app_data_dir()?;
                let vault_dir = app_data_dir.join("mihenk-vault");
                fs::create_dir_all(&vault_dir)?;
                startup_log("app_data", "Yerel kasa dizini hazır.");

                let salt_path = vault_dir.join("stronghold.salt");

                // Önceki geliştirme önizlemesindeki salt konumundan geriye uyumlu taşıma.
                let legacy_salt_path = app
                    .path()
                    .app_local_data_dir()?
                    .join("mihenk-stronghold.salt");

                if !salt_path.exists() && legacy_salt_path.exists() {
                    startup_log("salt_migration", "Eski Stronghold salt dosyası taşınıyor.");
                    fs::copy(&legacy_salt_path, &salt_path)?;
                    fs::File::open(&salt_path)?.sync_all()?;
                    fs::remove_file(&legacy_salt_path)?;
                    startup_log("salt_migration", "Eski salt dosyası taşındı.");
                }

                startup_log("stronghold", "Stronghold eklentisi başlatılıyor.");
                app.handle().plugin(
                    tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build(),
                )?;
                startup_log("stronghold", "Stronghold eklentisi hazır.");
                Ok(())
            })();

            if let Err(error) = &setup_result {
                startup_log("setup_error", &error.to_string());
            } else {
                startup_log("setup", "Tauri başlangıç kurulumu tamamlandı.");
            }

            setup_result
        });

    // Geliştirme/test derlemelerinde updater servisi başlatılmaz.
    // Yayın derlemesi gerçek public key ve endpoint'i release config katmanından alır.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    if let Err(error) = builder.run(tauri::generate_context!()) {
        startup_log("runtime_error", &error.to_string());
        show_startup_error();
    }
}
