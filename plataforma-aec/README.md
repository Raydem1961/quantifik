# Plataforma AEC — Gestão Integrada de Projetos, CAD/QTO e Orçamento CUB

SaaS B2B multi-tenant para escritórios de arquitetura e engenharia: briefing paramétrico, upload
versionado de CAD com extração de quantitativos, orçamento pelo CUB estadual (NBR 12721), contratos
com variáveis dinâmicas, PDF vetorial e assinatura digital.

**Stack:** Next.js 14 (App Router, exportação estática) · TypeScript · Tailwind + componentes no padrão
shadcn/ui · Firebase (Auth, Firestore, Storage, Functions 2ª geração, Hosting) · PowerShell.

## Começar

```powershell
# Modo demonstração (sem Firebase): dados fictícios em memória
npm install
npm run dev            # http://localhost:3000

# Ambiente completo + deploy
.\scripts\setup-deploy.ps1 -ProjectId <id-do-projeto-firebase>
```

Sem `.env.local` o app sobe em **modo demonstração**; com as variáveis `NEXT_PUBLIC_FIREBASE_*`
(geradas pelo `setup-deploy.ps1`) ele usa Auth/Firestore/Storage reais.

| Comando | O que faz |
|---|---|
| `npm test` | Testes dos motores (CUB, cronograma, DXF, Civil 3D, contratos, hash) |
| `npm run test:rules` | Testes das regras do Firestore no emulador (requer Java) |
| `npm run typecheck` / `npm run build` | Checagem de tipos / build estático em `out/` |
| `scripts/setup-deploy.ps1` | Pré-requisitos, dependências, `.env.local`, testes, build e deploy |
| `scripts/import-cub.ps1` | Importa o CUB mensal (CSV) para `cubTables` — `-Simular` só valida |
| `scripts/sync-cad.ps1` | Monitora a pasta local de CAD e envia cada arquivo salvo |
| `scripts/backup.ps1` | Exporta o Firestore e sincroniza o Storage para um bucket de backup |

## Arquitetura de pastas

```
plataforma-aec/
├─ firebase.json · firestore.rules · firestore.indexes.json · storage.rules
├─ scripts/
│  ├─ setup-deploy.ps1 · backup.ps1 · sync-cad.ps1 · import-cub.ps1
│  ├─ import-cub.mjs           validação + gravação do CUB (Admin SDK)
│  └─ sync-shared.mjs          copia src/lib/{cad,cub} → functions/src/shared (predeploy)
├─ functions/src/
│  ├─ index.ts                 upload CAD→QTO, auditoria, notificações, RBAC, assinatura, alertas ART
│  └─ aps.ts                   Autodesk Platform Services (conversão de DWG)
├─ src/
│  ├─ lib/
│  │  ├─ types.ts              schema tipado do Firestore
│  │  ├─ cub/engine.ts         NBR 12721 + CUB + padrões + BDI + what-if
│  │  ├─ cub/schedule.ts       Curva S, cronograma físico-financeiro, Curva ABC
│  │  ├─ cad/dxf-qto.ts        parser DXF + quantitativos por camada
│  │  ├─ cad/civil3d.ts        volumes de corte/aterro (CSV e LandXML)
│  │  ├─ briefing/scope.ts     briefing → escopo e entregáveis
│  │  ├─ contracts/template.ts variáveis e cláusulas condicionais
│  │  ├─ signature/hash.ts     SHA-256 e envelope de assinatura
│  │  └─ rbac.ts · format.ts · demo-data.ts · firebase/client.ts
│  ├─ hooks/                   use-auth (claims), use-colecao (onSnapshot), use-workspace
│  ├─ components/              ui/ · layout/ · dashboard/ · budget/ · cad/ · contracts/
│  └─ app/(app)/               dashboard · briefing · cad · orcamento · contratos   (+ /login)
├─ tests/core.test.ts · tests/rules/firestore.rules.test.ts
└─ data/cub-modelo.csv
```

Os motores em `src/lib/{cub,cad}` são TypeScript puro, sem dependências: o mesmo código roda no
navegador (resposta instantânea), nas Cloud Functions (resultado oficial) e nos testes.

## Schema do Firestore

