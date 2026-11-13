<#
.SYNOPSIS
  Prepara o ambiente, valida, compila e publica a Plataforma AEC no Firebase.

.DESCRIPTION
  1. Confere pré-requisitos (Node 20+, npm, Firebase CLI) e instala o que faltar.
  2. Garante a estrutura de pastas do projeto e a pasta local de projetos CAD.
  3. Instala dependências (raiz e Cloud Functions).
  4. Seleciona o projeto Firebase e gera o .env.local a partir do app Web.
  5. Roda typecheck, testes e build de produção.
  6. Publica regras, índices, Storage, Functions e Hosting.

.EXAMPLE
  .\scripts\setup-deploy.ps1 -ProjectId meu-projeto-aec
  .\scripts\setup-deploy.ps1 -ProjectId meu-projeto-aec -Alvo regras
  .\scripts\setup-deploy.ps1 -ProjectId meu-projeto-aec -Emuladores
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9-]{4,30}$')][string]$ProjectId,
  [ValidateSet('tudo', 'hosting', 'functions', 'regras')][string]$Alvo = 'tudo',
  [string]$Regiao = 'southamerica-east1',
  [string]$PastaCad = (Join-Path $HOME 'ProjetosCAD'),
  [switch]$PularInstalacao,
  [switch]$PularTestes,
  [switch]$Emuladores,
  [switch]$SemDeploy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Raiz = Split-Path -Parent $PSScriptRoot
Set-Location $Raiz
$inicio = Get-Date

function Write-Etapa([string]$Texto) { Write-Host "`n==> $Texto" -ForegroundColor Cyan }
function Write-Ok([string]$Texto) { Write-Host "    OK  $Texto" -ForegroundColor Green }

# Executa um comando externo e interrompe o script se ele falhar (PowerShell não faz isso sozinho).
function Invoke-Cmd {
  param([Parameter(Mandatory = $true)][string]$Exe, [string[]]$Argumentos = @(), [string]$Descricao = $Exe)
  Write-Host "    > $Exe $($Argumentos -join ' ')" -ForegroundColor DarkGray
  & $Exe @Argumentos
  if ($LASTEXITCODE -ne 0) { throw "Falha em '$Descricao' (código $LASTEXITCODE)." }
}

# Executa um comando do Firebase CLI com --json e devolve o campo `result`.
function Invoke-FirebaseJson {
  param([string[]]$Argumentos)
  $saida = & firebase @Argumentos --project $ProjectId --json 2>$null
  if ($LASTEXITCODE -ne 0) { throw "firebase $($Argumentos -join ' ') falhou: $saida" }
  $json = ($saida -join "`n") | ConvertFrom-Json
  if ($json.status -ne 'success') { throw "firebase $($Argumentos -join ' ') retornou status '$($json.status)'." }
  return $json.result
}

