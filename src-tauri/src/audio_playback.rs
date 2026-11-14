use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{self, Read, Seek, SeekFrom},
    path::Path,
    sync::Mutex,
};
use tauri::{
    http::{
        header::{
            ACCEPT_RANGES, ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, CONTENT_LENGTH,
            CONTENT_RANGE, CONTENT_TYPE, RANGE, X_CONTENT_TYPE_OPTIONS,
        },
        Method, Response, StatusCode,
    },
    Manager, Runtime, State, UriSchemeContext,
};
use zeroize::{Zeroize, Zeroizing};

const VAULT_CHUNK_SIZE: u64 = 1024 * 1024;
const VAULT_HEADER_SIZE: u64 = 13;
const VAULT_AUTH_TAG_BYTES: u64 = 16;
const MAX_VAULT_AUDIO_BYTES: u64 = 240 * 1024 * 1024;
const MAX_RESPONSE_BYTES: u64 = VAULT_CHUNK_SIZE;
const MAX_PLAYBACK_SESSIONS: usize = 8;
const VAULT_HEADER_MAGIC: &[u8; 8] = b"MHKENC01";

#[derive(Default)]
pub struct PlaybackSessions {
    sessions: Mutex<HashMap<String, PlaybackSession>>,
}

#[derive(Clone)]
struct PlaybackSession {
    file_id: String,
    size_bytes: u64,
    nonce_prefix: [u8; 4],
    key: [u8; 32],
    media_type: String,
}

impl Drop for PlaybackSession {
    fn drop(&mut self) {
        self.key.zeroize();
        self.nonce_prefix.zeroize();
    }
}

/// A seekable, authenticated plaintext view over one encrypted vault audio file.
/// Symphonia can seek and read it without creating a plaintext temporary file.
pub struct VaultAudioReader {
    session: PlaybackSession,
    file: File,
    cursor: u64,
    cached_chunk_index: Option<u64>,
    cached_plaintext: Zeroizing<Vec<u8>>,
}

impl Read for VaultAudioReader {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if output.is_empty() || self.cursor >= self.session.size_bytes {
            return Ok(0);
        }

        let chunk_index = self.cursor / VAULT_CHUNK_SIZE;
        if self.cached_chunk_index != Some(chunk_index) {
            let start = chunk_index * VAULT_CHUNK_SIZE;
            let end = (self.session.size_bytes - 1).min(start + VAULT_CHUNK_SIZE - 1);
            let plaintext = read_plaintext_range(&mut self.file, &self.session, start, end)
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "Şifreli ses bloğu doğrulanamadı."))?;
            self.cached_plaintext = Zeroizing::new(plaintext);
            self.cached_chunk_index = Some(chunk_index);
        }

        let chunk_offset = (self.cursor % VAULT_CHUNK_SIZE) as usize;
        let available = self.cached_plaintext.len().saturating_sub(chunk_offset);
        let count = available.min(output.len()).min((self.session.size_bytes - self.cursor) as usize);
        if count == 0 {
            return Ok(0);
        }
        output[..count].copy_from_slice(&self.cached_plaintext[chunk_offset..chunk_offset + count]);
        self.cursor += count as u64;
        Ok(count)
    }
}

impl Seek for VaultAudioReader {
    fn seek(&mut self, position: SeekFrom) -> io::Result<u64> {
        let target = match position {
            SeekFrom::Start(value) => i128::from(value),
            SeekFrom::Current(delta) => i128::from(self.cursor) + i128::from(delta),
            SeekFrom::End(delta) => i128::from(self.session.size_bytes) + i128::from(delta),
        };
        if target < 0 || target > i128::from(u64::MAX) {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Ses konumu geçersiz."));
        }
        self.cursor = target as u64;
        Ok(self.cursor)
    }
}

impl symphonia::core::io::MediaSource for VaultAudioReader {
    fn is_seekable(&self) -> bool {
        true
    }

    fn byte_len(&self) -> Option<u64> {
        Some(self.session.size_bytes)
    }
}

