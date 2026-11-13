$ErrorActionPreference = "Stop"

$appPath = Join-Path $PWD "src-tauri/target/release/mihenk.exe"
if (-not (Test-Path -LiteralPath $appPath -PathType Leaf)) {
    throw "Windows yayın ikilisi bulunamadı: $appPath"
}

$startupLog = Join-Path $env:LOCALAPPDATA "com.mihenk.desktop\logs\startup.log"
$logDirectory = Split-Path -Parent $startupLog
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
if (Test-Path -LiteralPath $startupLog) {
    Remove-Item -LiteralPath $startupLog -Force
}

$webViewData = Join-Path $env:RUNNER_TEMP "mihenk-release-binary-webview2"
if (Test-Path -LiteralPath $webViewData) {
    Remove-Item -LiteralPath $webViewData -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $webViewData | Out-Null
$env:WEBVIEW2_USER_DATA_FOLDER = $webViewData

$stdout = Join-Path $env:RUNNER_TEMP "mihenk-release-binary-stdout.log"
$stderr = Join-Path $env:RUNNER_TEMP "mihenk-release-binary-stderr.log"
$testStartedAt = Get-Date
$process = $null

try {
    Write-Host "Kurulumdan bağımsız yayın ikilisi başlatılıyor: $appPath"
    $process = Start-Process -FilePath $appPath -WorkingDirectory (Split-Path -Parent $appPath) -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr

    for ($attempt = 1; $attempt -le 20; $attempt++) {
        Start-Sleep -Seconds 1
        $process.Refresh()
        if ($process.HasExited) {
            $outText = if (Test-Path -LiteralPath $stdout) { Get-Content -LiteralPath $stdout -Raw } else { "" }
            $errText = if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw } else { "" }
            $startupText = if (Test-Path -LiteralPath $startupLog) { Get-Content -LiteralPath $startupLog -Raw } else { "Rust main() giriş günlüğü oluşmadı." }
            $eventText = try {
                Get-WinEvent -FilterHashtable @{
                    LogName = "Application"
                    StartTime = $testStartedAt.AddMinutes(-1)
                    Id = @(1000, 1001, 1026)
                } -MaxEvents 30 -ErrorAction SilentlyContinue |
                    Where-Object { $_.Message -match "(?i)mihenk|msedgewebview2|webview2" } |
                    Select-Object -First 8 TimeCreated, ProviderName, Id, Message |
                    Format-List | Out-String
            } catch {
                $_.Exception.Message
            }
            throw (
                "Kurulumdan bağımsız yayın EXE'si kapandı. Çıkış kodu: $($process.ExitCode)." +
                [Environment]::NewLine + "stdout: $outText" +
                [Environment]::NewLine + "stderr: $errText" +
                [Environment]::NewLine + "başlangıç günlüğü: $startupText" +
                [Environment]::NewLine + "Windows Application olayları: $eventText"
            )
        }
    }

    if (-not (Test-Path -LiteralPath $startupLog)) {
        throw "Yayın EXE'si 20 saniye açık kaldı fakat Rust main() başlangıç günlüğü oluşmadı: $startupLog"
    }

    $startupText = Get-Content -LiteralPath $startupLog -Raw
    if ($startupText -notmatch "\[setup\] Tauri başlangıç kurulumu tamamlandı") {
        throw "Yayın EXE'si açık kaldı ancak Tauri setup tamamlanma kaydı yok. Günlük: $startupText"
    }

    Write-Host "Kurulumdan bağımsız Windows yayın ikilisi 20 saniye açık kaldı."
    Write-Host "Başlangıç günlüğü: $startupLog"
}
finally {
    if ($process) {
        $process.Refresh()
        if (-not $process.HasExited) {
            Stop-Process -Id $process.Id -Force
        }
    }
}
