$ErrorActionPreference = "Stop"

$sourcePath = Join-Path $env:RUNNER_TEMP "mihenk-windows-loader-baseline.rs"
$exePath = Join-Path $env:RUNNER_TEMP "mihenk-windows-loader-baseline.exe"
$stdoutPath = Join-Path $env:RUNNER_TEMP "mihenk-windows-loader-baseline.stdout.log"
$stderrPath = Join-Path $env:RUNNER_TEMP "mihenk-windows-loader-baseline.stderr.log"

$source = @'
fn main() {
    println!("MİHENK Windows loader baseline: OK");
}
'@
[System.IO.File]::WriteAllText($sourcePath, $source, [System.Text.UTF8Encoding]::new($false))

Write-Host "Bağımsız Rust/MSVC release-loader denetimi derleniyor."
& rustc --edition=2021 -C opt-level=3 -C debuginfo=0 -o $exePath $sourcePath
if ($LASTEXITCODE -ne 0) {
    throw "Bağımsız Rust/MSVC denetim ikilisi derlenemedi: $LASTEXITCODE"
}

$process = Start-Process -FilePath $exePath -Wait -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
$outText = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { "" }
$errText = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { "" }

if ($process.ExitCode -ne 0) {
    throw ("Windows runner loader baseline başarısız. Exit code: " + $process.ExitCode + "; stdout: " + $outText + "; stderr: " + $errText)
}
if ($outText -notmatch "MİHENK Windows loader baseline: OK") {
    throw ("Windows runner loader baseline beklenen çıktıyı üretmedi. stdout: " + $outText + "; stderr: " + $errText)
}

Write-Host "Windows runner Rust/MSVC release-loader baseline başarılı."
Write-Host $outText.Trim()
