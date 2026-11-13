$ErrorActionPreference = "Stop"

$distDir = Join-Path $env:RUNNER_TEMP "mihenk-libsodium"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

$baseUrl = "https://download.libsodium.org/libsodium/releases"
$artifacts = @(
    "libsodium-1.0.22-stable-msvc.zip",
    "libsodium-1.0.22-stable-msvc.zip.minisig"
)

foreach ($name in $artifacts) {
    $destination = Join-Path $distDir $name
    $uri = "$baseUrl/$name"
    $downloaded = $false

    for ($attempt = 1; $attempt -le 4; $attempt++) {
        try {
            Write-Host "libsodium imzalı derleme girdisi indiriliyor: $name (deneme $attempt/4)"
            Invoke-WebRequest -Uri $uri -OutFile $destination -TimeoutSec 180

            if (-not (Test-Path $destination) -or (Get-Item $destination).Length -lt 100) {
                throw "İndirilen dosya eksik veya beklenenden küçük: $name"
            }

            $downloaded = $true
            break
        }
        catch {
            Remove-Item $destination -Force -ErrorAction SilentlyContinue
            if ($attempt -eq 4) {
                throw "libsodium indirmesi 4 denemeden sonra başarısız oldu ($name): $($_.Exception.Message)"
            }
            Start-Sleep -Seconds (5 * $attempt)
        }
    }

    if (-not $downloaded) {
        throw "libsodium girdisi indirilemedi: $name"
    }
}

# libsodium-sys-stable arşiv ve .minisig dosyasını SODIUM_DIST_DIR içinden
# okur ve kendi gömülü Minisign açık anahtarıyla doğrular.
Add-Content -Path $env:GITHUB_ENV -Value "SODIUM_DIST_DIR=$distDir" -Encoding utf8
Write-Host "SODIUM_DIST_DIR hazırlandı; arşiv imzası Cargo derlemesinde doğrulanacak."
