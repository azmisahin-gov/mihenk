$ErrorActionPreference = "Stop"

$baseVersion = node -p "require('./package.json').version"
if ($LASTEXITCODE -ne 0) { throw "package.json sürümü okunamadı." }

if ($env:GITHUB_REF_NAME -like "v*") {
    $version = $env:GITHUB_REF_NAME.Substring(1)
} else {
    $version = "$baseVersion-$env:GITHUB_RUN_NUMBER"
}

$setupPath = Join-Path $PWD ("src-tauri/target/release/bundle/nsis/MİHENK_" + $version + "_x64-setup.exe")
if (-not (Test-Path -LiteralPath $setupPath)) {
    throw "NSIS Setup.exe paketi bulunamadı: $setupPath"
}

$installDir = Join-Path $env:RUNNER_TEMP "mihenk-nsis-installed"
if (Test-Path -LiteralPath $installDir) {
    Remove-Item -LiteralPath $installDir -Recurse -Force
}

$setupLog = Join-Path $env:RUNNER_TEMP "mihenk-nsis-install.log"
$installArgs = "/S /D=$installDir"
Write-Host "Gerçek NSIS Setup.exe paketi sessiz kuruluyor: $setupPath"
$installer = Start-Process -FilePath $setupPath -ArgumentList $installArgs -Wait -PassThru
if ($installer.ExitCode -ne 0) {
    throw "NSIS Setup.exe kurulumu başarısız. Çıkış kodu: $($installer.ExitCode). Kurulum dizini: $installDir"
}

$appPath = Join-Path $installDir "mihenk.exe"
if (-not (Test-Path -LiteralPath $appPath -PathType Leaf)) {
    $files = if (Test-Path -LiteralPath $installDir) {
        (Get-ChildItem -LiteralPath $installDir -Force -ErrorAction SilentlyContinue | Select-Object Name, Length | Format-Table -AutoSize | Out-String)
    } else {
        "Kurulum dizini oluşmadı."
    }
    throw "NSIS kurulum işlemi sıfır koduyla bitti fakat kurulu mihenk.exe bulunamadı. İçerik: $files"
}

$runtimeSummary = @()
$runtimeRoots = @(
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients"
)
foreach ($root in $runtimeRoots) {
    if (Test-Path -LiteralPath $root) {
        foreach ($key in Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue) {
            $name = $key.GetValue("name")
            if ($name -match "WebView2") {
                $runtimeSummary += "$name; sürüm=$($key.GetValue('pv')); konum=$($key.GetValue('location'))"
            }
        }
    }
}
Write-Host ("WebView2 Runtime: " + $(if ($runtimeSummary) { $runtimeSummary -join " | " } else { "kayıt defteri girdisi bulunamadı" }))

$startupLog = Join-Path $env:LOCALAPPDATA "com.mihenk.desktop\logs\startup.log"
if (Test-Path -LiteralPath $startupLog) {
    Remove-Item -LiteralPath $startupLog -Force
}
$webViewData = Join-Path $env:RUNNER_TEMP "mihenk-nsis-webview2"
New-Item -ItemType Directory -Force -Path $webViewData | Out-Null
$env:WEBVIEW2_USER_DATA_FOLDER = $webViewData

$stdout = Join-Path $env:RUNNER_TEMP "mihenk-nsis-stdout.log"
$stderr = Join-Path $env:RUNNER_TEMP "mihenk-nsis-stderr.log"
$testStartedAt = Get-Date
$process = $null

try {
    Write-Host "NSIS ile kurulu uygulama başlatılıyor: $appPath"
    $process = Start-Process -FilePath $appPath -WorkingDirectory $installDir -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr

    for ($attempt = 1; $attempt -le 20; $attempt++) {
        Start-Sleep -Seconds 1
        $process.Refresh()
        if ($process.HasExited) {
            $outText = if (Test-Path -LiteralPath $stdout) { Get-Content -LiteralPath $stdout -Raw } else { "" }
            $errText = if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw } else { "" }
            $startupText = if (Test-Path -LiteralPath $startupLog) { Get-Content -LiteralPath $startupLog -Raw } else { "Başlangıç günlüğü oluşmadı." }
            $crashPaths = @(
                (Join-Path $webViewData "EBWebView\Crashpad\reports"),
                (Join-Path $env:LOCALAPPDATA "CrashDumps")
            )
            $crashFiles = foreach ($path in $crashPaths) {
                if (Test-Path -LiteralPath $path) {
                    Get-ChildItem -LiteralPath $path -File -Recurse -ErrorAction SilentlyContinue |
                        Sort-Object LastWriteTime -Descending |
                        Select-Object -First 8 FullName, Length, LastWriteTime
                }
            }
            $crashText = if ($crashFiles) { $crashFiles | Format-Table -AutoSize | Out-String } else { "Çökme dökümü bulunamadı." }
            $webViewProcesses = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" -ErrorAction SilentlyContinue |
                Select-Object ProcessId, ParentProcessId, ExecutablePath, CommandLine |
                Format-List | Out-String
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
            $runtimeText = if ($runtimeSummary) { $runtimeSummary -join " | " } else { "WebView2 Runtime sürümü belirlenemedi." }
            throw (
                "NSIS ile kurulan uygulama kapandı. Çıkış kodu: $($process.ExitCode). stdout: $outText stderr: $errText başlangıç günlüğü: $startupText" +
                [Environment]::NewLine + "WebView2: " + $runtimeText +
                [Environment]::NewLine + "WebView2 süreçleri: " + $webViewProcesses +
                [Environment]::NewLine + "Çökme dosyaları: " + $crashText +
                [Environment]::NewLine + "Windows Application olayları: " + $eventText
            )
        }
    }

    if (-not (Test-Path -LiteralPath $startupLog)) {
        throw "NSIS kurulumundan sonraki uygulama açık kaldı fakat başlangıç günlüğü oluşmadı: $startupLog"
    }
    $startupText = Get-Content -LiteralPath $startupLog -Raw
    if ($startupText -notmatch "\[setup\] Tauri başlangıç kurulumu tamamlandı") {
        throw "NSIS kurulumundan sonraki uygulama 20 saniye açık kaldı ancak Tauri setup tamamlanma kaydı yok. Günlük: $startupText"
    }

    Write-Host "NSIS Setup.exe kurulumu ve uygulama başlatması başarılı. PID: $($process.Id)"
    Write-Host "Başlangıç günlüğü: $startupLog"
}
finally {
    if ($process) {
        $process.Refresh()
        if (-not $process.HasExited) {
            Stop-Process -Id $process.Id -Force
        }
    }

    $uninstaller = Join-Path $installDir "uninstall.exe"
    if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
        Write-Host "NSIS test kurulumu temizleniyor."
        $uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S _?=$installDir" -Wait -PassThru
        if ($uninstall.ExitCode -ne 0) {
            Write-Warning "Geçici NSIS test kurulumunun kaldırma kodu: $($uninstall.ExitCode)"
        }
    }
    if (Test-Path -LiteralPath $installDir) {
        Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
