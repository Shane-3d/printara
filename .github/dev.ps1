Write-Host "Printara Dev — starting print queue app..." -ForegroundColor Cyan

$appDir = Join-Path $PSScriptRoot "electron-app"

if (-not (Test-Path (Join-Path $appDir "node_modules"))) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install --prefix $appDir
}

Set-Location $appDir
npx electron .
