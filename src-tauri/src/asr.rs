use reqwest::blocking::Client;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};
use sherpa_onnx::{LinearResampler, OnlineRecognizer, OnlineRecognizerConfig, OnlineStream};
use symphonia::core::{
    codecs::audio::AudioDecoderOptions,
    errors::Error as SymphoniaError,
    formats::{FormatOptions, TrackType, probe::Hint},
    io::MediaSourceStream,
    meta::MetadataOptions,
};
use tauri::Manager;
use zeroize::{Zeroize, Zeroizing};

use crate::audio_playback::open_vault_audio_reader;

pub const SEDA_MODEL_ID: &str = "atasoglu/seda-v0.1";
pub const SEDA_MODEL_REVISION: &str = "b5cf32ae4936968b284df3f1c4c79714af71e1fe";
const SEDA_MODEL_DIR: &str = "seda-v0.1";
const MAX_MODEL_ASSET_BYTES: u64 = 96 * 1024 * 1024;
const TOKEN_FILE_MAX_BYTES: u64 = 32 * 1024;

#[derive(Clone, Copy)]
struct ModelAsset {
    name: &'static str,
    sha256: Option<&'static str>,
    max_bytes: u64,
    exact_bytes: Option<u64>,
}

const SEDA_ASSETS: [ModelAsset; 4] = [
    ModelAsset {
        name: "encoder.int8.onnx",
        sha256: Some("2596861911cec5ca1de31adc12a7fc983d05395434f92239f4e007eeae3a5dcc"),
        max_bytes: MAX_MODEL_ASSET_BYTES,
        exact_bytes: Some(70_487_305),
    },
    ModelAsset {
        name: "decoder.onnx",
        sha256: Some("dc28b7ae3f5e67c0daa2d51886dae2ac8287a25333f46a363f3684b3cd1220c9"),
        max_bytes: 8 * 1024 * 1024,
        exact_bytes: Some(2_093_081),
    },
    ModelAsset {
        name: "joiner.int8.onnx",
        sha256: Some("b4d1cff7c410d14c85c143885954be09a6a4a076cd35d22aeba58655665582bb"),
        max_bytes: 2 * 1024 * 1024,
        exact_bytes: Some(259_417),
    },
    ModelAsset {
        name: "tokens.txt",
        sha256: None,
        max_bytes: TOKEN_FILE_MAX_BYTES,
        exact_bytes: None,
    },
];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SedaModelStatus {
    pub model_id: String,
    pub revision: String,
    pub license: String,
    pub installed: bool,
    pub bytes_on_disk: u64,
    pub message: String,
}

fn model_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("mihenk-asr")
}

fn model_dir(app_data_dir: &Path) -> PathBuf {
    model_root(app_data_dir).join(SEDA_MODEL_DIR)
}

fn format_hex(bytes: &[u8]) -> String {
    let mut result = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        let _ = write!(result, "{byte:02x}");
    }
    result
}

fn sha256_file(path: &Path, maximum: u64) -> Result<(String, u64), String> {
    let mut file = File::open(path).map_err(|_| "Model dosyası açılamadı.".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut total = 0u64;

    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "Model dosyası okunamadı.".to_string())?;
        if read == 0 {
            break;
        }
        total = total
            .checked_add(read as u64)
            .ok_or_else(|| "Model dosyası boyutu geçersiz.".to_string())?;
        if total > maximum {
            return Err("Model dosyası beklenen boyut sınırını aşıyor.".into());
        }
        hasher.update(&buffer[..read]);
    }

    Ok((format_hex(&hasher.finalize()), total))
}

fn validate_token_file(path: &Path) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|_| "Model token dosyası okunamadı.".to_string())?;
    let text = std::str::from_utf8(&bytes)
        .map_err(|_| "Model token dosyası UTF-8 biçiminde değil.".to_string())?;
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() != 500 {
        return Err("SEDA token dosyasında 500 BPE girdisi bulunmalı.".into());
    }
    for (expected_id, line) in lines.iter().enumerate() {
        let (_, id) = line
            .rsplit_once(' ')
            .ok_or_else(|| "SEDA token satırının biçimi geçersiz.".to_string())?;
        if id.parse::<usize>().ok() != Some(expected_id) {
            return Err("SEDA token kimlikleri sıralı değil.".into());
        }
    }
    Ok(())
}

