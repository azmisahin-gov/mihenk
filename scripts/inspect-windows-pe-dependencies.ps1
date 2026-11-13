param(
    [ValidateSet("pre-bundle", "post-bundle")]
    [string]$Stage = "pre-bundle"
)

$ErrorActionPreference = "Stop"
$appPath = Join-Path $PWD "src-tauri/target/release/mihenk.exe"
if (-not (Test-Path -LiteralPath $appPath -PathType Leaf)) {
    throw "Windows yayın ikilisi bulunamadı: $appPath"
}

$item = Get-Item -LiteralPath $appPath
$hash = Get-FileHash -LiteralPath $appPath -Algorithm SHA256
$signature = Get-AuthenticodeSignature -LiteralPath $appPath

Write-Host "========== Windows PE tanılaması: $Stage =========="
Write-Host ("EXE: " + $appPath)
Write-Host ("Boyut: " + $item.Length)
Write-Host ("SHA-256: " + $hash.Hash)
Write-Host ("Dosya sürümü: " + $item.VersionInfo.FileVersion)
Write-Host ("Ürün sürümü: " + $item.VersionInfo.ProductVersion)
Write-Host ("Authenticode: " + $signature.Status)
if ($signature.SignerCertificate) {
    Write-Host ("İmzalayan: " + $signature.SignerCertificate.Subject)
}

Write-Host "Uygulama dizinindeki yerel DLL dosyaları:"
$dlls = @(Get-ChildItem -LiteralPath (Split-Path -Parent $appPath) -Filter "*.dll" -File -ErrorAction SilentlyContinue)
if ($dlls.Count -eq 0) {
    Write-Host "(yerel DLL yok)"
}
else {
    $dlls | Select-Object Name, Length | Format-Table -AutoSize | Out-String | Write-Host
}

$vswhere = Join-Path ([Environment]::GetFolderPath("ProgramFilesX86")) "Microsoft Visual Studio\Installer\vswhere.exe"
$dumpbin = $null
if (Test-Path -LiteralPath $vswhere) {
    $vsPath = & $vswhere -latest -products "*" -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vsPath) {
        $toolRoot = Join-Path $vsPath "VC\Tools\MSVC"
        if (Test-Path -LiteralPath $toolRoot) {
            $dumpbin = Get-ChildItem -LiteralPath $toolRoot -Filter "dumpbin.exe" -File -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match "\\bin\\Hostx64\\x64\\dumpbin\.exe$" } |
                Sort-Object FullName -Descending |
                Select-Object -First 1 -ExpandProperty FullName
        }
    }
}

if (-not $dumpbin) {
    $command = Get-Command "dumpbin.exe" -ErrorAction SilentlyContinue
    if ($command) { $dumpbin = $command.Source }
}

if ($dumpbin) {
    Write-Host ("DUMPBIN: " + $dumpbin)
    Write-Host "Doğrudan DLL bağımlılıkları (/DEPENDENTS):"
    & $dumpbin /DEPENDENTS $appPath
    if ($LASTEXITCODE -ne 0) {
        throw "dumpbin /DEPENDENTS başarısız oldu: $LASTEXITCODE"
    }
    Write-Host "PE başlık özeti (/HEADERS):"
    & $dumpbin /HEADERS $appPath |
        Select-String -Pattern "machine|subsystem|DLL characteristics|linker version|operating system version" |
        ForEach-Object { Write-Host $_.Line }
    if ($LASTEXITCODE -ne 0) {
        throw "dumpbin /HEADERS başarısız oldu: $LASTEXITCODE"
    }
}
else {
    Write-Warning "Visual Studio dumpbin.exe bulunamadı; PE DLL listesi atlandı."
}

Write-Host "İlgili Windows çalışma zamanı ortamı:"
Write-Host ("PATH=" + $env:PATH)
Write-Host ("VCToolsRedistDir=" + $env:VCToolsRedistDir)
Write-Host "========== PE tanılaması tamamlandı =========="