/// Opens the encrypted source as a lazy authenticated reader. At most one
/// decrypted 1 MiB vault chunk is cached and it is zeroized when replaced/dropped.
pub fn open_vault_audio_reader(
    app_data_dir: &Path,
    file_id: &str,
    size_bytes: u64,
    nonce_prefix: &[u8],
    raw_key: &[u8],
) -> Result<VaultAudioReader, String> {
    if !is_hex_id(file_id) || raw_key.len() != 32 || nonce_prefix.len() != 4 {
        return Err("ASR ses kaydı kimlik bilgileri geçersiz.".into());
    }
    if size_bytes == 0 || size_bytes > MAX_VAULT_AUDIO_BYTES {
        return Err("ASR ses dosyası boyutu desteklenmiyor.".into());
    }

    let vault_dir = app_data_dir.join("mihenk-vault");
    let materials_dir = vault_dir.join("materials");
    for directory in [&vault_dir, &materials_dir] {
        let directory_metadata = fs::symlink_metadata(directory)
            .map_err(|_| "Şifreli ses materyal klasörü bulunamadı.".to_string())?;
        if !directory_metadata.file_type().is_dir() {
            return Err("Şifreli ses materyal yolu normal bir klasör değil.".into());
        }
    }
    let path = materials_dir.join(format!("{file_id}.mhn"));
    let metadata = fs::symlink_metadata(&path)
        .map_err(|_| "Şifreli ses materyali bulunamadı.".to_string())?;
    if !metadata.file_type().is_file() {
        return Err("Şifreli ses materyali normal bir dosya değil.".into());
    }

    let mut session = PlaybackSession {
        file_id: file_id.to_string(),
        size_bytes,
        nonce_prefix: nonce_prefix.try_into().map_err(|_| "Nonce geçersiz.".to_string())?,
        key: [0; 32],
        media_type: "application/octet-stream".into(),
    };
    session.key.copy_from_slice(raw_key);

    let mut file = File::open(&path).map_err(|_| "Şifreli ses materyali açılamadı.".to_string())?;
    verify_container(&mut file, &session)?;
    Ok(VaultAudioReader {
        session,
        file,
        cursor: 0,
        cached_chunk_index: None,
        cached_plaintext: Zeroizing::new(Vec::new()),
    })
}

fn is_hex_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn expected_ciphertext_size(plain_size: u64) -> Option<u64> {
    if plain_size == 0 {
        return None;
    }
    let chunks = plain_size.div_ceil(VAULT_CHUNK_SIZE);
    plain_size
        .checked_add(chunks.checked_mul(VAULT_AUTH_TAG_BYTES)?)?
        .checked_add(VAULT_HEADER_SIZE)
}

#[tauri::command]
pub fn open_audio_playback_session(
    state: State<'_, PlaybackSessions>,
    session_id: String,
    file_id: String,
    size_bytes: u64,
    nonce_prefix: Vec<u8>,
    raw_key: Vec<u8>,
    media_type: String,
) -> Result<(), String> {
    let raw_key = Zeroizing::new(raw_key);
    if !is_hex_id(&session_id) || !is_hex_id(&file_id) {
        return Err("Ses oynatma oturumu kimliği geçersiz.".into());
    }
    if size_bytes == 0
        || size_bytes > MAX_VAULT_AUDIO_BYTES
        || expected_ciphertext_size(size_bytes).is_none()
    {
        return Err("Ses dosyası boyutu desteklenmiyor.".into());
    }
    if raw_key.len() != 32 {
        return Err("Ses oynatma anahtarı geçersiz.".into());
    }
    let nonce_prefix: [u8; 4] = nonce_prefix
        .try_into()
        .map_err(|_| "Ses oynatma nonce bilgisi geçersiz.".to_string())?;
    if media_type.is_empty()
        || media_type.len() > 256
        || media_type.parse::<tauri::http::HeaderValue>().is_err()
    {
        return Err("Ses dosyasının medya türü geçersiz.".into());
    }

    let mut key = [0u8; 32];
    key.copy_from_slice(raw_key.as_slice());
    let session = PlaybackSession {
        file_id,
        size_bytes,
        nonce_prefix,
        key,
        media_type,
    };

    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Ses oynatma oturumu başlatılamadı.".to_string())?;
    if sessions.len() >= MAX_PLAYBACK_SESSIONS && !sessions.contains_key(&session_id) {
        return Err("Çok fazla açık ses oynatma oturumu var.".into());
    }
    sessions.insert(session_id, session);
    Ok(())
}

