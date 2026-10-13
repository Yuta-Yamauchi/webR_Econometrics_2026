param([int]$Port = 8766)
$ErrorActionPreference = 'Stop'
$previewScript = Join-Path $PSScriptRoot 'serve.mjs'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'ローカル表示にはNode.jsが必要です。GitHub Pagesへの公開にはNode.jsは不要です。'
    exit 1
}
Write-Host "ブラウザで http://127.0.0.1:$Port/ を開いてください。終了は Ctrl+C です。"
& node $previewScript $Port
