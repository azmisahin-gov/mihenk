#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::OnceLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tauri::Manager;

mod audio_playback;
mod vault_backup;
mod asr;

static STARTUP_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
const ORPHAN_IMPORT_MIN_AGE: Duration = Duration::from_secs(24 * 60 * 60);

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

fn is_interrupted_audio_part_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == 37
        && &bytes[32..] == b".part"
        && bytes[..32]
            .iter()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
}

fn cleanup_interrupted_audio_imports(materials_dir: &Path) -> std::io::Result<usize> {
    cleanup_interrupted_audio_imports_older_than(materials_dir, ORPHAN_IMPORT_MIN_AGE)
}

fn cleanup_interrupted_audio_imports_older_than(
    materials_dir: &Path,
    minimum_age: Duration,
) -> std::io::Result<usize> {
    match fs::symlink_metadata(materials_dir) {
        Ok(metadata) if metadata.file_type().is_dir() => {}
        Ok(_) => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Ses materyali yolu normal bir klasör değil.",
            ));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error),
    }

    let mut removed = 0;
    for entry in fs::read_dir(materials_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        if !is_interrupted_audio_part_name(name) {
            continue;
        }
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)?;
        if !metadata.file_type().is_file() {
            continue;
        }
        let modified = match metadata.modified() {
            Ok(modified) => modified,
            Err(_) => continue,
        };
        let age = SystemTime::now().duration_since(modified).unwrap_or_default();
        if age >= minimum_age {
            fs::remove_file(path)?;
            removed += 1;
        }
    }
    Ok(removed)
}

fn configure_startup_log(app: &tauri::App) {
    // Windows'ta tanılama yolu kullanıcı belgeleriyle tutarlı ve kullanıcıya
    // gösterilebilir olsun: %LOCALAPPDATA%\\com.mihenk.desktop\\logs.
    // Diğer platformlarda yerel veri dizinini, bulunamazsa Tauri log dizinini kullan.
    let log_path = fallback_startup_log_path()
        .or_else(|| app.path().app_log_dir().ok().map(|directory| directory.join("startup.log")));

    if let Some(path) = log_path {
        let _ = STARTUP_LOG_PATH.set(path);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_only_generated_partial_import_names() {
        assert!(is_interrupted_audio_part_name("0123456789abcdef0123456789abcdef.part"));
        assert!(!is_interrupted_audio_part_name("0123456789ABCDEF0123456789ABCDEF.part"));
        assert!(!is_interrupted_audio_part_name("0123456789abcdef0123456789abcdef.mhn"));
        assert!(!is_interrupted_audio_part_name("../0123456789abcdef0123456789abcdef.part"));
    }

    #[test]
    fn removes_only_generated_partial_import_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "mihenk-part-recovery-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        let part = directory.join("0123456789abcdef0123456789abcdef.part");
        let encrypted = directory.join("0123456789abcdef0123456789abcdef.mhn");
        fs::write(&part, b"partial").unwrap();
        fs::write(&encrypted, b"encrypted").unwrap();

        let result = cleanup_interrupted_audio_imports_older_than(&directory, Duration::ZERO);
        assert_eq!(result.unwrap(), 1);
        assert!(!part.exists());
        assert!(encrypted.exists());
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn preserves_recent_partial_import_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "mihenk-recent-part-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        let part = directory.join("abcdef0123456789abcdef0123456789.part");
        fs::write(&part, b"active-or-recent").unwrap();

        let result = cleanup_interrupted_audio_imports(&directory);
        assert_eq!(result.unwrap(), 0);
        assert!(part.exists());
        fs::remove_dir_all(&directory).unwrap();
    }
}

fn main() {
    // Bu kayıt Tauri/WebView2 kurulumundan önce yazılır. Dosya yoksa süreç
    // Rust main() giriş noktasına ulaşmadan Windows DLL yüklemesinde kapanmıştır.
    startup_log("process_entry", "Rust main() giriş noktasına ulaşıldı.");
    startup_log(
        "process_entry",
        if cfg!(debug_assertions) { "Derleme profili: debug." } else { "Derleme profili: release." },
    );

    std::panic::set_hook(Box::new(|panic| {
        startup_log("panic", &panic.to_string());
        show_startup_error();
    }));

    let builder = tauri::Builder::default()
        .manage(audio_playback::PlaybackSessions::default())
        .register_uri_scheme_protocol("mihenk-audio", |context, request| {
            audio_playback::handle_protocol_request(context, request)
        })
        .invoke_handler(tauri::generate_handler![
            audio_playback::open_audio_playback_session,
            audio_playback::verify_stored_audio_copy_command,
            audio_playback::close_audio_playback_session,
            audio_playback::clear_audio_playback_sessions,
            vault_backup::export_local_vault_backup,
            vault_backup::restore_local_vault_backup,
            asr::get_seda_model_status_command,
            asr::install_seda_model_command,
            asr::inspect_stored_audio_command,
            asr::transcribe_stored_audio_command,
        ])
        .plugin(tauri_plugin_dialog::init())
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
                let materials_dir = vault_dir.join("materials");
                fs::create_dir_all(&materials_dir)?;
                let recovered_imports = cleanup_interrupted_audio_imports(&materials_dir)?;
                if recovered_imports > 0 {
                    startup_log(
                        "import_recovery",
                        &format!("{recovered_imports} yarım ses içe aktarma dosyası temizlendi."),
                    );
                }
                startup_log("app_data", "Yerel kasa dizini ve materyal kurtarma denetimi hazır.");

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
