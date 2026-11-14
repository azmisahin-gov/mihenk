use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

const MAGIC: &[u8; 8] = b"MHKBAK01";
const BACKUP_VERSION: u32 = 1;
const HEADER_BYTES: u64 = 16;
const HASH_BYTES: usize = 32;
const MAX_BACKUP_BYTES: u64 = 512 * 1024 * 1024;
const MAX_BACKUP_FILES: usize = 1024;
const MAX_PATH_BYTES: usize = 256;
const MAX_ENTRY_BYTES: u64 = 256 * 1024 * 1024;
const IO_CHUNK_BYTES: usize = 64 * 1024;
const SNAPSHOT_PATH: &str = "mihenk-vault/secure.hold";
const SALT_PATH: &str = "mihenk-vault/stronghold.salt";
const MATERIALS_PATH: &str = "mihenk-vault/materials";

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

struct BackupSource {
    archive_path: String,
    path_bytes: Vec<u8>,
    file_path: PathBuf,
    size_bytes: u64,
}

fn is_material_file_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == 36
        && bytes[32..] == *b".mhn"
        && bytes[..32]
            .iter()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(byte))
}

fn add_source(
    sources: &mut Vec<BackupSource>,
    archive_path: String,
    file_path: PathBuf,
) -> Result<(), String> {
    let path_bytes = archive_path.as_bytes().to_vec();
    if path_bytes.is_empty() || path_bytes.len() > MAX_PATH_BYTES {
        return Err("Yedek dosya yolu uzunluğu geçersiz.".into());
    }

    let metadata = fs::symlink_metadata(&file_path)
        .map_err(|_| format!("Kasa yedek dosyası okunamadı: {}", archive_path))?;
    if !metadata.file_type().is_file() {
        return Err("Yedekte yalnızca normal dosyalara izin verilir.".into());
    }
    if metadata.len() == 0 {
        return Err("Yedek dosyası boş veya geçersiz.".into());
    }
    if metadata.len() > MAX_ENTRY_BYTES {
        return Err("Yedek içindeki bir dosya 256 MiB sınırını aşıyor.".into());
    }

    sources.push(BackupSource {
        archive_path,
        path_bytes,
        file_path,
        size_bytes: metadata.len(),
    });
    Ok(())
}

