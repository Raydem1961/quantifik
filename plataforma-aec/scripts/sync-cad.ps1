<#
.SYNOPSIS
  Monitora a pasta local de projetos CAD e envia cada arquivo salvo para o Cloud Storage.

.DESCRIPTION
  Estrutura esperada:  <PastaCad>\<projectId>\<disciplina>\arquivo.(dwg|dxf|csv|xml)
  Cada envio vira um objeto novo e imutável; a Cloud Function `processarUploadCad` atribui a
  revisão (R00, R01…), extrai os quantitativos e notifica a equipe.
  Com -ConverterDxf (e AutoCAD instalado), gera também o DXF de cada DWG via accoreconsole,
  permitindo a extração de quantitativos sem depender do APS.

.EXAMPLE
  .\scripts\sync-cad.ps1 -ProjectIdFirebase meu-projeto-aec -TenantId atelier -PastaCad D:\Projetos
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectIdFirebase,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9_-]+$')][string]$TenantId,
  [string]$PastaCad = (Join-Path $HOME 'ProjetosCAD'),
  [string]$Bucket = "$ProjectIdFirebase.firebasestorage.app",
  [switch]$ConverterDxf,
  [string]$AcCoreConsole = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Extensoes = @('.dwg', '.dxf', '.csv', '.xml')
$Disciplinas = @('arquitetonico', 'estrutural', 'hidrossanitario', 'eletrico', 'terraplenagem')

if (-not (Test-Path $PastaCad)) { throw "Pasta não encontrada: $PastaCad" }
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw 'Google Cloud SDK não encontrado: winget install Google.CloudSDK' }

if ($ConverterDxf -and -not $AcCoreConsole) {
  $achado = Get-ChildItem 'C:\Program Files\Autodesk' -Filter accoreconsole.exe -Recurse -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $achado) { throw 'accoreconsole.exe não encontrado. Informe -AcCoreConsole ou remova -ConverterDxf.' }
  $AcCoreConsole = $achado.FullName
}

# Aguarda o AutoCAD terminar de gravar (o arquivo fica bloqueado durante o salvamento).
function Wait-ArquivoLivre([string]$Caminho, [int]$Tentativas = 30) {
  for ($i = 0; $i -lt $Tentativas; $i++) {
    try { $fs = [System.IO.File]::Open($Caminho, 'Open', 'Read', 'None'); $fs.Dispose(); return $true }
    catch { Start-Sleep -Milliseconds 500 }
  }
  return $false
}

function Convert-ParaDxf([string]$Dwg) {
  $dxf = [System.IO.Path]::ChangeExtension($Dwg, '.dxf')
  $scr = Join-Path $env:TEMP "dxfout_$([guid]::NewGuid().ToString('N')).scr"
  # DXFOUT: nome do arquivo, versão 2018, precisão de 16 casas. FILEDIA 0 evita caixas de diálogo.
  @('FILEDIA 0', "_DXFOUT `"$dxf`" _V 2018 16", '_QUIT _Y') | Set-Content -Path $scr -Encoding ascii
  try {
    & $AcCoreConsole /i $Dwg /s $scr *> $null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dxf)) { Write-Warning "Conversão para DXF falhou: $Dwg"; return $null }
    return $dxf
  } finally { Remove-Item $scr -ErrorAction SilentlyContinue }
}

function Send-Arquivo([string]$Caminho) {
  # Caminho relativo à pasta monitorada (compatível com Windows PowerShell 5.1 e PowerShell 7).
  $base = (Resolve-Path $PastaCad).Path.TrimEnd('\', '/')
  if (-not $Caminho.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) { return }
  $relativo = $Caminho.Substring($base.Length).TrimStart('\', '/') -replace '\\', '/'
  $partes = $relativo.Split('/')
  if ($partes.Count -ne 3) { return }                       # fora do padrão projeto/disciplina/arquivo
  $projeto, $disciplina, $nome = $partes
  if ($projeto.StartsWith('_') -or $disciplina -notin $Disciplinas) { return }
  if ([System.IO.Path]::GetExtension($nome).ToLower() -notin $Extensoes) { return }
  if ($nome -match '^~|\.bak$|\.dwl2?$|\.tmp$') { return }  # temporários do AutoCAD
  if (-not (Wait-ArquivoLivre $Caminho)) { Write-Warning "Arquivo em uso, ignorado: $relativo"; return }

  $seguro = $nome -replace '[^\w.\-]+', '_'
  $carimbo = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $destino = "gs://$Bucket/tenants/$TenantId/projects/$projeto/cad/$disciplina/${carimbo}__$seguro"
  & gcloud storage cp $Caminho $destino "--project=$ProjectIdFirebase" '--custom-metadata=uid=sync-local' --quiet
  if ($LASTEXITCODE -eq 0) { Write-Host "$(Get-Date -Format 'HH:mm:ss')  enviado  $relativo" -ForegroundColor Green }
  else { Write-Warning "Falha ao enviar $relativo (código $LASTEXITCODE)" }
}

$monitor = [System.IO.FileSystemWatcher]::new($PastaCad)
$monitor.IncludeSubdirectories = $true
$monitor.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite'
$monitor.EnableRaisingEvents = $true
foreach ($evento in 'Created', 'Changed', 'Renamed') {
  Register-ObjectEvent -InputObject $monitor -EventName $evento -SourceIdentifier "cad_$evento" | Out-Null
}

Write-Host "Monitorando $PastaCad → gs://$Bucket/tenants/$TenantId (Ctrl+C para sair)" -ForegroundColor Cyan
$pendentes = @{}   # caminho → instante do último evento (um "salvar" dispara vários eventos)
try {
  while ($true) {
    $ev = Wait-Event -Timeout 1
    if ($ev) {
      $pendentes[$ev.SourceEventArgs.FullPath] = Get-Date
      Remove-Event -EventIdentifier $ev.EventIdentifier
    }
    foreach ($caminho in @($pendentes.Keys)) {
      if (((Get-Date) - $pendentes[$caminho]).TotalSeconds -lt 3) { continue }   # espera a gravação assentar
      $pendentes.Remove($caminho)
      if (-not (Test-Path $caminho -PathType Leaf)) { continue }
      try {
        Send-Arquivo $caminho
        if ($ConverterDxf -and $caminho -like '*.dwg') {
          $dxf = Convert-ParaDxf $caminho
          # O DXF gerado dispara um novo evento do monitor e é enviado no próximo ciclo.
          if ($dxf) { Write-Host "            DXF gerado: $(Split-Path $dxf -Leaf)" -ForegroundColor DarkGray }
        }
      } catch { Write-Warning "Erro ao processar ${caminho}: $($_.Exception.Message)" }
    }
  }
}
finally {
  foreach ($evento in 'Created', 'Changed', 'Renamed') { Unregister-Event -SourceIdentifier "cad_$evento" -ErrorAction SilentlyContinue }
  $monitor.Dispose()
}