#[tauri::command]
pub fn close_audio_playback_session(
    state: State<'_, PlaybackSessions>,
    session_id: String,
) -> Result<(), String> {
    if !is_hex_id(&session_id) {
        return Err("Ses oynatma oturumu kimliği geçersiz.".into());
    }
    state
        .sessions
        .lock()
        .map_err(|_| "Ses oynatma oturumu kapatılamadı.".to_string())?
        .remove(&session_id);
    Ok(())
}

#[tauri::command]
pub fn clear_audio_playback_sessions(
    state: State<'_, PlaybackSessions>,
) -> Result<(), String> {
    state
        .sessions
        .lock()
        .map_err(|_| "Ses oynatma oturumları kapatılamadı.".to_string())?
        .clear();
    Ok(())
}

fn error_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(CACHE_CONTROL, "no-store")
        .body(message.as_bytes().to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn media_response(
    status: StatusCode,
    session: &PlaybackSession,
    body: Vec<u8>,
    content_length: u64,
    content_range: Option<String>,
) -> Response<Vec<u8>> {
    let mut builder = Response::builder()
        .status(status)
        .header(CONTENT_TYPE, session.media_type.as_str())
        .header(CONTENT_LENGTH, content_length.to_string())
        .header(ACCEPT_RANGES, "bytes")
        .header(CACHE_CONTROL, "no-store, max-age=0")
        .header(X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*");

    if let Some(value) = content_range {
        builder = builder.header(CONTENT_RANGE, value);
    }

    builder
        .body(body)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn parse_range(value: &str, total_size: u64) -> Option<(u64, u64)> {
    if total_size == 0 {
        return None;
    }
    let value = value.strip_prefix("bytes=")?;
    if value.contains(',') {
        return None;
    }
    let (start_text, end_text) = value.split_once('-')?;

    let (start, requested_end) = if start_text.is_empty() {
        let suffix_length = end_text.parse::<u64>().ok()?;
        if suffix_length == 0 {
            return None;
        }
        (total_size.saturating_sub(suffix_length), total_size - 1)
    } else {
        let start = start_text.parse::<u64>().ok()?;
        if start >= total_size {
            return None;
        }
        let end = if end_text.is_empty() {
            total_size - 1
        } else {
            end_text.parse::<u64>().ok()?.min(total_size - 1)
        };
        (start, end)
    };

    if requested_end < start {
        return None;
    }
    let capped_end = requested_end.min(start.saturating_add(MAX_RESPONSE_BYTES - 1));
    Some((start, capped_end))
}

fn verify_container<R: Read + Seek>(
    reader: &mut R,
    session: &PlaybackSession,
) -> Result<(), String> {
    let expected_size =
        expected_ciphertext_size(session.size_bytes).ok_or_else(|| "Dosya boyutu geçersiz.".to_string())?;
    let actual_size = reader
        .seek(SeekFrom::End(0))
        .map_err(|_| "Şifreli ses dosyası okunamadı.".to_string())?;
    if actual_size != expected_size {
        return Err("Şifreli ses dosyasının uzunluğu doğrulanamadı.".into());
    }

    reader
        .seek(SeekFrom::Start(0))
        .map_err(|_| "Şifreli ses dosyası okunamadı.".to_string())?;
    let mut header = [0u8; VAULT_HEADER_SIZE as usize];
    reader
        .read_exact(&mut header)
        .map_err(|_| "Şifreli ses dosyasının başlığı okunamadı.".to_string())?;
    let chunk_size = u32::from_le_bytes([header[9], header[10], header[11], header[12]]);
    if &header[0..8] != VAULT_HEADER_MAGIC || header[8] != 1 || chunk_size != VAULT_CHUNK_SIZE as u32 {
        return Err("Şifreli ses dosyasının biçimi doğrulanamadı.".into());
    }
    Ok(())
}

fn read_plaintext_range<R: Read + Seek>(
    reader: &mut R,
    session: &PlaybackSession,
    start: u64,
    end: u64,
) -> Result<Vec<u8>, String> {
    if start > end
        || end >= session.size_bytes
        || end - start + 1 > MAX_RESPONSE_BYTES
    {
        return Err("Ses aralığı geçersiz.".into());
    }
    verify_container(reader, session)?;

    let cipher = Aes256Gcm::new_from_slice(&session.key)
        .map_err(|_| "Ses şifreleme anahtarı geçersiz.".to_string())?;
    let capacity = usize::try_from(end - start + 1)
        .map_err(|_| "Ses aralığı boyutu geçersiz.".to_string())?;
    let mut output = Zeroizing::new(Vec::with_capacity(capacity));
    let first_chunk = start / VAULT_CHUNK_SIZE;
    let last_chunk = end / VAULT_CHUNK_SIZE;

    for chunk_index in first_chunk..=last_chunk {
        let chunk_start = chunk_index * VAULT_CHUNK_SIZE;
        let plain_length = (session.size_bytes - chunk_start).min(VAULT_CHUNK_SIZE) as usize;
        let cipher_length = plain_length + VAULT_AUTH_TAG_BYTES as usize;
        let cipher_offset = VAULT_HEADER_SIZE
            .checked_add(
                chunk_index
                    .checked_mul(VAULT_CHUNK_SIZE + VAULT_AUTH_TAG_BYTES)
                    .ok_or_else(|| "Şifreli blok konumu geçersiz.".to_string())?,
            )
            .ok_or_else(|| "Şifreli blok konumu geçersiz.".to_string())?;

        reader
            .seek(SeekFrom::Start(cipher_offset))
            .map_err(|_| "Şifreli ses bloğu okunamadı.".to_string())?;
        let mut ciphertext = Zeroizing::new(vec![0u8; cipher_length]);
        reader
            .read_exact(ciphertext.as_mut_slice())
            .map_err(|_| "Şifreli ses bloğu eksik.".to_string())?;

        let mut nonce = [0u8; 12];
        nonce[..4].copy_from_slice(&session.nonce_prefix);
        nonce[4..].copy_from_slice(&chunk_index.to_be_bytes());
        let aad = format!(
            "MİHENK-AUDIO-V1|{}|{}|{}",
            session.file_id, chunk_index, plain_length
        );
        let decrypted = cipher
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: ciphertext.as_slice(),
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| "Ses bloğunun kimlik doğrulaması başarısız.".to_string())?;
        nonce.zeroize();

        let plaintext = Zeroizing::new(decrypted);
        if plaintext.len() != plain_length {
            return Err("Çözülen ses bloğunun boyutu doğrulanamadı.".into());
        }

        let local_start = (start.max(chunk_start) - chunk_start) as usize;
        let chunk_end = chunk_start + plain_length as u64;
        let local_end = (end + 1).min(chunk_end).saturating_sub(chunk_start) as usize;
        output.extend_from_slice(&plaintext[local_start..local_end]);
    }

    if output.len() != capacity {
        return Err("Çözülen ses aralığının boyutu doğrulanamadı.".into());
    }
    Ok(std::mem::take(&mut *output))
}

fn verify_file<R: Read + Seek>(reader: &mut R, session: &PlaybackSession) -> Result<(), String> {
    verify_container(reader, session)
}

pub fn handle_protocol_request<R: Runtime>(
    context: UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let session_id = request.uri().path().trim_matches('/');
    if !is_hex_id(session_id) {
        return error_response(StatusCode::NOT_FOUND, "Ses kaydı bulunamadı.");
    }

    let state = context.app_handle().state::<PlaybackSessions>();
    let session = match state.sessions.lock() {
        Ok(sessions) => sessions.get(session_id).cloned(),
        Err(_) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, "Ses oynatma oturumu kullanılamıyor."),
    };
    let Some(session) = session else {
        return error_response(StatusCode::NOT_FOUND, "Ses oynatma oturumu bulunamadı.");
    };

    if request.method() != Method::GET && request.method() != Method::HEAD {
        return error_response(StatusCode::METHOD_NOT_ALLOWED, "Bu ses isteği desteklenmiyor.");
    }

    let app_data_dir = match context.app_handle().path().app_data_dir() {
        Ok(path) => path,
        Err(_) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, "Yerel ses kasasına erişilemedi."),
    };
    let file_path = app_data_dir
        .join("mihenk-vault")
        .join("materials")
        .join(format!("{}.mhn", session.file_id));

    let metadata = match fs::symlink_metadata(&file_path) {
        Ok(metadata) if metadata.file_type().is_file() => metadata,
        _ => return error_response(StatusCode::NOT_FOUND, "Şifreli ses dosyası bulunamadı."),
    };
    if metadata.len() != match expected_ciphertext_size(session.size_bytes) {
        Some(size) => size,
        None => return error_response(StatusCode::INTERNAL_SERVER_ERROR, "Şifreli ses dosyası geçersiz."),
    } {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, "Şifreli ses dosyası doğrulanamadı.");
    }

    let mut file = match File::open(&file_path) {
        Ok(file) => file,
        Err(_) => return error_response(StatusCode::NOT_FOUND, "Şifreli ses dosyası açılamadı."),
    };

    if request.method() == Method::HEAD {
        if verify_file(&mut file, &session).is_err() {
            return error_response(StatusCode::INTERNAL_SERVER_ERROR, "Şifreli ses dosyası doğrulanamadı.");
        }
        return media_response(
            StatusCode::OK,
            &session,
            Vec::new(),
            session.size_bytes,
            None,
        );
    }

    let range = match request.headers().get(RANGE) {
        Some(value) => match value.to_str().ok().and_then(|value| parse_range(value, session.size_bytes)) {
            Some(range) => range,
            None => {
                return Response::builder()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(CONTENT_RANGE, format!("bytes */{}", session.size_bytes))
                    .header(ACCEPT_RANGES, "bytes")
                    .header(CACHE_CONTROL, "no-store")
                    .body(Vec::new())
                    .unwrap_or_else(|_| Response::new(Vec::new()));
            }
        },
        None => (0, (session.size_bytes - 1).min(MAX_RESPONSE_BYTES - 1)),
    };

    let body = match read_plaintext_range(&mut file, &session, range.0, range.1) {
        Ok(body) => body,
        Err(_) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, "Ses aralığı çözülemedi veya doğrulanamadı."),
    };
    let content_range = format!("bytes {}-{}/{}", range.0, range.1, session.size_bytes);
    media_response(
        StatusCode::PARTIAL_CONTENT,
        &session,
        body,
        range.1 - range.0 + 1,
        Some(content_range),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn accepts_large_audio_while_each_playback_range_stays_bounded() {
        let size_bytes = 129 * 1024 * 1024;
        assert!(size_bytes <= MAX_VAULT_AUDIO_BYTES);
        assert!(expected_ciphertext_size(size_bytes).unwrap() > size_bytes);
        assert_eq!(
            parse_range("bytes=0-", size_bytes),
            Some((0, MAX_RESPONSE_BYTES - 1))
        );
    }

    fn test_session(size_bytes: u64) -> PlaybackSession {
        PlaybackSession {
            file_id: "0123456789abcdef0123456789abcdef".into(),
            size_bytes,
            nonce_prefix: [1, 2, 3, 4],
            key: [7; 32],
            media_type: "audio/wav".into(),
        }
    }

    fn encrypted_fixture(plaintext: &[u8], session: &PlaybackSession) -> Vec<u8> {
        let cipher = Aes256Gcm::new_from_slice(&session.key).unwrap();
        let mut output = Vec::new();
        output.extend_from_slice(VAULT_HEADER_MAGIC);
        output.push(1);
        output.extend_from_slice(&(VAULT_CHUNK_SIZE as u32).to_le_bytes());

        for (index, chunk) in plaintext.chunks(VAULT_CHUNK_SIZE as usize).enumerate() {
            let mut nonce = [0u8; 12];
            nonce[..4].copy_from_slice(&session.nonce_prefix);
            nonce[4..].copy_from_slice(&(index as u64).to_be_bytes());
            let aad = format!("MİHENK-AUDIO-V1|{}|{}|{}", session.file_id, index, chunk.len());
            let ciphertext = cipher
                .encrypt(
                    Nonce::from_slice(&nonce),
                    Payload { msg: chunk, aad: aad.as_bytes() },
                )
                .unwrap();
            output.extend_from_slice(&ciphertext);
        }
        output
    }

    #[test]
    fn parses_single_and_suffix_ranges() {
        assert_eq!(parse_range("bytes=10-20", 100), Some((10, 20)));
        assert_eq!(parse_range("bytes=90-", 100), Some((90, 99)));
        assert_eq!(parse_range("bytes=-10", 100), Some((90, 99)));
        assert_eq!(parse_range("bytes=100-", 100), None);
        assert_eq!(parse_range("bytes=1-0", 100), None);
        assert_eq!(parse_range("bytes=0-1,4-5", 100), None);
    }

    #[test]
    fn decrypts_a_range_across_two_authenticated_chunks() {
        let mut plaintext = vec![0u8; VAULT_CHUNK_SIZE as usize + 37];
        for (index, byte) in plaintext.iter_mut().enumerate() {
            *byte = (index % 251) as u8;
        }
        let session = test_session(plaintext.len() as u64);
        let encrypted = encrypted_fixture(&plaintext, &session);
        let mut reader = Cursor::new(encrypted);
        let start = VAULT_CHUNK_SIZE - 5;
        let end = VAULT_CHUNK_SIZE + 8;

        let actual = read_plaintext_range(&mut reader, &session, start, end).unwrap();
        assert_eq!(actual, plaintext[start as usize..=end as usize]);
    }

    #[test]
    fn rejects_a_tampered_authentication_tag() {
        let plaintext = b"authenticated audio block";
        let session = test_session(plaintext.len() as u64);
        let mut encrypted = encrypted_fixture(plaintext, &session);
        let last = encrypted.len() - 1;
        encrypted[last] ^= 0x80;
        let mut reader = Cursor::new(encrypted);

        assert!(read_plaintext_range(&mut reader, &session, 0, 5).is_err());
    }

    #[test]
    fn vault_audio_reader_seeks_and_authenticates_without_plaintext_files() {
        let root = std::env::temp_dir().join(format!("mihenk-asr-vault-reader-{}", std::process::id()));
        let materials = root.join("mihenk-vault").join("materials");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&materials).unwrap();

        let mut plaintext = vec![0u8; VAULT_CHUNK_SIZE as usize + 257];
        for (index, byte) in plaintext.iter_mut().enumerate() {
            *byte = ((index * 13) % 251) as u8;
        }
        let session = test_session(plaintext.len() as u64);
        let encrypted = encrypted_fixture(&plaintext, &session);
        let path = materials.join(format!("{}.mhn", session.file_id));
        fs::write(&path, encrypted).unwrap();

        let mut source = open_vault_audio_reader(
            &root,
            &session.file_id,
            session.size_bytes,
            &session.nonce_prefix,
            &session.key,
        ).unwrap();

        let mut first = vec![0u8; 29];
        source.read_exact(&mut first).unwrap();
        assert_eq!(first, plaintext[..29]);

        source.seek(SeekFrom::Start(VAULT_CHUNK_SIZE - 11)).unwrap();
        let mut boundary = vec![0u8; 35];
        source.read_exact(&mut boundary).unwrap();
        assert_eq!(boundary, plaintext[(VAULT_CHUNK_SIZE - 11) as usize..(VAULT_CHUNK_SIZE + 24) as usize]);

        source.seek(SeekFrom::End(-17)).unwrap();
        let mut tail = vec![0u8; 17];
        source.read_exact(&mut tail).unwrap();
        assert_eq!(tail, plaintext[plaintext.len() - 17..]);

        assert!(source.seek(SeekFrom::Current(-((plaintext.len() as i64) + 1))).is_err());
        drop(source);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn caps_a_single_response_to_one_mib() {
        let end = parse_range("bytes=0-", MAX_VAULT_AUDIO_BYTES).unwrap().1;
        assert_eq!(end + 1, MAX_RESPONSE_BYTES);
    }
}