fn collect_sources(vault_dir: &Path) -> Result<Vec<BackupSource>, String> {
    let mut sources = Vec::new();
    add_source(
        &mut sources,
        SNAPSHOT_PATH.into(),
        vault_dir.join("secure.hold"),
    )?;
    add_source(
        &mut sources,
        SALT_PATH.into(),
        vault_dir.join("stronghold.salt"),
    )?;

    let materials_dir = vault_dir.join("materials");
    match fs::symlink_metadata(&materials_dir) {
        Ok(metadata) if metadata.file_type().is_dir() => {
            let children = fs::read_dir(&materials_dir)
                .map_err(|_| "Kasa materyal klasörü okunamadı.".to_string())?;
            for child in children {
                let child = child.map_err(|_| "Kasa materyal klasörü okunamadı.".to_string())?;
                if !child
                    .file_type()
                    .map_err(|_| "Kasa materyal dosya türü okunamadı.".to_string())?
                    .is_file()
                {
                    return Err("Kasa materyal klasöründe beklenmeyen bir alt klasör veya bağlantı var.".into());
                }
                let name = child
                    .file_name()
                    .into_string()
                    .map_err(|_| "Kasa materyal dosya adı geçersiz.".to_string())?;
                if !is_material_file_name(&name) {
                    return Err("Kasa materyal klasöründe yedeklenmeye uygun olmayan bir dosya var.".into());
                }
                add_source(
                    &mut sources,
                    format!("{MATERIALS_PATH}/{name}"),
                    child.path(),
                )?;
            }
        }
        Ok(_) => return Err("Kasa materyal yolu normal bir klasör değil.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("Kasa materyal klasörü doğrulanamadı.".into()),
    }

    if sources.len() < 2 || sources.len() > MAX_BACKUP_FILES {
        return Err("Yedek dosya sayısı geçersiz.".into());
    }
    sources.sort_by(|left, right| left.archive_path.cmp(&right.archive_path));

    let mut total_bytes = HEADER_BYTES;
    for source in &sources {
        let record_bytes = 2u64
            .checked_add(8)
            .and_then(|value| value.checked_add(HASH_BYTES as u64))
            .and_then(|value| value.checked_add(source.path_bytes.len() as u64))
            .and_then(|value| value.checked_add(source.size_bytes))
            .ok_or_else(|| "Yedek paket boyutu hesaplanamadı.".to_string())?;
        total_bytes = total_bytes
            .checked_add(record_bytes)
            .ok_or_else(|| "Yedek paket boyutu hesaplanamadı.".to_string())?;
    }
    if total_bytes > MAX_BACKUP_BYTES {
        return Err("Kasa yedek paketi 512 MiB sınırını aşıyor.".into());
    }

    Ok(sources)
}

fn hash_source(source: &BackupSource) -> Result<[u8; HASH_BYTES], String> {
    let mut file = File::open(&source.file_path)
        .map_err(|_| format!("Kasa yedek dosyası açılamadı: {}", source.archive_path))?;
    let metadata = file
        .metadata()
        .map_err(|_| format!("Kasa yedek dosyası doğrulanamadı: {}", source.archive_path))?;
    if !metadata.is_file() || metadata.len() != source.size_bytes {
        return Err("Yedek hazırlanırken kasa dosyasının boyutu değişti.".into());
    }

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; IO_CHUNK_BYTES];
    let mut total_read = 0u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| format!("Kasa yedek dosyası okunamadı: {}", source.archive_path))?;
        if read == 0 {
            break;
        }
        total_read = total_read
            .checked_add(read as u64)
            .ok_or_else(|| "Kasa yedek dosyası boyutu geçersiz.".to_string())?;
        if total_read > source.size_bytes {
            return Err("Yedek hazırlanırken kasa dosyası büyüdü.".into());
        }
        hasher.update(&buffer[..read]);
    }

    if total_read != source.size_bytes
        || file
            .metadata()
            .map_err(|_| "Kasa yedek dosyası doğrulanamadı.".to_string())?
            .len()
            != source.size_bytes
    {
        return Err("Yedek hazırlanırken kasa dosyasının boyutu değişti.".into());
    }

    Ok(hasher.finalize().into())
}

fn write_source<W: Write>(
    writer: &mut W,
    source: &BackupSource,
    expected_digest: &[u8; HASH_BYTES],
) -> Result<(), String> {
    let mut file = File::open(&source.file_path)
        .map_err(|_| format!("Kasa yedek dosyası açılamadı: {}", source.archive_path))?;
    let metadata = file
        .metadata()
        .map_err(|_| format!("Kasa yedek dosyası doğrulanamadı: {}", source.archive_path))?;
    if !metadata.is_file() || metadata.len() != source.size_bytes {
        return Err("Yedek yazılırken kasa dosyasının boyutu değişti.".into());
    }

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; IO_CHUNK_BYTES];
    let mut total_read = 0u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| format!("Kasa yedek dosyası okunamadı: {}", source.archive_path))?;
        if read == 0 {
            break;
        }
        total_read = total_read
            .checked_add(read as u64)
            .ok_or_else(|| "Kasa yedek dosyası boyutu geçersiz.".to_string())?;
        if total_read > source.size_bytes {
            return Err("Yedek yazılırken kasa dosyası büyüdü.".into());
        }
        hasher.update(&buffer[..read]);
        writer
            .write_all(&buffer[..read])
            .map_err(|_| "Yedek paketi diske yazılamadı.".to_string())?;
    }

    let actual_digest: [u8; HASH_BYTES] = hasher.finalize().into();
    if total_read != source.size_bytes || &actual_digest != expected_digest {
        return Err("Yedek yazılırken kasa dosyası değişti; paket tamamlanmadı.".into());
    }
    Ok(())
}