```
cubTables/{UF}_{AAAA-MM}                  global · leitura autenticada · escrita só Admin SDK
signatureRequests/{documentKey}            índice provedor→contrato · só backend
tenants/{tenantId}                         razão social, CNPJ, branding, RT (CREA/CAU), webhookUrl, custoHoraTecnica
 ├─ members/{uid}                          nome, email, role, projectIds          (escrita: função definirPapel)
 ├─ clients/{clientId}
 ├─ cubOverrides/{UF}_{AAAA-MM}            ajustes do tenant sobre o CUB oficial   (auditado)
 ├─ notifications/{id}                     tipo, titulo, mensagem, lidaPor[], destinatarios[]
 ├─ auditLogs/{id}                         acao, recurso, caminho, uid, antes, depois, em   (imutável)
 └─ projects/{projectId}                   codigo, nome, tipologia, status, disciplinas[], prazos, clienteUids[]
     ├─ briefings/{id}                     entradas + escopo gerado
     ├─ files/{fileId}                     nome, disciplina, revisaoAtual, totalRevisoes
     │   └─ versions/{R00|R01|…}           storagePath, sha256, qtoStatus, qto        (imutável)
     ├─ redlines/{id}                      pontos em coordenadas do desenho, autorUid
     ├─ budgets/{id}                       entradas, resultado, status (rascunho→enviado→aprovado)
     ├─ contracts/{id}                     template, variaveis, status, sha256, assinatura
     ├─ artRrt/{id}                        tipo, disciplina, etapa, status, vencimento, tenantId
     └─ timesheets/{id}                    uid, disciplina, inicio, minutos, tenantId
```

Storage: `tenants/{t}/projects/{p}/cad/{disciplina}/{carimbo}__{arquivo}` (objetos imutáveis; a
revisão é atribuída em transação pela função `processarUploadCad`) e `…/docs/{codigo}.pdf`.

### Segurança multi-tenant

- `tenantId` e `role` vivem em **custom claims** do token, gravadas apenas pela função `definirPapel`
  (só o Sócio-Diretor chama; um usuário não pode ser movido de outro tenant).
- Toda regra compara `request.auth.token.tenantId` com o `{tenantId}` do caminho.
- Campos sensíveis (status/hash/assinatura de contrato, revisões de CAD, papéis, auditoria, CUB
  oficial) só são gravados pelo backend.
- Cliente final (Portal): lê apenas projetos em que está em `clienteUids`, orçamentos enviados e
  contratos em assinatura; a única escrita permitida é aprovar um orçamento enviado.

| Papel | Projetos | CAD | Orçamento | Contratos | Horas | Auditoria/Equipe |
|---|---|---|---|---|---|---|
| Sócio-Diretor | editar/excluir | enviar/excluir | editar/aprovar | editar/enviar | todas | sim |
| Coordenador | editar | enviar/excluir | editar | editar/enviar | todas | — |
| Orçamentista | ler | enviar | editar | ler | próprias | — |
| Projetista | ler | enviar | ler | — | próprias | — |
| Cliente | os seus | ler | ler enviados/aprovar | ler os seus | — | — |

## Convenção de camadas para o QTO

Desenhe uma polilinha fechada por ambiente nas camadas abaixo e o quadro de áreas do orçamento é
preenchido automaticamente (regras em `REGRAS_CAMADAS_PADRAO`, customizáveis):

`A-AREA-PRIV` · `A-AREA-GARAGEM` · `A-AREA-VARANDA` · `A-AREA-TERRACO` · `A-AREA-PISCINA` ·
`A-AREA-JARDIM` · `A-AREA-ESTAC`

## Limites conhecidos

- **CUB:** o repositório não traz valores oficiais. As tabelas do modo demo e `data/cub-modelo.csv`
  são ilustrativas; importe a planilha do Sinduscon do seu estado todo mês.
- **DWG:** é binário proprietário. A plataforma armazena e versiona; os quantitativos saem do DXF
  (`sync-cad.ps1 -ConverterDxf` gera via AutoCAD) ou da conversão APS, que exige credenciais Autodesk.
- **Visualizador:** Canvas 2D do model space (linhas, polilinhas, arcos, círculos, elipses,
  hachuras, textos; blocos aparecem como marcadores). Sem 3D.
- **Assinatura:** integração implementada para Clicksign (API v1). DocuSign e Gov.br estão previstos
  no tipo `ProvedorAssinatura`, sem adaptador.
- **Modelo de contrato:** ponto de partida; precisa de revisão jurídica do escritório.
