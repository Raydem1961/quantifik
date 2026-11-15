<#
.SYNOPSIS
  Backup do Firestore (exportação gerenciada) e do Cloud Storage para um bucket de backups.

.DESCRIPTION
  Requer o Google Cloud SDK (gcloud) autenticado com permissão de
  "Cloud Datastore Import Export Admin" e de escrita no bucket de destino.
  Agende no Agendador de Tarefas do Windows para execução diária.

.EXAMPLE
  .\scripts\backup.ps1 -ProjectId meu-projeto-aec -BucketBackup meu-projeto-aec-backups -RetencaoDias 30
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$BucketBackup,
  [string]$BucketOrigem = "$ProjectId.firebasestorage.app",
  [ValidateRange(1, 3650)][int]$RetencaoDias = 30,
  [switch]$SomenteFirestore
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Gcloud([string[]]$Argumentos) {
  Write-Host "> gcloud $($Argumentos -join ' ')" -ForegroundColor DarkGray
  & gcloud @Argumentos
  if ($LASTEXITCODE -ne 0) { throw "gcloud $($Argumentos[0..1] -join ' ') falhou (código $LASTEXITCODE)." }
}

try {
  if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw 'Google Cloud SDK não encontrado: winget install Google.CloudSDK' }
  $carimbo = Get-Date -Format 'yyyy-MM-dd_HHmmss'
  $destino = "gs://$BucketBackup/firestore/$carimbo"

  Write-Host "Exportando o Firestore para $destino" -ForegroundColor Cyan
  Invoke-Gcloud @('firestore', 'export', $destino, "--project=$ProjectId")

  if (-not $SomenteFirestore) {
    Write-Host 'Sincronizando arquivos (CAD e PDFs)' -ForegroundColor Cyan
    # rsync sem exclusão no destino: um arquivo apagado na origem continua no backup.
    Invoke-Gcloud @('storage', 'rsync', "gs://$BucketOrigem/organizations", "gs://$BucketBackup/storage/organizations", '--recursive', "--project=$ProjectId")
  }

  Write-Host "Aplicando retenção de $RetencaoDias dias às exportações do Firestore" -ForegroundColor Cyan
  $limite = (Get-Date).AddDays(-$RetencaoDias)
  $pastas = & gcloud storage ls "gs://$BucketBackup/firestore/" "--project=$ProjectId"
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível listar os backups existentes; nada foi removido.' }
  foreach ($pasta in $pastas) {
    if ($pasta -match '/firestore/(\d{4}-\d{2}-\d{2})_\d{6}/$') {
      $data = [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd', [cultureinfo]::InvariantCulture)
      if ($data -lt $limite) {
        Write-Host "  removendo $pasta"
        Invoke-Gcloud @('storage', 'rm', '--recursive', $pasta, "--project=$ProjectId")
      }
    }
  }
  Write-Host "Backup concluído: $destino" -ForegroundColor Green
}
catch {
  Write-Host "ERRO no backup: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