fn verify_asset(path: &Path, asset: ModelAsset) -> Result<u64, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| format!("Model dosyası eksik: {}", asset.name))?;
    if !metadata.file_type().is_file() {
        return Err(format!("Model dosyası normal bir dosya değil: {}", asset.name));
    }

    let (sha256, length) = sha256_file(path, asset.max_bytes)?;
    if length == 0 || asset.exact_bytes.is_some_and(|expected| length != expected) {
        return Err(format!("Model dosyasının boyutu sabit manifest ile eşleşmiyor: {}", asset.name));
    }
    if let Some(expected) = asset.sha256 {
        if sha256 != expected {
            return Err(format!("Model SHA-256 doğrulaması başarısız: {}", asset.name));
        }
    }
    if asset.name == "tokens.txt" {
        validate_token_file(path)?;
    }
    Ok(length)
}

fn verify_model_dir(directory: &Path) -> Result<u64, String> {
    let metadata = fs::symlink_metadata(directory)
        .map_err(|_| "SEDA model klasörü bulunamadı.".to_string())?;
    if !metadata.file_type().is_dir() {
        return Err("SEDA model yolu normal bir klasör değil.".into());
    }
    let mut total = 0u64;
    for asset in SEDA_ASSETS {
        total = total
            .checked_add(verify_asset(&directory.join(asset.name), asset)?)
            .ok_or_else(|| "Model toplam boyutu geçersiz.".to_string())?;
    }
    Ok(total)
}

pub fn get_seda_model_status(app_data_dir: &Path) -> SedaModelStatus {
    match verify_model_dir(&model_dir(app_data_dir)) {
        Ok(bytes_on_disk) => SedaModelStatus {
            model_id: SEDA_MODEL_ID.into(),
            revision: SEDA_MODEL_REVISION.into(),
            license: "Apache-2.0 (akustik model ve token dosyası)".into(),
            installed: true,
            bytes_on_disk,
            message: "Model yerel olarak kurulu; transkripsiyon çevrimdışı çalışabilir.".into(),
        },
        Err(reason) => SedaModelStatus {
            model_id: SEDA_MODEL_ID.into(),
            revision: SEDA_MODEL_REVISION.into(),
            license: "Apache-2.0 (akustik model ve token dosyası)".into(),
            installed: false,
            bytes_on_disk: 0,
            message: reason,
        },
    }
}

fn remove_path_if_exists(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_dir() => {
            fs::remove_dir_all(path).map_err(|_| "Eski model dizini temizlenemedi.".to_string())
        }
        Ok(_) => fs::remove_file(path).map_err(|_| "Geçici model dosyası temizlenemedi.".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Model dizini denetlenemedi.".into()),
    }
}

fn download_asset(
    client: &Client,
    directory: &Path,
    asset: ModelAsset,
) -> Result<(), String> {
    let url = format!(
        "https://huggingface.co/{}/resolve/{}/{}",
        SEDA_MODEL_ID, SEDA_MODEL_REVISION, asset.name
    );
    let mut response = client
        .get(&url)
        .send()
        .map_err(|_| format!("SEDA dosyası indirilemedi: {}", asset.name))?;
    if !response.status().is_success() {
        return Err(format!(
            "SEDA indirme sunucusu {} yanıtını verdi: {}",
            response.status().as_u16(),
            asset.name
        ));
    }
    // Hugging Face's Xet/LFS-compatible redirects can expose transfer
    // Content-Length metadata that is not the final reconstructed file size.
    // Treat headers as advisory only: enforce the byte cap while reading,
    // then verify the exact manifest length and SHA-256 of the resulting file.
    let part_path = directory.join(format!("{}.part", asset.name));
    let final_path = directory.join(asset.name);
    let mut output = File::create(&part_path)
        .map_err(|_| format!("SEDA geçici dosyası oluşturulamadı: {}", asset.name))?;
    let mut buffer = [0u8; 64 * 1024];
    let mut total = 0u64;

    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|_| format!("SEDA indirmesi yarıda kesildi: {}", asset.name))?;
        if read == 0 {
            break;
        }
        total = total
            .checked_add(read as u64)
            .ok_or_else(|| "SEDA dosya boyutu geçersiz.".to_string())?;
        if total > asset.max_bytes {
            return Err(format!("SEDA dosyası boyut sınırını aşıyor: {}", asset.name));
        }
        output
            .write_all(&buffer[..read])
            .map_err(|_| format!("SEDA dosyası diske yazılamadı: {}", asset.name))?;
    }

    output
        .sync_all()
        .map_err(|_| format!("SEDA dosyası diske sabitlenemedi: {}", asset.name))?;
    drop(output);

    // Actual bytes, rather than the HTTP transfer header, are authoritative.
    // verify_asset rejects truncated, altered, or oversized model files.
    verify_asset(&part_path, asset)?;
    fs::rename(part_path, final_path)
        .map_err(|_| format!("SEDA dosyası kurulamadı: {}", asset.name))?;
    Ok(())
}