try {
  # ── 1. Pré-requisitos ──────────────────────────────────────────────────────
  Write-Etapa 'Verificando pré-requisitos'
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js não encontrado. Instale o Node 20 LTS: winget install OpenJS.NodeJS.LTS'
  }
  $nodeMajor = [int]((& node -v) -replace '^v(\d+)\..*$', '$1')
  if ($nodeMajor -lt 20) { throw "Node $nodeMajor detectado; é necessário Node 20 ou superior." }
  Write-Ok "Node $(& node -v) / npm $(& npm -v)"

  if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host '    Firebase CLI ausente — instalando globalmente...' -ForegroundColor Yellow
    Invoke-Cmd npm @('install', '-g', 'firebase-tools') 'instalação do firebase-tools'
  }
  Write-Ok "Firebase CLI $(& firebase --version)"

  # Em CI use a variável GOOGLE_APPLICATION_CREDENTIALS (conta de serviço); localmente, login interativo.
  if (-not $env:GOOGLE_APPLICATION_CREDENTIALS) {
    & firebase projects:list --json *> $null
    if ($LASTEXITCODE -ne 0) {
      Write-Host '    Sessão do Firebase não encontrada — abrindo login...' -ForegroundColor Yellow
      Invoke-Cmd firebase @('login') 'firebase login'
    }
  }
  Write-Ok 'Autenticado no Firebase'

  # ── 2. Estrutura de pastas ─────────────────────────────────────────────────
  Write-Etapa 'Garantindo a estrutura de pastas'
  $pastas = @(
    'src/app', 'src/components', 'src/hooks', 'src/lib/cub', 'src/lib/cad', 'src/lib/contracts',
    'functions/src', 'scripts', 'tests', 'data', 'public', 'backups'
  )
  foreach ($p in $pastas) { New-Item -ItemType Directory -Force -Path (Join-Path $Raiz $p) | Out-Null }
  # Pasta local espelhada pelo sync-cad.ps1: <PastaCad>\<projectId>\<disciplina>\arquivo.dwg
  foreach ($d in 'arquitetonico', 'estrutural', 'hidrossanitario', 'eletrico', 'topografia', 'terraplenagem',
    'urbanismo', 'pavimentacao', 'drenagem', 'esgotamento', 'abastecimento_agua') {
    New-Item -ItemType Directory -Force -Path (Join-Path $PastaCad "_modelo/$d") | Out-Null
  }
  Write-Ok "Projeto em $Raiz"
  Write-Ok "Pasta CAD local em $PastaCad"

  # ── 3. Dependências ────────────────────────────────────────────────────────
  if (-not $PularInstalacao) {
    Write-Etapa 'Instalando dependências'
    $cmdRaiz = if (Test-Path (Join-Path $Raiz 'package-lock.json')) { 'ci' } else { 'install' }
    Invoke-Cmd npm @($cmdRaiz, '--no-audit', '--no-fund') 'npm (raiz)'
    $cmdFn = if (Test-Path (Join-Path $Raiz 'functions/package-lock.json')) { 'ci' } else { 'install' }
    Invoke-Cmd npm @('--prefix', 'functions', $cmdFn, '--no-audit', '--no-fund') 'npm (functions)'
  }

  # ── 4. Projeto Firebase e .env.local ───────────────────────────────────────
  Write-Etapa "Configurando o projeto Firebase '$ProjectId'"
  # WriteAllText grava UTF-8 sem BOM (no Windows PowerShell 5.1, Set-Content -Encoding utf8 incluiria BOM).
  [System.IO.File]::WriteAllText((Join-Path $Raiz '.firebaserc'), (@{ projects = @{ default = $ProjectId } } | ConvertTo-Json))
  Write-Ok '.firebaserc gravado'

  if (-not $Emuladores) {
    $apps = @(Invoke-FirebaseJson @('apps:list', 'WEB'))
    if ($apps.Count -eq 0) {
      Write-Host '    Nenhum app Web no projeto — criando...' -ForegroundColor Yellow
      $novo = Invoke-FirebaseJson @('apps:create', 'WEB', 'Plataforma AEC')
      $appId = $novo.appId
    } else {
      $appId = $apps[0].appId
    }
    $resultado = Invoke-FirebaseJson @('apps:sdkconfig', 'WEB', $appId)
    $cfg = if ($resultado.PSObject.Properties.Name -contains 'sdkConfig') { $resultado.sdkConfig } else { $resultado }
    if (-not $cfg.apiKey) { throw 'Não foi possível ler a configuração do app Web (apiKey ausente).' }

    $envLocal = @(
      "NEXT_PUBLIC_FIREBASE_API_KEY=$($cfg.apiKey)"
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$($cfg.authDomain)"
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$($cfg.projectId)"
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$($cfg.storageBucket)"
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$($cfg.messagingSenderId)"
      "NEXT_PUBLIC_FIREBASE_APP_ID=$($cfg.appId)"
      "NEXT_PUBLIC_FUNCTIONS_REGION=$Regiao"
    )
    # WriteAllLines grava UTF-8 sem BOM (o BOM quebraria a leitura da primeira variável pelo Next.js).
    [System.IO.File]::WriteAllLines((Join-Path $Raiz '.env.local'), $envLocal)
    Write-Ok ".env.local gerado a partir do app $appId"
  }

  # ── 5. Qualidade e build ───────────────────────────────────────────────────
  if (-not $PularTestes) {
    Write-Etapa 'Typecheck e testes'
    Invoke-Cmd npm @('run', 'typecheck') 'typecheck'
    Invoke-Cmd npm @('test') 'testes'
  }
  if ($Alvo -in 'tudo', 'hosting') {
    Write-Etapa 'Build de produção (Next.js → out/)'
    Invoke-Cmd npm @('run', 'build') 'build'
    if (-not (Test-Path (Join-Path $Raiz 'out/index.html'))) { throw 'Build concluído, mas out/index.html não existe.' }
  }
  if ($Alvo -in 'tudo', 'functions') {
    Write-Etapa 'Compilando Cloud Functions'
    Invoke-Cmd node @('scripts/sync-shared.mjs') 'sync-shared'
    Invoke-Cmd npm @('--prefix', 'functions', 'run', 'build') 'build das functions'
  }

  # ── 6. Emuladores ou deploy ────────────────────────────────────────────────
  if ($Emuladores) {
    Write-Etapa 'Iniciando emuladores (Ctrl+C para encerrar)'
    Invoke-Cmd firebase @('emulators:start', '--project', $ProjectId) 'emuladores'
    return
  }
  if ($SemDeploy) {
    Write-Ok 'Build validado; deploy ignorado (-SemDeploy).'
    return
  }

  Write-Etapa "Publicando ($Alvo)"
  $somente = switch ($Alvo) {
    'tudo'      { 'firestore:rules,firestore:indexes,storage,functions,hosting' }
    'hosting'   { 'hosting' }
    'functions' { 'functions' }
    'regras'    { 'firestore:rules,firestore:indexes,storage' }
  }
  Invoke-Cmd firebase @('deploy', '--project', $ProjectId, '--only', $somente, '--non-interactive', '--force') 'firebase deploy'

  $duracao = [int]((Get-Date) - $inicio).TotalSeconds
  Write-Host "`nDeploy concluído em ${duracao}s." -ForegroundColor Green
  Write-Host "  App:      https://$ProjectId.web.app"
  Write-Host "  Console:  https://console.firebase.google.com/project/$ProjectId/overview"
  if ($Alvo -in 'tudo', 'functions') {
    Write-Host "`nSecrets usadas pelas Functions (defina uma vez):" -ForegroundColor Yellow
    foreach ($s in 'CLICKSIGN_TOKEN', 'CLICKSIGN_HMAC_SECRET', 'WEBHOOK_SIGNING_KEY', 'APS_CLIENT_ID', 'APS_CLIENT_SECRET') {
      Write-Host "  firebase functions:secrets:set $s --project $ProjectId"
    }
  }
}
catch {
  Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
