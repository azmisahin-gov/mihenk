$ErrorActionPreference = "Stop"

function Get-WebView2RuntimeVersion {
    $roots = @(
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients"
    )
    $versions = @()

    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }

        foreach ($key in Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue) {
            $name = $key.GetValue("name")
            $rawVersion = $key.GetValue("pv")
            if ($name -match "WebView2" -and $rawVersion) {
                try {
                    $versions += [version]$rawVersion
                } catch {
                    Write-Warning "WebView2 sürümü ayrıştırılamadı: $rawVersion"
                }
            }
        }
    }

    if ($versions.Count -eq 0) { return $null }
    return ($versions | Sort-Object -Descending | Select-Object -First 1)
}

$before = Get-WebView2RuntimeVersion
Write-Host ("Kurulum öncesi WebView2 Runtime: " + $(if ($before) { $before.ToString() } else { "yüklü değil" }))

$installerPath = Join-Path $env:RUNNER_TEMP "MicrosoftEdgeWebView2Bootstrapper.exe"
$downloadUri = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"

Write-Host "Microsoft'un Evergreen WebView2 Bootstrapper'ı indiriliyor."
Invoke-WebRequest -Uri $downloadUri -OutFile $installerPath -MaximumRedirection 10

if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
    throw "WebView2 Bootstrapper indirilmedi."
}

$signature = Get-AuthenticodeSignature -LiteralPath $installerPath
if ($signature.Status -ne "Valid") {
    throw "WebView2 Bootstrapper Authenticode imzası geçersiz: $($signature.Status) - $($signature.StatusMessage)"
}
if ($signature.SignerCertificate.Subject -notmatch "Microsoft") {
    throw "WebView2 Bootstrapper Microsoft tarafından imzalanmamış: $($signature.SignerCertificate.Subject)"
}

Write-Host ("Bootstrapper imzası doğrulandı: " + $signature.SignerCertificate.Subject)
$installer = Start-Process -FilePath $installerPath -ArgumentList "/silent /install" -Wait -PassThru
if ($installer.ExitCode -notin @(0, 3010, 1641)) {
    throw "WebView2 Evergreen kurulumu başarısız. Çıkış kodu: $($installer.ExitCode)"
}

$deadline = (Get-Date).AddMinutes(2)
$after = $null
do {
    Start-Sleep -Seconds 2
    $after = Get-WebView2RuntimeVersion
} while (-not $after -and (Get-Date) -lt $deadline)

if (-not $after) {
    throw "Bootstrapper çalıştı fakat WebView2 Runtime kayıt defterinde bulunamadı."
}

Write-Host ("Kurulum sonrası WebView2 Runtime: " + $after.ToString())
if ($before -and $after -lt $before) {
    throw "WebView2 Runtime sürümü geriledi: önce $before, sonra $after"
}
Write-Host "Windows smoke testleri güncel Evergreen WebView2 Runtime üzerinde çalıştırılacak."