pub fn install_seda_model(app_data_dir: &Path) -> Result<SedaModelStatus, String> {
    let root = model_root(app_data_dir);
    fs::create_dir_all(&root).map_err(|_| "Yerel model klasörü oluşturulamadı.".to_string())?;
    let staging = root.join(".seda-v0.1.installing");
    let active = model_dir(app_data_dir);
    let previous = root.join(".seda-v0.1.previous");

    let current_status = get_seda_model_status(app_data_dir);
    if current_status.installed {
        remove_path_if_exists(&staging)?;
        remove_path_if_exists(&previous)?;
        return Ok(current_status);
    }

    // Recover the last known-good model if a process exited between the two
    // atomic directory renames during a previous install/upgrade.
    if verify_model_dir(&previous).is_ok() {
        remove_path_if_exists(&active)?;
        fs::rename(&previous, &active)
            .map_err(|_| "Önceki sağlam SEDA modeli kurtarılamadı.".to_string())?;
        let recovered = get_seda_model_status(app_data_dir);
        if recovered.installed {
            remove_path_if_exists(&staging)?;
            return Ok(recovered);
        }
    }

    remove_path_if_exists(&staging)?;
    remove_path_if_exists(&previous)?;
    fs::create_dir(&staging).map_err(|_| "Geçici SEDA klasörü oluşturulamadı.".to_string())?;

    let result = (|| {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(20 * 60))
            .redirect(reqwest::redirect::Policy::limited(5))
            .user_agent("MIHENK-56.12-local-model-installer")
            .build()
            .map_err(|_| "Model indirme istemcisi başlatılamadı.".to_string())?;

        for asset in SEDA_ASSETS {
            download_asset(&client, &staging, asset)?;
        }
        let bytes_on_disk = verify_model_dir(&staging)?;

        let had_active = fs::symlink_metadata(&active).is_ok();
        if had_active {
            fs::rename(&active, &previous)
                .map_err(|_| "Önceki SEDA model dizini yedeklenemedi.".to_string())?;
        }

        if let Err(error) = fs::rename(&staging, &active) {
            if had_active {
                let _ = fs::rename(&previous, &active);
            }
            return Err(format!("SEDA modeli etkinleştirilemedi: {error}"));
        }

        if had_active {
            remove_path_if_exists(&previous)?;
        }

        Ok(SedaModelStatus {
            model_id: SEDA_MODEL_ID.into(),
            revision: SEDA_MODEL_REVISION.into(),
            license: "Apache-2.0 (akustik model ve token dosyası)".into(),
            installed: true,
            bytes_on_disk,
            message: "SEDA yerel olarak indirildi ve bütünlük denetimleri geçti.".into(),
        })
    })();

    if result.is_err() {
        let _ = remove_path_if_exists(&staging);
    }
    result
}

#[tauri::command]
pub async fn get_seda_model_status_command(
    app: tauri::AppHandle,
) -> Result<SedaModelStatus, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "Yerel model klasörüne erişilemedi.".to_string())?;
    tauri::async_runtime::spawn_blocking(move || get_seda_model_status(&root))
        .await
        .map_err(|_| "SEDA model durumu denetimi beklenmedik biçimde sonlandı.".to_string())
}

#[tauri::command]
pub async fn install_seda_model_command(
    app: tauri::AppHandle,
) -> Result<SedaModelStatus, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "Yerel model klasörüne erişilemedi.".to_string())?;
    tauri::async_runtime::spawn_blocking(move || install_seda_model(&root))
        .await
        .map_err(|_| "SEDA model kurulum görevi beklenmedik biçimde sonlandı.".to_string())?
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrTranscriptSegment {
    pub id: String,
    pub start_seconds: f64,
    pub end_seconds: Option<f64>,
    pub text: String,
    pub speaker: String,
    pub status: &'static str,
    pub source: &'static str,
}