fn write_backup_archive<W: Write>(
    writer: &mut W,
    sources: &[BackupSource],
) -> Result<(), String> {
    if sources.len() < 2 || sources.len() > MAX_BACKUP_FILES {
        return Err("Yedek dosya sayısı geçersiz.".into());
    }

    writer
        .write_all(MAGIC)
        .map_err(|_| "Yedek başlığı diske yazılamadı.".to_string())?;
    writer
        .write_all(&BACKUP_VERSION.to_le_bytes())
        .map_err(|_| "Yedek başlığı diske yazılamadı.".to_string())?;
    writer
        .write_all(&(sources.len() as u32).to_le_bytes())
        .map_err(|_| "Yedek başlığı diske yazılamadı.".to_string())?;

    for source in sources {
        let digest = hash_source(source)?;
        let path_length = u16::try_from(source.path_bytes.len())
            .map_err(|_| "Yedek dosya yolu uzunluğu geçersiz.".to_string())?;

        writer
            .write_all(&path_length.to_le_bytes())
            .map_err(|_| "Yedek kaydı diske yazılamadı.".to_string())?;
        writer
            .write_all(&source.size_bytes.to_le_bytes())
            .map_err(|_| "Yedek kaydı diske yazılamadı.".to_string())?;
        writer
            .write_all(&digest)
            .map_err(|_| "Yedek kaydı diske yazılamadı.".to_string())?;
        writer
            .write_all(&source.path_bytes)
            .map_err(|_| "Yedek kaydı diske yazılamadı.".to_string())?;
        write_source(writer, source, &digest)?;
    }
    Ok(())
}

fn unique_sibling_path(destination: &Path, label: &str) -> Result<PathBuf, String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Yedek hedef klasörü geçersiz.".to_string())?;
    let name = destination
        .file_name()
        .ok_or_else(|| "Yedek dosya adı geçersiz.".to_string())?
        .to_string_lossy();

    for _ in 0..128 {
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".{name}.{}.{}.{}.{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or_default(),
            counter,
            label
        ));
        if fs::symlink_metadata(&candidate).is_err() {
            return Ok(candidate);
        }
    }
    Err("Yedek için güvenli geçici dosya adı oluşturulamadı.".into())
}

fn create_temp_output(destination: &Path) -> Result<(PathBuf, File), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Yedek hedef klasörü geçersiz.".to_string())?;
    if !parent.is_dir() {
        return Err("Yedek hedef klasörü bulunamadı.".into());
    }

    for _ in 0..128 {
        let candidate = unique_sibling_path(destination, "mihenk-part")?;
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => return Ok((candidate, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("Geçici yedek dosyası oluşturulamadı.".into()),
        }
    }
    Err("Geçici yedek dosyası oluşturulamadı.".into())
}

fn publish_backup(temp_path: &Path, destination: &Path) -> Result<(), String> {
    let existing = match fs::symlink_metadata(destination) {
        Ok(metadata) if metadata.file_type().is_file() => true,
        Ok(_) => return Err("Yedek hedefi normal bir dosya değil; üzerine yazılmadı.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(_) => return Err("Yedek hedefi doğrulanamadı.".into()),
    };

    if !existing {
        return fs::rename(temp_path, destination)
            .map_err(|_| "Tamamlanan yedek hedef konumuna taşınamadı.".to_string());
    }

    let previous_path = unique_sibling_path(destination, "mihenk-previous")?;
    fs::rename(destination, &previous_path)
        .map_err(|_| "Önceki yedek güvenli biçimde korunamadı; üzerine yazılmadı.".to_string())?;

    if let Err(error) = fs::rename(temp_path, destination) {
        let restored = fs::rename(&previous_path, destination).is_ok();
        return Err(if restored {
            format!("Yeni yedek hedef konumuna taşınamadı: {error}")
        } else {
            "Yeni yedek taşınamadı ve önceki yedek otomatik geri konamadı; .mihenk-previous dosyasını koruyun.".into()
        });
    }

    let _ = fs::remove_file(previous_path);
    Ok(())
}

fn ensure_backup_extension(mut destination: PathBuf) -> PathBuf {
    let has_extension = destination
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("mihenkbackup"));
    if !has_extension {
        destination.set_extension("mihenkbackup");
    }
    destination
}

