$ErrorActionPreference = "Stop"

$baseVersion = node -p "require('./package.json').version"
if ($LASTEXITCODE -ne 0) { throw "package.json sürümü okunamadı." }

if ($env:GITHUB_REF_NAME -like "v*") {
    $version = $env:GITHUB_REF_NAME.Substring(1)
} else {
    $version = "$baseVersion-$env:GITHUB_RUN_NUMBER"
}

$msiPath = Join-Path $PWD ("src-tauri/target/release/bundle/msi/MİHENK_" + $version + "_x64_tr-TR.msi")
if (-not (Test-Path -LiteralPath $msiPath)) {
    throw "Windows MSI paketi bulunamadı: $msiPath"
}

$startupLog = Join-Path $env:LOCALAPPDATA "com.mihenk.desktop\logs\startup.log"
if (Test-Path -LiteralPath $startupLog) {
    Remove-Item -LiteralPath $startupLog -Force
}

$msiLog = Join-Path $env:RUNNER_TEMP "mihenk-msi-install.log"
$installArgs = @("/i", ('"' + $msiPath + '"'), "/qn", "/norestart", "/l*v", ('"' + $msiLog + '"'))

Write-Host "Gerçek MSI paketi kuruluyor: $msiPath"
$installer = Start-Process -FilePath "msiexec.exe" -ArgumentList $installArgs -Wait -PassThru
if ($installer.ExitCode -notin @(0, 3010)) {
    $msiTail = if (Test-Path -LiteralPath $msiLog) {
        (Get-Content -LiteralPath $msiLog -Tail 80) -join [Environment]::NewLine
    } else {
        "MSI kurulum günlüğü oluşmadı."
    }
    throw "MSI kurulumu başarısız. Çıkış kodu: $($installer.ExitCode). Günlük: $msiTail"
}