struct AsrChannel {
    stream: OnlineStream,
    resampler: Option<LinearResampler>,
    channel_index: usize,
    segment_index: usize,
    sample_count: u64,
    segment_start_sample: u64,
}

fn create_recognizer(model_directory: &Path) -> Result<OnlineRecognizer, String> {
    let mut config = OnlineRecognizerConfig::default();
    config.model_config.transducer.encoder = Some(model_directory.join("encoder.int8.onnx").to_string_lossy().into_owned());
    config.model_config.transducer.decoder = Some(model_directory.join("decoder.onnx").to_string_lossy().into_owned());
    config.model_config.transducer.joiner = Some(model_directory.join("joiner.int8.onnx").to_string_lossy().into_owned());
    config.model_config.tokens = Some(model_directory.join("tokens.txt").to_string_lossy().into_owned());
    config.model_config.provider = Some("cpu".into());
    config.model_config.num_threads = std::thread::available_parallelism().map(|n| n.get().clamp(1, 4) as i32).unwrap_or(2);
    config.enable_endpoint = true;
    config.decoding_method = Some("greedy_search".into());
    OnlineRecognizer::create(&config).ok_or_else(|| "SEDA ASR motoru başlatılamadı.".into())
}

fn append_endpoint(
    recognizer: &OnlineRecognizer,
    channel: &mut AsrChannel,
    job_id: &str,
    segments: &mut Vec<AsrTranscriptSegment>,
    reset_stream: bool,
) {
    if let Some(result) = recognizer.get_result(&channel.stream) {
        let text = result.text.trim();
        let start = channel.segment_start_sample as f64 / 16_000.0;
        let end = channel.sample_count as f64 / 16_000.0;
        if !text.is_empty() && end > start {
            segments.push(AsrTranscriptSegment {
                id: format!("asr-{job_id}-{}-{}", channel.channel_index + 1, channel.segment_index + 1),
                start_seconds: start,
                end_seconds: Some(end),
                text: text.to_string(),
                speaker: format!("Kanal {}", channel.channel_index + 1),
                status: "taslak",
                source: "asr",
            });
            channel.segment_index += 1;
        }
    }
    channel.segment_start_sample = channel.sample_count;
    if reset_stream {
        recognizer.reset(&channel.stream);
    }
}

fn feed_channel(
    recognizer: &OnlineRecognizer,
    channel: &mut AsrChannel,
    input: &[f32],
    job_id: &str,
    segments: &mut Vec<AsrTranscriptSegment>,
) {
    let mut converted = match &channel.resampler {
        Some(resampler) => resampler.resample(input, false),
        None => input.to_vec(),
    };
    if !converted.is_empty() {
        channel.stream.accept_waveform(16_000, &converted);
        channel.sample_count = channel.sample_count.saturating_add(converted.len() as u64);
        while recognizer.is_ready(&channel.stream) {
            recognizer.decode(&channel.stream);
        }
        if recognizer.is_endpoint(&channel.stream) {
            append_endpoint(recognizer, channel, job_id, segments, true);
        }
    }
    converted.zeroize();
}

fn finish_channel(
    recognizer: &OnlineRecognizer,
    channel: &mut AsrChannel,
    job_id: &str,
    segments: &mut Vec<AsrTranscriptSegment>,
) {
    if let Some(resampler) = &channel.resampler {
        let mut tail = resampler.resample(&[], true);
        if !tail.is_empty() {
            channel.stream.accept_waveform(16_000, &tail);
            channel.sample_count = channel.sample_count.saturating_add(tail.len() as u64);
        }
        tail.zeroize();
    }
    // The SEDA example uses a one-second zero tail to flush the last stream chunk.
    let mut tail_padding = vec![0.0f32; 16_000];
    channel.stream.accept_waveform(16_000, &tail_padding);
    tail_padding.zeroize();

    channel.stream.input_finished();
    while recognizer.is_ready(&channel.stream) {
        recognizer.decode(&channel.stream);
    }
    append_endpoint(recognizer, channel, job_id, segments, false);
}