fn write_vault_backup(vault_dir: &Path, destination: &Path) -> Result<(), String> {
    let sources = collect_sources(vault_dir)?;
    let (temp_path, mut output) = create_temp_output(destination)?;

    let write_result = write_backup_archive(&mut output, &sources)
        .and_then(|()| {
            output
                .sync_all()
                .map_err(|_| "Yedek dosyası diske eşitlenemedi.".to_string())
        });
    drop(output);

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    if let Err(error) = publish_backup(&temp_path, destination) {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub async fn export_local_vault_backup(
    app: tauri::AppHandle,
    file_name: String,
) -> Result<bool, String> {
    if file_name.is_empty()
        || file_name.len() > 180
        || file_name
            .chars()
            .any(|character| character == '/' || character == '\\' || character.is_control())
    {
        return Err("Yedek dosya adı geçersiz.".into());
    }

    let selected = app
        .dialog()
        .file()
        .set_title("MİHENK şifreli kasa yedeğini kaydet")
        .set_file_name(file_name)
        .add_filter("MİHENK şifreli kasa yedeği", &["mihenkbackup"])
        .blocking_save_file();

    let Some(selected) = selected else {
        return Ok(false);
    };
    let selected_path = selected
        .into_path()
        .map_err(|_| "Yedek hedef yolu çözümlenemedi.".to_string())?;
    let destination = ensure_backup_extension(selected_path);
    let vault_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Yerel kasa dizinine erişilemedi.".to_string())?
        .join("mihenk-vault");

    write_vault_backup(&vault_dir, &destination)?;
    Ok(true)
}



fn archive_material_name(path: &str) -> Option<&str> {
    path.strip_prefix("mihenk-vault/materials/")
        .filter(|name| is_material_file_name(name))
}

fn optional_regular_file(path: &Path, label: &str) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(true),
        Ok(_) => Err(format!("{label} normal bir dosya değil.")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err(format!("{label} doğrulanamadı.")),
    }
}

fn validate_restore_target(vault_dir: &Path) -> Result<bool, String> {
    let directory = fs::symlink_metadata(vault_dir)
        .map_err(|_| "Yerel kasa dizinine erişilemedi.".to_string())?;
    if !directory.file_type().is_dir() {
        return Err("Yerel kasa yolu normal bir klasör değil.".into());
    }

    if optional_regular_file(&vault_dir.join("secure.hold"), "Mevcut kasa snapshot'ı")? {
        return Err("Bu cihazda kasa zaten var. Geri yükleme yalnızca boş kasaya yapılabilir.".into());
    }

    let materials_dir = vault_dir.join("materials");
    match fs::symlink_metadata(&materials_dir) {
        Ok(metadata) if metadata.file_type().is_dir() => {
            let entries = fs::read_dir(&materials_dir)
                .map_err(|_| "Mevcut materyal klasörü okunamadı.".to_string())?;
            for entry in entries {
                entry.map_err(|_| "Mevcut materyal klasörü doğrulanamadı.".to_string())?;
                return Err("Materyal klasörü boş değil; geri yükleme mevcut dosyaların üzerine yazmayacak.".into());
            }
        }
        Ok(_) => return Err("Kasa materyal yolu normal bir klasör değil.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("Kasa materyal klasörü doğrulanamadı.".into()),
    }

    optional_regular_file(&vault_dir.join("stronghold.salt"), "Mevcut Stronghold salt dosyası")
}

fn create_restore_stage(vault_dir: &Path) -> Result<PathBuf, String> {
    for _ in 0..128 {
        let candidate = unique_sibling_path(vault_dir, "mihenk-restore")?;
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("Geri yükleme için geçici klasör oluşturulamadı.".into()),
        }
    }
    Err("Geri yükleme için güvenli geçici klasör adı oluşturulamadı.".into())
}

fn read_archive_exact<R: Read>(
    reader: &mut R,
    buffer: &mut [u8],
    consumed: &mut u64,
    archive_length: u64,
) -> Result<(), String> {
    let next = consumed
        .checked_add(buffer.len() as u64)
        .ok_or_else(|| "Yedek paket boyutu geçersiz.".to_string())?;
    if next > archive_length {
        return Err("Yedek kaydı eksik veya kesilmiş.".into());
    }
    reader
        .read_exact(buffer)
        .map_err(|_| "Yedek kaydı eksik veya kesilmiş.".to_string())?;
    *consumed = next;
    Ok(())
}

fn stage_backup_archive<R: Read>(
    reader: &mut R,
    archive_length: u64,
    stage_dir: &Path,
) -> Result<Vec<String>, String> {
    if !(HEADER_BYTES..=MAX_BACKUP_BYTES).contains(&archive_length) {
        return Err("Yedek dosyası boş, eksik veya 512 MiB sınırını aşıyor.".into());
    }

    let mut consumed = 0u64;
    let mut header = [0u8; HEADER_BYTES as usize];
    read_archive_exact(reader, &mut header, &mut consumed, archive_length)?;
    if &header[..8] != MAGIC {
        return Err("Bu dosya MİHENK şifreli yedeği değil.".into());
    }
    if u32::from_le_bytes(header[8..12].try_into().unwrap()) != BACKUP_VERSION {
        return Err("Yedek biçimi sürümü desteklenmiyor.".into());
    }
    let count = u32::from_le_bytes(header[12..16].try_into().unwrap()) as usize;
    if !(2..=MAX_BACKUP_FILES).contains(&count) {
        return Err("Yedek dosya sayısı geçersiz.".into());
    }

    let mut seen = HashSet::with_capacity(count);
    let mut material_names = Vec::new();
    let mut has_snapshot = false;
    let mut has_salt = false;
    let mut total_bytes = HEADER_BYTES;

    for _ in 0..count {
        let mut record_header = [0u8; 2 + 8 + HASH_BYTES];
        read_archive_exact(reader, &mut record_header, &mut consumed, archive_length)?;
        let path_length = u16::from_le_bytes(record_header[..2].try_into().unwrap()) as usize;
        let size = u64::from_le_bytes(record_header[2..10].try_into().unwrap());
        let expected_digest: [u8; HASH_BYTES] =
            record_header[10..10 + HASH_BYTES].try_into().unwrap();

        if path_length == 0 || path_length > MAX_PATH_BYTES || size == 0 || size > MAX_ENTRY_BYTES {
            return Err("Yedek kaydının yol veya boyut bilgisi geçersiz.".into());
        }

        let record_bytes = (2u64 + 8 + HASH_BYTES as u64)
            .checked_add(path_length as u64)
            .and_then(|value| value.checked_add(size))
            .ok_or_else(|| "Yedek paket boyutu hesaplanamadı.".to_string())?;
        total_bytes = total_bytes
            .checked_add(record_bytes)
            .ok_or_else(|| "Yedek paket boyutu hesaplanamadı.".to_string())?;
        if total_bytes > MAX_BACKUP_BYTES || total_bytes > archive_length {
            return Err("Yedek paketi boyut sınırını aşıyor veya eksik.".into());
        }

        let mut path_bytes = vec![0u8; path_length];
        read_archive_exact(reader, &mut path_bytes, &mut consumed, archive_length)?;
        let path = String::from_utf8(path_bytes)
            .map_err(|_| "Yedek dosya yolu UTF-8 biçiminde değil.".to_string())?;
        if !seen.insert(path.clone()) {
            return Err("Yedekte yinelenen dosya yolu var.".into());
        }

        let staged_path = if path == SNAPSHOT_PATH {
            has_snapshot = true;
            stage_dir.join("secure.hold")
        } else if path == SALT_PATH {
            has_salt = true;
            stage_dir.join("stronghold.salt")
        } else if let Some(name) = archive_material_name(&path) {
            material_names.push(name.to_string());
            let materials_stage = stage_dir.join("materials");
            fs::create_dir_all(&materials_stage)
                .map_err(|_| "Geçici kasa materyal klasörü oluşturulamadı.".to_string())?;
            materials_stage.join(name)
        } else {
            return Err("Yedek içinde izin verilmeyen bir dosya yolu var.".into());
        };

        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staged_path)
            .map_err(|_| "Yedek içeriği için geçici dosya oluşturulamadı.".to_string())?;
        let mut hasher = Sha256::new();
        let mut remaining = size;
        let mut buffer = [0u8; IO_CHUNK_BYTES];

        while remaining > 0 {
            let chunk_length = remaining.min(IO_CHUNK_BYTES as u64) as usize;
            read_archive_exact(reader, &mut buffer[..chunk_length], &mut consumed, archive_length)?;
            hasher.update(&buffer[..chunk_length]);
            output
                .write_all(&buffer[..chunk_length])
                .map_err(|_| "Yedek içeriği geçici dosyaya yazılamadı.".to_string())?;
            remaining -= chunk_length as u64;
        }

        let actual_digest: [u8; HASH_BYTES] = hasher.finalize().into();
        if actual_digest != expected_digest {
            return Err("Yedek bütünlük kontrolü başarısız; dosya değiştirilmiş olabilir.".into());
        }
        output
            .sync_all()
            .map_err(|_| "Geri yükleme geçici dosyası diske eşitlenemedi.".to_string())?;
    }

    if !has_snapshot || !has_salt {
        return Err("Yedekte kasa snapshot'ı veya Argon2 salt dosyası eksik.".into());
    }
    if consumed != archive_length {
        return Err("Yedek dosyasının sonunda beklenmeyen veri var.".into());
    }
    let mut trailing = [0u8; 1];
    if reader.read(&mut trailing).map_err(|_| "Yedek dosyasının sonu doğrulanamadı.".to_string())? != 0 {
        return Err("Yedek dosyasının sonunda beklenmeyen veri var.".into());
    }

    Ok(material_names)
}

