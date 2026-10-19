$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Selecciona el Excel privado de La Alameda'
$dialog.Filter = 'Archivos de Excel (*.xlsx)|*.xlsx'
$dialog.Multiselect = $false

if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Host 'No se seleccionó ningún archivo. No se publicó ningún cambio.'
    exit 0
}

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Push-Location $projectRoot

try {
    $branch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo comprobar la rama actual de Git.'
    }
    if ($branch -ne 'main') {
        throw "La rama actual es '$branch'. Cambia a main antes de publicar los precios."
    }

    & npm.cmd run sync-prices -- $dialog.FileName
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudieron leer los precios del Excel; no se publicó ningún cambio.'
    }

    & git add -- src/data/prices.generated.ts
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo preparar el archivo público de precios para Git.'
    }

    & git diff --cached --quiet -- src/data/prices.generated.ts
    $diffStatus = $LASTEXITCODE
    if ($diffStatus -eq 0) {
        Write-Host 'Los precios ya coinciden con los publicados. No hace falta actualizar la web.'
        exit 0
    }
    if ($diffStatus -ne 1) {
        throw 'No se pudo comprobar el cambio de precios preparado.'
    }

    $confirmation = Read-Host 'Se publicará únicamente el archivo con precios públicos. ¿Continuar? (S/N)'
    if ($confirmation -notmatch '^(s|si|sí)$') {
        Write-Host 'El archivo se generó, pero no se publicó. No se subió el Excel original.'
        exit 0
    }

    & git commit -m 'Actualiza precios desde el Excel' `
        -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>' `
        -- src/data/prices.generated.ts
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo guardar el cambio de precios en Git.'
    }

    & git push origin main
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudieron publicar los precios en GitHub. Inicia sesión en GitHub y vuelve a intentarlo.'
    }

    Write-Host ''
    Write-Host 'Precios publicados en GitHub. La web se actualizará cuando termine GitHub Pages.'
    Write-Host 'https://rivenliclub25-prog.github.io/Laalameda/'
}
catch {
    Write-Error $_
    exit 1
}
finally {
    Pop-Location
}