fn transcribe_seda(
    app_data_dir: &Path,
    file_id: String,
    job_id: String,
    size_bytes: u64,
    nonce_prefix: Vec<u8>,
    raw_key: Zeroizing<Vec<u8>>,
    file_name: String,
) -> Result<Vec<AsrTranscriptSegment>, String> {
    if job_id.len() != 32 || !job_id.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)) {
        return Err("ASR görev kimliği geçersiz.".into());
    }
    if !get_seda_model_status(app_data_dir).installed {
        return Err("Önce Yerel Model bölümünden SEDA v0.1'i kurun.".into());
    }
    let reader = open_vault_audio_reader(app_data_dir, &file_id, size_bytes, &nonce_prefix, raw_key.as_slice())?;
    let mut hint = Hint::new();
    if let Some(extension) = Path::new(&file_name).extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let mss = MediaSourceStream::new(Box::new(reader), Default::default());
    let mut format = symphonia::default::get_probe()
        .probe(&hint, mss, FormatOptions::default(), MetadataOptions::default())
        .map_err(|error| format!("Ses kapsayıcısı çözümlenemedi: {error}"))?;
    let track = format.default_track(TrackType::Audio).ok_or_else(|| "Ses izi bulunamadı.".to_string())?;
    let track_id = track.id;
    let codec_parameters = track.codec_params.as_ref()
        .ok_or_else(|| "Ses codec bilgisi bulunamadı.".to_string())?
        .audio().ok_or_else(|| "Seçilen iz ses izi değil.".to_string())?;
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(codec_parameters, &AudioDecoderOptions::default())
        .map_err(|error| format!("Ses çözücüsü başlatılamadı: {error}"))?;

    let model_directory = model_dir(app_data_dir);
    verify_model_dir(&model_directory)?;
    let recognizer = create_recognizer(&model_directory)?;
    let mut channels: Option<Vec<AsrChannel>> = None;
    let mut source_rate = 0u32;
    let mut channel_count = 0usize;
    let mut segments = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            Err(SymphoniaError::ResetRequired) => return Err("Ses izi değişti; ASR güvenli biçimde durduruldu.".into()),
            Err(error) => return Err(format!("Ses paketi okunamadı: {error}")),
        };
        if packet.track_id != track_id {
            continue;
        }
        let decoded = decoder.decode(&packet)
            .map_err(|error| format!("Ses paketi çözülemedi; sessizce atlanmadı: {error}"))?;
        let spec = decoded.spec();
        let current_rate = spec.rate();
        let current_channels = spec.channels().count();
        if current_rate == 0 || current_rate > 192_000 || current_channels == 0 || current_channels > 8 {
            return Err("Örnekleme hızı veya kanal sayısı desteklenen sınırların dışında.".into());
        }
        if channels.is_none() {
            source_rate = current_rate;
            channel_count = current_channels;
            let mut initial = Vec::with_capacity(channel_count);
            for channel_index in 0..channel_count {
                let resampler = if source_rate == 16_000 { None } else {
                    Some(LinearResampler::create(source_rate as i32, 16_000)
                        .ok_or_else(|| "Ses 16 kHz'e dönüştürülemedi.".to_string())?)
                };
                initial.push(AsrChannel {
                    stream: recognizer.create_stream(),
                    resampler,
                    channel_index,
                    segment_index: 0,
                    sample_count: 0,
                    segment_start_sample: 0,
                });
            }
            channels = Some(initial);
        } else if current_rate != source_rate || current_channels != channel_count {
            return Err("Ses kanal düzeni veya örnekleme hızı paketler arasında değişti.".into());
        }

        let count = decoded.samples_interleaved();
        if count > 8 * 1024 * 1024 || count % channel_count != 0 {
            return Err("Ses çözücü paket boyutu veya kanal hizası güvenli sınırı aştı.".into());
        }
        let mut interleaved = vec![0.0f32; count];
        decoded.copy_to_slice_interleaved(&mut interleaved);
        let frames = count / channel_count;
        let mut planar = (0..channel_count).map(|_| Vec::with_capacity(frames)).collect::<Vec<_>>();
        for frame in interleaved.chunks_exact(channel_count) {
            for (index, sample) in frame.iter().enumerate() {
                planar[index].push(*sample);
            }
        }
        interleaved.zeroize();
        for (state, samples) in channels.as_mut().expect("channel state").iter_mut().zip(planar.iter_mut()) {
            feed_channel(&recognizer, state, samples, &job_id, &mut segments);
            samples.zeroize();
        }
    }

    let Some(mut channels) = channels else {
        return Err("Ses dosyasında çözümlenebilir örnek bulunamadı.".into());
    };
    for channel in &mut channels {
        finish_channel(&recognizer, channel, &job_id, &mut segments);
    }
    if segments.is_empty() {
        return Err("SEDA konuşma taslağı üretemedi. Uzman dinlemesi ve elle transkripsiyon gerekir.".into());
    }
    Ok(segments)
}

