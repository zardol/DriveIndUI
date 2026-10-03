$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskBuild = Join-Path $taskRoot 'dist/demo'
if (-not (Test-Path -LiteralPath (Join-Path $taskBuild 'index.html'))) { throw 'Run npm run build:demo first.' }
$taskBundle = Join-Path $taskRoot ('.local/releases/bundle-' + [guid]::NewGuid().ToString('N'))
$taskPublic = Join-Path $taskBundle 'public'
New-Item -ItemType Directory -Path $taskPublic -Force | Out-Null
Copy-Item -Path (Join-Path $taskBuild '*') -Destination $taskPublic -Recurse
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'serve-demo.mjs') -Destination $taskBundle
@'
@echo off
cd /d "%~dp0"
node serve-demo.mjs
pause
'@ | Set-Content -LiteralPath (Join-Path $taskBundle 'start-demo.cmd') -Encoding ascii
@'
KostaAllur — офлайн-демонстрация

Нужен заранее установленный Node.js 22 или новее. На компьютерах команды установлен Node.js 24.
Распакуйте весь архив. В Windows запустите start-demo.cmd.
В macOS/Linux выполните node serve-demo.mjs в распакованной папке.
Откройте http://localhost:4175 в браузере. Интернет и npm install не требуются.
Окно сервера должно оставаться открытым; Ctrl+C останавливает сервер.

Все данные синтетические. Обновление страницы начинает новую смену.
Штатная работа: первый автомобиль примерно через 18 секунд при скорости ×60.
Сбой оборудования: предупреждение на 10-й минуте модели, остановка на 20-й, восстановление на 35-й.
Узкое место: с 10-й минуты модели цикл сборки увеличивается вдвое, очередь постепенно растёт.
Если смена стоит на паузе, после выбора сценария нажмите «Запустить».
'@ | Set-Content -LiteralPath (Join-Path $taskBundle 'README.txt') -Encoding utf8
$taskZip = Join-Path $taskRoot '.local/releases/KostaAllur-offline.zip'
Compress-Archive -Path (Join-Path $taskBundle '*') -DestinationPath $taskZip -Force
Write-Output $taskZip
Write-Output $taskBundle