fn publish_restored_archive(
    vault_dir: &Path,
    stage_dir: &Path,
    material_names: &[String],
    had_salt: bool,
) -> Result<(), String> {
    if validate_restore_target(vault_dir)? != had_salt {
        return Err("Geri yükleme sırasında yerel kasa durumu değişti; hiçbir dosyanın üzerine yazılmadı.".into());
    }

    let materials_dir = vault_dir.join("materials");
    let materials_dir_created = match fs::symlink_metadata(&materials_dir) {
        Ok(_) => false,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&materials_dir)
                .map_err(|_| "Kasa materyal klasörü oluşturulamadı.".to_string())?;
            true
        }
        Err(_) => return Err("Kasa materyal klasörü doğrulanamadı.".into()),
    };

    let salt_path = vault_dir.join("stronghold.salt");
    let previous_salt_path = stage_dir.join("previous-salt");
    let mut previous_salt_moved = false;
    let mut salt_installed = false;
    let mut installed_materials: Vec<PathBuf> = Vec::new();

    let publish_result = (|| -> Result<(), String> {
        for name in material_names {
            let staged_path = stage_dir.join("materials").join(name);
            let destination = materials_dir.join(name);
            if fs::symlink_metadata(&destination).is_ok() {
                return Err("Kasa materyal dosyası zaten var; üzerine yazılmadı.".into());
            }
            fs::rename(&staged_path, &destination)
                .map_err(|_| "Doğrulanmış materyal dosyası kasaya taşınamadı.".to_string())?;
            installed_materials.push(destination);
        }

        if had_salt {
            fs::rename(&salt_path, &previous_salt_path)
                .map_err(|_| "Önceki Stronghold salt dosyası korunamadı.".to_string())?;
            previous_salt_moved = true;
        }

        fs::rename(stage_dir.join("stronghold.salt"), &salt_path)
            .map_err(|_| "Doğrulanmış Stronghold salt dosyası kasaya taşınamadı.".to_string())?;
        salt_installed = true;

        fs::rename(stage_dir.join("secure.hold"), vault_dir.join("secure.hold"))
            .map_err(|_| "Doğrulanmış Stronghold snapshot'ı kasaya taşınamadı.".to_string())?;
        Ok(())
    })();

    if let Err(error) = publish_result {
        let mut rollback_ok = true;
        if salt_installed && fs::remove_file(&salt_path).is_err() {
            rollback_ok = false;
        }
        if previous_salt_moved && fs::rename(&previous_salt_path, &salt_path).is_err() {
            rollback_ok = false;
        }
        for path in installed_materials.iter().rev() {
            if fs::remove_file(path).is_err() {
                rollback_ok = false;
            }
        }
        if materials_dir_created && fs::remove_dir(&materials_dir).is_err() {
            rollback_ok = false;
        }
        if !rollback_ok {
            return Err(format!(
                "{error} Geri alma işlemi tam tamamlanamadı; kasa klasörünü elle inceleyin. Geçici kurtarma klasörü: {}",
                stage_dir.display()
            ));
        }
        return Err(error);
    }

    Ok(())
}