#[tauri::command]
pub async fn transcribe_stored_audio_command(
    app: tauri::AppHandle,
    file_id: String,
    job_id: String,
    size_bytes: u64,
    nonce_prefix: Vec<u8>,
    raw_key: Vec<u8>,
    file_name: String,
) -> Result<Vec<AsrTranscriptSegment>, String> {
    let raw_key = Zeroizing::new(raw_key);
    let app_data_dir = app.path().app_data_dir()
        .map_err(|_| "Yerel ses kasasına erişilemedi.".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        transcribe_seda(&app_data_dir, file_id, job_id, size_bytes, nonce_prefix, raw_key, file_name)
    }).await.map_err(|_| "Yerel ASR görevi beklenmedik biçimde sonlandı.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn downloads_pinned_seda_model_and_runs_local_cpu_smoke_when_enabled() {
        if std::env::var("MIHENK_SEDA_MODEL_SMOKE").ok().as_deref() != Some("1") {
            return;
        }

        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let app_data_dir = std::env::temp_dir().join(format!(
            "mihenk-seda-runtime-smoke-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&app_data_dir).unwrap();

        let result = (|| -> Result<(), String> {
            let status = install_seda_model(&app_data_dir)?;
            if !status.installed {
                return Err("SEDA model kurulum smoke testi başarısız.".into());
            }

            let recognizer = create_recognizer(&model_dir(&app_data_dir))?;
            let stream = recognizer.create_stream();

            // Public CI uses synthetic silence only; no evidentiary audio is involved.
            let mut synthetic_audio = vec![0.0f32; 16_000];
            stream.accept_waveform(16_000, &synthetic_audio);
            synthetic_audio.zeroize();

            let mut final_padding = vec![0.0f32; 16_000];
            stream.accept_waveform(16_000, &final_padding);
            final_padding.zeroize();
            stream.input_finished();

            while recognizer.is_ready(&stream) {
                recognizer.decode(&stream);
            }
            recognizer
                .get_result(&stream)
                .ok_or_else(|| "SEDA akış sonucu oluşturulamadı.".to_string())?;
            Ok(())
        })();

        let cleanup = fs::remove_dir_all(&app_data_dir);
        if let Err(error) = result {
            let _ = cleanup;
            panic!("SEDA yerel inference smoke testi başarısız: {error}");
        }
        cleanup.unwrap();
    }

    #[test]
    fn manifest_pins_apache_model_revision_and_excludes_optional_lm() {
        assert_eq!(SEDA_MODEL_ID, "atasoglu/seda-v0.1");
        assert_eq!(SEDA_MODEL_REVISION, "b5cf32ae4936968b284df3f1c4c79714af71e1fe");
        assert_eq!(SEDA_ASSETS.len(), 4);
        assert!(SEDA_ASSETS.iter().any(|item| item.name == "tokens.txt"));
        assert!(!SEDA_ASSETS.iter().any(|item| item.name.starts_with("lm/")));
        assert!(SEDA_ASSETS.iter().filter_map(|item| item.sha256).all(|hash| hash.len() == 64));
    }

    #[test]
    fn rejects_incomplete_or_reordered_bpe_token_files() {
        let directory = std::env::temp_dir().join(format!(
            "mihenk-seda-token-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("tokens.txt");
        let mut file = File::create(&path).unwrap();
        writeln!(file, "<blk> 0").unwrap();
        writeln!(file, "<sos/eos> 2").unwrap();
        drop(file);

        assert!(validate_token_file(&path).is_err());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn model_status_is_not_installed_when_directory_is_missing() {
        let directory = std::env::temp_dir().join(format!(
            "mihenk-seda-status-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&directory);
        let status = get_seda_model_status(&directory);
        assert!(!status.installed);
        assert_eq!(status.model_id, "atasoglu/seda-v0.1");
        assert_eq!(status.bytes_on_disk, 0);
        let _ = fs::remove_dir_all(directory);
    }
}
