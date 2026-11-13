$ErrorActionPreference = "Stop"

$appPath = Join-Path $PWD "src-tauri/target/release/mihenk.exe"
if (-not (Test-Path -LiteralPath $appPath -PathType Leaf)) {
    throw "Windows yayın ikilisi bulunamadı: $appPath"
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
if (-not $dumpbin) {
    throw "dumpbin.exe bulunamadı; Windows PE import tablosu doğrulanamadı."
}

Write-Host "Windows PE DLL bağımlılıkları denetleniyor: $appPath"
$dependencyOutput = & $dumpbin /DEPENDENTS $appPath 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "dumpbin /DEPENDENTS başarısız oldu: $LASTEXITCODE"
}
$dependencyText = $dependencyOutput -join "`n"
if ($dependencyText -match "(?im)^\s*vertdll\.dll\s*$") {
    throw "MİHENK EXE vertdll.dll içe aktarıyor. Rust 1.100 + windows 0.36 eski import kütüphanesi WaitOnAddress işlevlerini yanlış DLL'ye bağlayabilir. x86_64-pc-windows-msvc için synchronization API set importu kullanılmalı."
}
Write-Host "PE import denetimi başarılı: vertdll.dll bağımlılığı yok."