fn restore_vault_backup_from_reader<R: Read>(
    reader: &mut R,
    archive_length: u64,
    vault_dir: &Path,
) -> Result<(), String> {
    let had_salt = validate_restore_target(vault_dir)?;
    let stage_dir = create_restore_stage(vault_dir)?;

    let material_names = match stage_backup_archive(reader, archive_length, &stage_dir) {
        Ok(names) => names,
        Err(error) => {
            let _ = fs::remove_dir_all(&stage_dir);
            return Err(error);
        }
    };

    if let Err(error) = publish_restored_archive(vault_dir, &stage_dir, &material_names, had_salt) {
        if stage_dir.join("previous-salt").exists() {
            return Err(format!(
                "{error} Önceki salt dosyası geçici kurtarma klasöründe korunuyor: {}",
                stage_dir.display()
            ));
        }
        let _ = fs::remove_dir_all(&stage_dir);
        return Err(error);
    }

    let _ = fs::remove_dir_all(&stage_dir);
    Ok(())
}

fn restore_vault_backup_file(archive_path: &Path, vault_dir: &Path) -> Result<(), String> {
    let mut archive = File::open(archive_path)
        .map_err(|_| "Seçilen kasa yedeği açılamadı.".to_string())?;
    let metadata = archive
        .metadata()
        .map_err(|_| "Seçilen kasa yedeği doğrulanamadı.".to_string())?;
    if !metadata.is_file() || metadata.len() < HEADER_BYTES || metadata.len() > MAX_BACKUP_BYTES {
        return Err("Seçilen yedek dosyasının boyutu geçersiz veya 512 MiB sınırını aşıyor.".into());
    }
    restore_vault_backup_from_reader(&mut archive, metadata.len(), vault_dir)
}

