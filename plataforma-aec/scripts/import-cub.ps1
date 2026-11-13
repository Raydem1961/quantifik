<#
.SYNOPSIS
  Importa/atualiza a tabela mensal do CUB no Firestore a partir de um CSV normalizado.

.DESCRIPTION
  Colunas do CSV (separador ; ou ,):
    uf;competencia;fonte;desonerado;projeto;materiais;mao_de_obra;despesas_administrativas;equipamentos;total
  Preencha a partir da planilha oficial do Sinduscon do seu estado (veja data/cub-modelo.csv).
  Autenticação: `gcloud auth application-default login` ou GOOGLE_APPLICATION_CREDENTIALS.

.EXAMPLE
  .\scripts\import-cub.ps1 -ProjectId meu-projeto-aec -Arquivo .\data\cub-2026-11.csv -Simular
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$Arquivo,
  [switch]$Simular
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path $Arquivo)) { Write-Host "Arquivo não encontrado: $Arquivo" -ForegroundColor Red; exit 1 }
$argumentos = @((Join-Path $raiz 'scripts/import-cub.mjs'), (Resolve-Path $Arquivo).Path, '--project', $ProjectId)
if ($Simular) { $argumentos += '--dry-run' }
& node @argumentos
exit $LASTEXITCODE