$uninstallRoots = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
)
$entries = foreach ($root in $uninstallRoots) {
    if (Test-Path $root) {
        Get-ChildItem -Path $root -ErrorAction SilentlyContinue |
            ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue }
    }
}
$appEntries = @($entries | Where-Object { $_.DisplayName -and $_.DisplayName -like "*HENK*" })
Write-Host ("Program Files ortam kökleri: ProgramFiles=" + $env:ProgramFiles + "; ProgramW6432=" + $env:ProgramW6432 + "; ProgramFiles(x86)=" + [Environment]::GetEnvironmentVariable('ProgramFiles(x86)'))
foreach ($entry in $appEntries) {
    Write-Host ("MSI kaldırma kaydı: DisplayName=" + $entry.DisplayName + "; InstallLocation=" + $entry.InstallLocation + "; DisplayIcon=" + $entry.DisplayIcon + "; UninstallString=" + $entry.UninstallString + "; RegistryKey=" + $entry.PSChildName)
}
$programFilesRoots = @(
    $env:ProgramFiles,
    [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

function Test-IsProgramFilesPath([string]$Path) {
    if (-not $Path) { return $false }
    foreach ($root in $programFilesRoots) {
        $normalizedRoot = $root.TrimEnd('\') + '\'
        if ($Path.StartsWith($normalizedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }
    return $false
}

$appPath = $null
$matchedEntry = $null

# WiX records the resolved MSI install directory under HKCU. Prefer this
# authoritative value over a recursive Program Files scan, but still enforce
# the Program Files boundary before launching the application.
$msiInstallState = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\mihenk\MİHENK")
if ($msiInstallState) {
    try {
        $resolvedInstallDir = $msiInstallState.GetValue("InstallDir")
        if ($resolvedInstallDir) {
            $registryCandidate = Join-Path ([string]$resolvedInstallDir) "mihenk.exe"
            Write-Host ("WiX MSI kayıtlı kurulum dizini: " + $resolvedInstallDir)
            if ((Test-Path -LiteralPath $registryCandidate -PathType Leaf) -and (Test-IsProgramFilesPath $registryCandidate)) {
                $appPath = $registryCandidate
            }
        }
    }
    finally {
        $msiInstallState.Dispose()
    }
}

foreach ($entry in $appEntries) {
    if ($appPath) { break }
    $candidates = @()
    if ($entry.InstallLocation) {
        $candidates += (Join-Path $entry.InstallLocation "mihenk.exe")
    }
    if ($entry.DisplayIcon) {
        $iconPath = ($entry.DisplayIcon -replace '^"', '') -replace '",\d+$', ''
        $candidates += $iconPath
    }

    foreach ($candidate in $candidates) {
        if ((Test-Path -LiteralPath $candidate -PathType Leaf) -and (Test-IsProgramFilesPath $candidate)) {
            $appPath = $candidate
            $matchedEntry = $entry
            break
        }
    }
    if ($appPath) { break }
}

if (-not $appPath) {
    foreach ($root in $programFilesRoots) {
        $candidate = Get-ChildItem -LiteralPath $root -Filter "mihenk.exe" -File -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($candidate) {
            $appPath = $candidate.FullName
            break
        }
    }
}

if (-not $appPath) {
    $searchRoots = @($env:ProgramFiles, [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) |
        Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
        Select-Object -Unique
    foreach ($root in $searchRoots) {
        $candidate = Get-ChildItem -LiteralPath $root -Filter "mihenk.exe" -File -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($candidate) {
            $appPath = $candidate.FullName
            break
        }
    }
}

if ($appPath -and -not $appPath.StartsWith($env:ProgramFiles, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "MSI uygulamayı Program Files yerine başka bir konuma kurdu: $appPath"
}

if (-not $appPath) {
    $displayNames = ($appEntries | ForEach-Object { $_.DisplayName }) -join "; "
    $msiTail = if (Test-Path -LiteralPath $msiLog) {
        (Get-Content -LiteralPath $msiLog -Tail 50) -join [Environment]::NewLine
    } else {
        "MSI kurulum günlüğü bulunamadı."
    }
    throw "MSI kuruldu fakat Program Files içinde mihenk.exe bulunamadı. Kayıtlar: $displayNames. MSI günlüğü: $msiTail"
}

$runtimeSummary = @()
$runtimeRoots = @("HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients")
foreach ($root in $runtimeRoots) {
    if (Test-Path -LiteralPath $root) {
        foreach ($key in Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue) {
            $name = $key.GetValue("name")
            if ($name -match "WebView2") { $runtimeSummary += "$name; sürüm=$($key.GetValue('pv')); konum=$($key.GetValue('location'))" }
        }
    }
}
Write-Host ("WebView2 Runtime: " + $(if ($runtimeSummary) { $runtimeSummary -join " | " } else { "kayıt defteri girdisi bulunamadı" }))
Write-Host "Kurulu uygulama başlatılıyor: $appPath"
$webViewData = Join-Path $env:RUNNER_TEMP "mihenk-installed-webview2"
New-Item -ItemType Directory -Force -Path $webViewData | Out-Null
$env:WEBVIEW2_USER_DATA_FOLDER = $webViewData

$stdout = Join-Path $env:RUNNER_TEMP "mihenk-installed-stdout.log"
$stderr = Join-Path $env:RUNNER_TEMP "mihenk-installed-stderr.log"
$process = Start-Process -FilePath $appPath -WorkingDirectory (Split-Path $appPath) -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr

try {
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        Start-Sleep -Seconds 1
        $process.Refresh()
        if ($process.HasExited) {
            $outText = if (Test-Path -LiteralPath $stdout) { Get-Content -LiteralPath $stdout -Raw } else { "" }
            $errText = if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr -Raw } else { "" }
            $startupText = if (Test-Path -LiteralPath $startupLog) { Get-Content -LiteralPath $startupLog -Raw } else { "Başlangıç günlüğü oluşmadı." }
            $crashPaths = @((Join-Path $webViewData "EBWebView\Crashpad\reports"), (Join-Path $env:LOCALAPPDATA "CrashDumps"))
            $crashFiles = foreach ($path in $crashPaths) { if (Test-Path -LiteralPath $path) { Get-ChildItem -LiteralPath $path -File -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 8 FullName, Length, LastWriteTime } }
            $crashText = if ($crashFiles) { $crashFiles | Format-Table -AutoSize | Out-String } else { "Çökme dökümü bulunamadı." }
            $wvProcesses = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" -ErrorAction SilentlyContinue | Select-Object ProcessId, ParentProcessId, ExecutablePath, CommandLine | Format-List | Out-String
            $eventText = try { Get-WinEvent -FilterHashtable @{ LogName = "Application"; StartTime = (Get-Date).AddMinutes(-2); Id = @(1000, 1001, 1026) } -MaxEvents 30 -ErrorAction SilentlyContinue | Where-Object { $_.Message -match "(?i)mihenk|msedgewebview2|webview2" } | Select-Object -First 8 TimeCreated, ProviderName, Id, Message | Format-List | Out-String } catch { $_.Exception.Message }
            $runtimeText = if ($runtimeSummary) { $runtimeSummary -join " | " } else { "WebView2 Runtime sürümü belirlenemedi." }
            throw ("MSI ile kurulan uygulama kapandı. Çıkış kodu: $($process.ExitCode). stdout: $outText stderr: $errText başlangıç günlüğü: $startupText" + [Environment]::NewLine + "WebView2: " + $runtimeText + [Environment]::NewLine + "WebView2 süreçleri: " + $wvProcesses + [Environment]::NewLine + "Çökme dosyaları: " + $crashText + [Environment]::NewLine + "Windows Application olayları: " + $eventText)
        }
    }

    if (-not (Test-Path -LiteralPath $startupLog)) {
        throw "Uygulama açık kaldı fakat başlangıç günlüğü oluşmadı: $startupLog"
    }
    $startupText = Get-Content -LiteralPath $startupLog -Raw
    if ($startupText -notmatch "\[setup\] Tauri başlangıç kurulumu tamamlandı") {
        throw "Uygulama 20 saniye açık kaldı ancak başlangıç kurulumu tamamlanma kaydı yok. Günlük: $startupText"
    }

    Write-Host "MSI kurulumu ve gerçek Program Files uygulama başlatması başarılı. PID: $($process.Id)"
    Write-Host "Başlangıç günlüğü: $startupLog"
}
finally {
    $process.Refresh()
    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
}