#[tauri::command]
pub async fn restore_local_vault_backup(app: tauri::AppHandle) -> Result<bool, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("MİHENK şifreli kasa yedeğini seç")
        .add_filter("MİHENK şifreli kasa yedeği", &["mihenkbackup"])
        .blocking_pick_file();

    let Some(selected) = selected else {
        return Ok(false);
    };
    let archive_path = selected
        .into_path()
        .map_err(|_| "Seçilen yedek dosyasının yolu çözümlenemedi.".to_string())?;
    let vault_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Yerel kasa dizinine erişilemedi.".to_string())?
        .join("mihenk-vault");

    restore_vault_backup_file(&archive_path, &vault_dir)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::HashMap, io::Cursor};

    fn fixture_directory() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let root = std::env::temp_dir().join(format!(
            "mihenk-backup-test-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(root.join("materials")).unwrap();
        fs::write(root.join("secure.hold"), b"encrypted snapshot fixture").unwrap();
        fs::write(root.join("stronghold.salt"), [1u8, 2, 3, 4, 5, 6, 7, 8]).unwrap();
        fs::write(
            root.join("materials").join(format!("{}.mhn", "a".repeat(32))),
            b"already encrypted audio fixture",
        )
        .unwrap();
        root
    }

    fn parse_fixture(bytes: &[u8]) -> HashMap<String, Vec<u8>> {
        assert!(bytes.len() >= HEADER_BYTES as usize);
        assert_eq!(&bytes[..8], MAGIC);
        assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), BACKUP_VERSION);
        let count = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
        let mut offset = HEADER_BYTES as usize;
        let mut files = HashMap::new();

        for _ in 0..count {
            let path_length = u16::from_le_bytes(bytes[offset..offset + 2].try_into().unwrap()) as usize;
            offset += 2;
            let size = u64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap()) as usize;
            offset += 8;
            let expected_digest: [u8; HASH_BYTES] = bytes[offset..offset + HASH_BYTES].try_into().unwrap();
            offset += HASH_BYTES;
            let path = String::from_utf8(bytes[offset..offset + path_length].to_vec()).unwrap();
            offset += path_length;
            let data = bytes[offset..offset + size].to_vec();
            offset += size;
            let actual_digest: [u8; HASH_BYTES] = Sha256::digest(&data).into();
            assert_eq!(actual_digest, expected_digest);
            assert!(files.insert(path, data).is_none());
        }
        assert_eq!(offset, bytes.len());
        files
    }

    #[test]
    fn writes_the_existing_v1_archive_layout_with_streamed_sha256_entries() {
        let root = fixture_directory();
        let sources = collect_sources(&root).unwrap();
        let mut output = Vec::new();
        write_backup_archive(&mut output, &sources).unwrap();

        let files = parse_fixture(&output);
        assert_eq!(files.len(), 3);
        assert_eq!(
            files.get(SNAPSHOT_PATH).unwrap(),
            b"encrypted snapshot fixture"
        );
        assert_eq!(files.get(SALT_PATH).unwrap(), &[1, 2, 3, 4, 5, 6, 7, 8]);
        assert_eq!(
            files
                .get(&format!("{MATERIALS_PATH}/{}.mhn", "a".repeat(32)))
                .unwrap(),
            b"already encrypted audio fixture"
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_unexpected_material_files_before_writing_a_backup() {
        let root = fixture_directory();
        fs::write(root.join("materials").join("temporary.part"), b"unfinished").unwrap();

        assert!(collect_sources(&root).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_symlinked_material_entries() {
        let root = fixture_directory();
        let target = root.join("secure.hold");
        let link = root.join("materials").join(format!("{}.mhn", "b".repeat(32)));

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&target, &link).unwrap();
            assert!(collect_sources(&root).is_err());
        }

        #[cfg(not(unix))]
        {
            let _ = link;
        }

        fs::remove_dir_all(root).unwrap();
    }

    fn restore_fixture_directory() -> (PathBuf, PathBuf) {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let root = std::env::temp_dir().join(format!(
            "mihenk-restore-test-{}-{nonce}",
            std::process::id()
        ));
        let vault = root.join("mihenk-vault");
        fs::create_dir_all(vault.join("materials")).unwrap();
        fs::write(vault.join("stronghold.salt"), b"temporary startup salt").unwrap();
        (root, vault)
    }

    fn restore_archive_fixture() -> Vec<u8> {
        let material_path = format!("{MATERIALS_PATH}/{}.mhn", "c".repeat(32));
        let entries: [(&str, &[u8]); 3] = [
            (SNAPSHOT_PATH, b"restored encrypted snapshot"),
            (SALT_PATH, b"restored Argon2 salt"),
            (&material_path, b"restored encrypted audio"),
        ];
        let mut output = Vec::new();
        output.write_all(MAGIC).unwrap();
        output.write_all(&BACKUP_VERSION.to_le_bytes()).unwrap();
        output.write_all(&(entries.len() as u32).to_le_bytes()).unwrap();
        for (path, data) in entries {
            let path_bytes = path.as_bytes();
            let digest: [u8; HASH_BYTES] = Sha256::digest(data).into();
            output.write_all(&(path_bytes.len() as u16).to_le_bytes()).unwrap();
            output.write_all(&(data.len() as u64).to_le_bytes()).unwrap();
            output.write_all(&digest).unwrap();
            output.write_all(path_bytes).unwrap();
            output.write_all(data).unwrap();
        }
        output
    }

    #[test]
    fn restores_streamed_v1_entries_and_replaces_only_the_empty_install_salt() {
        let (root, vault) = restore_fixture_directory();
        let mut archive = Cursor::new(restore_archive_fixture());
        let archive_length = archive.get_ref().len() as u64;

        restore_vault_backup_from_reader(&mut archive, archive_length, &vault).unwrap();

        assert_eq!(
            fs::read(vault.join("secure.hold")).unwrap(),
            b"restored encrypted snapshot"
        );
        assert_eq!(
            fs::read(vault.join("stronghold.salt")).unwrap(),
            b"restored Argon2 salt"
        );
        assert_eq!(
            fs::read(
                vault
                    .join("materials")
                    .join(format!("{}.mhn", "c".repeat(32)))
            )
            .unwrap(),
            b"restored encrypted audio"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_a_corrupt_archive_without_publishing_any_restore_file() {
        let (root, vault) = restore_fixture_directory();
        let mut bytes = restore_archive_fixture();
        let last = bytes.len() - 1;
        bytes[last] ^= 0x40;
        let mut archive = Cursor::new(bytes);
        let archive_length = archive.get_ref().len() as u64;

        assert!(restore_vault_backup_from_reader(&mut archive, archive_length, &vault).is_err());
        assert!(!vault.join("secure.hold").exists());
        assert_eq!(
            fs::read(vault.join("stronghold.salt")).unwrap(),
            b"temporary startup salt"
        );
        assert_eq!(fs::read_dir(vault.join("materials")).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }

}
