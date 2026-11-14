# Plataforma AEC — Gestão Integrada de Projetos, CAD/QTO e Orçamento CUB

SaaS B2B multi-tenant para escritórios de arquitetura e engenharia: briefing paramétrico, importação
de CAD, BIM e redes com extração de quantitativos, orçamento pelo CUB estadual (NBR 12721) ou por
composições SINAPI/SICRO/ORSE, contratos com variáveis dinâmicas, PDF vetorial e assinatura digital.

**Tipologias:** residencial, comercial, industrial, condomínio horizontal e vertical, loteamento,
infraestrutura viária, topografia, saneamento (esgoto e drenagem) e redes de abastecimento de água.

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

### Primeira empresa

Pelas regras de segurança, só o backend cria empresas e atribui papéis. Depois do deploy:

```bash
# 1. a pessoa entra uma vez no aplicativo (cria a conta) e vê "Conta ainda sem empresa vinculada"
# 2. um administrador do projeto Firebase roda:
node scripts/criar-empresa.mjs --projeto <id-firebase> --tenant minha-empresa --nome "Minha Empresa" \
  --razao "Minha Empresa Ltda." --cnpj 00.000.000/0001-00 --uf BA \
  --rt "Eng. Fulano" --conselho CREA --registro "CREA-BA 12345" --socio email@empresa.com
# 3. a pessoa sai e entra de novo: já é Sócio-Diretor e atribui os demais papéis pelo aplicativo
```

Rodar de novo com outro `--socio` acrescenta um sócio sem alterar o cadastro da empresa.

Sem `.env.local` o app sobe em **modo demonstração**; com as variáveis `NEXT_PUBLIC_FIREBASE_*`
(geradas pelo `setup-deploy.ps1`) ele usa Auth/Firestore/Storage reais.

| Comando | O que faz |
|---|---|
| `npm test` | Testes dos motores (CUB, cronograma, DXF, Civil 3D, contratos, hash) |
| `npm run test:rules` | Testes das regras do Firestore no emulador (requer Java) |
| `npm run typecheck` / `npm run build` | Checagem de tipos / build estático em `out/` |
| `scripts/setup-deploy.ps1` | Pré-requisitos, dependências, `.env.local`, testes, build e deploy |
| `scripts/criar-empresa.mjs` | Cria a empresa (tenant) e o primeiro Sócio-Diretor — primeiro passo de uma instalação |
| `scripts/migrar-obratop.mjs` | Copia uma organização do ObraTop para a plataforma (simulação por padrão) |
| `scripts/import-cub.ps1` | Importa o CUB mensal (CSV) para `cubTables` — `-Simular` só valida |
| `scripts/sync-cad.ps1` | Monitora a pasta local de CAD e envia cada arquivo salvo |
| `scripts/backup.ps1` | Exporta o Firestore e sincroniza o Storage para um bucket de backup |

## Testes de ponta a ponta (emuladores)

Exercitam Cloud Functions, regras e a interface em modo Firebase real, sem tocar em nenhum projeto
de produção (projeto fictício `demo-aec`). Requer Java para os emuladores.

```bash
# 1. segredos e parâmetros locais das Functions (valores de teste)
printf 'CLICKSIGN_TOKEN=token-teste\nCLICKSIGN_HMAC_SECRET=hmac-teste\nWEBHOOK_SIGNING_KEY=chave-webhook-teste\nAPS_CLIENT_ID=\nAPS_CLIENT_SECRET=\n' > functions/.secret.local
printf 'CLICKSIGN_BASE_URL=http://127.0.0.1:4180\nAPS_BUCKET=\n' > functions/.env.local
node scripts/sync-shared.mjs && npm --prefix functions run build

# 2. emuladores (deixe rodando em outro terminal)
npm run emuladores

# 3. backend: RBAC, upload→versão→quantitativos, auditoria, webhook, assinatura, alertas
npm run test:e2e:backend

# 4. interface: compile apontando para os emuladores, sirva em :4173 e rode
NEXT_PUBLIC_FIREBASE_API_KEY=demo NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-aec \
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-aec.appspot.com NEXT_PUBLIC_USE_EMULATORS=1 npm run build
npx serve out -l 4173 &
npm run test:e2e:ui
```

O teste de interface espera a base SINAPI-BA no catálogo de preços (o padrão público serve).
Os provedores externos (Clicksign e o destino do webhook) são simulados por servidores locais
dentro dos próprios testes.

Limite do emulador: o gatilho de auditoria recebe um autor fictício, então o `uid` real no log
só pode ser conferido em um projeto Firebase de verdade.

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
│  │  ├─ import/               importador universal: ifc, redes (.inp), landxml, tabelas, exemplos
│  │  ├─ obratop/              esquemas.ts (15 módulos) · vendor/ (cálculos originais do ObraTop)
│  │  ├─ composicoes/          motor.ts (Quantifik), tabelas.ts, fonte.ts (SINAPI e ORSE analíticos)
│  │  ├─ orcamento/            analitico.ts (vínculos, busca, cálculo) · bases.ts (catálogo de preços)
│  │  ├─ urbanismo/quadro.ts   quadro de áreas de loteamento
│  │  ├─ briefing/scope.ts     briefing → escopo e entregáveis
│  │  ├─ contracts/template.ts variáveis e cláusulas condicionais
│  │  ├─ signature/hash.ts     SHA-256 e envelope de assinatura
│  │  └─ rbac.ts · format.ts · demo-data.ts · firebase/client.ts
│  ├─ hooks/                   use-auth (claims), use-colecao (onSnapshot), use-workspace
│  ├─ components/              ui/ · layout/ · dashboard/ · budget/ · cad/ · contracts/
│  └─ app/(app)/               dashboard · briefing · cad · quantitativos · composicoes · orcamento · contratos · gestao
├─ tests/core.test.ts · tests/importacao.test.ts · tests/rules/firestore.rules.test.ts
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
 ├─ works, activities, measurements, budgets, finance, contracts, orders, inventory, suppliers,
 │  dailyLogs, quality, safety, staff, equipment, documents     módulos de obra (campos do ObraTop)
 ├─ cotacoes/{id}                          numero, cliente, obra, bdi, itens[] (serviço, quantidade, medidas)
 ├─ config/composicoes                     BDI, regime, horas, encargos, pisos, preços digitados
 ├─ vinculos/{id}                          chave do item, fonte, codigo, fator, estado=confirmado
 ├─ notifications/{id}                     tipo, titulo, mensagem, lidaPor[], destinatarios[]
 ├─ auditLogs/{id}                         acao, recurso, caminho, uid, antes, depois, em   (imutável)
 └─ projects/{projectId}                   codigo, nome, tipologia, status, disciplinas[], prazos, clienteUids[]
     ├─ briefings/{id}                     entradas + escopo gerado
     ├─ files/{fileId}                     nome, disciplina, revisaoAtual, totalRevisoes
     │   └─ versions/{R00|R01|…}           storagePath, sha256, qtoStatus, qto        (imutável)
     ├─ quantities/{arquivo}               formato, itens[], avisos, resumo, revisao
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

## Importação universal e orçamento analítico

Tela **BIM & Orçamento analítico** (`/quantitativos`). Todo arquivo vira uma lista de itens no mesmo
modelo (`src/lib/import/modelo.ts`), gravada em `projects/{id}/quantities/{arquivo}`.

| Formato | Origem típica | O que é extraído |
|---|---|---|
| `.ifc` (IFC2x3 / IFC4) | Revit, Archicad, Tekla, TQS, Eberick, QiBuilder | Elementos por classe e tipo; comprimento, área, volume e peso das *Base Quantities* |
| `.dxf` | AutoCAD, BricsCAD, ZWCAD, QGIS | Áreas, perímetros e comprimentos por camada; contagem de blocos |
| `.xml` / `.landxml` | Civil 3D, TopoGRAPH, OpenRoads, estações totais | Lotes, eixos, superfícies, redes de tubos, poços, corte/aterro |
| `.inp` EPANET | EPANET, QWater, WaterGEMS, UFC | Rede de água por diâmetro, válvulas, reservatórios, bombas |
| `.inp` SWMM | SWMM, QEsg, SewerGEMS | Coletores por diâmetro, PVs por profundidade, sub-bacias |
| `.csv` / `.txt` de pontos | Estação total, GNSS | Área levantada, pontos, cadastro por código |
| `.csv` de volumes | Civil 3D | Corte, aterro, bota-fora/empréstimo |
| `.csv` de quantitativos | Tabelas de qualquer software | Descrição, unidade, quantidade e código de composição |

Formatos nativos binários (`.rvt`, `.pln`, `.nwd`, `.dwg`, `.xlsx`) não são lidos: a tela informa
qual exportação fazer em cada caso.

**Preços.** As bases vêm do catálogo público `obratop-bases` (SINAPI, SICRO 3 e ORSE por UF, mês e
regime), configurável em `NEXT_PUBLIC_BASES_CATALOG_URL`.

**Vínculos.** Cada item é ligado a uma composição por um vínculo, resolvido nesta ordem: vínculo já
confirmado pelo escritório → código que veio na planilha → sugestão por semelhança de texto. Sugestões
**não entram no preço** até um orçamentista confirmar; confirmado uma vez, o vínculo vale para todos
os projetos. Números da descrição (DN, espessura, fck) são obrigatórios na busca.

**Tempo real.** A tela assina `quantities` e `vinculos` com `onSnapshot`: uma nova revisão enviada
(pela tela, pelo `sync-cad.ps1` ou por um colega) recalcula o orçamento de todos na hora.

## Fluxo integrado

Os três aplicativos de origem agora se alimentam (`src/lib/obratop/integracao.ts`):

```
Cotação (Serviços & Cotações) ─┐
                               ├─► Orçamento da obra ─► Cronograma ─► Gantt, linha de base,
Orçamento analítico (BIM/CAD) ─┘   (Gestão de obras)    gerado         medições, relatório
```

- **Enviar ao orçamento da obra:** cada serviço da cotação, ou cada linha confirmada do orçamento
  analítico, vira um item do orçamento da obra com custo unitário, BDI e, no caso da cotação, a
  composição de insumos.
- **Gerar cronograma:** usa o algoritmo original do ObraTop (`scheduleBudget`). As categorias do
  orçamento viram etapas; a duração de cada atividade é proporcional às horas de mão de obra da
  composição (ou ao custo, quando não há composição), ajustada ao prazo da obra. Como cada
  atividade nasce ligada ao seu item de orçamento, o avanço ponderado passa a usar o custo.
- **Sem duplicar:** os ids são determinísticos. Reenviar a cotação ou gerar o cronograma de novo
  atualiza os mesmos registros e preserva avanços já lançados; atividades cadastradas à mão não
  são tocadas.
- **Painel inicial:** mostra o avanço planejado × realizado das obras em execução.

## Gestão de obras (ObraTop integrado)

Tela `/gestao`. Traz os 15 módulos do ObraTop 3.39.13.0: obras, medições, diário de obra,
equipamentos, orçamentos, cronograma, fornecedores, compras, estoque, financeiro, contratos,
qualidade, segurança, pessoal e documentos.

- **Guiado por esquema.** `src/lib/obratop/esquemas.ts` é a cópia literal do `schemas` do
  ObraTop; uma única tela desenha tabela, filtros e formulário de cada módulo a partir dele.
- **Cálculos originais.** `src/lib/obratop/vendor/` contém os módulos puros do ObraTop sem
  nenhuma alteração (`calc`, `msproject`, `orcamento`, `economics`, `bases`). Medição líquida,
  saldo de contrato, avanço ponderado, valor agregado (IDP/IDC), fluxo de caixa projetado,
  caminho crítico e leitura/escrita do XML do MS Project vêm deles. `npm run test:obratop`
  roda os testes do próprio ObraTop contra essas cópias.
- **Mesmos dados.** Os registros ficam em `tenants/{t}/{coleção}` com os mesmos nomes de coleção
  e de campo do ObraTop (`organizations/{org}/{coleção}`), inclusive a exclusão lógica (`deleted`).
- **Migração.** `scripts/migrar-obratop.mjs` copia uma organização do ObraTop para um tenant,
  preservando ids e referências. Sem `--gravar` é só simulação; a origem nunca é alterada; nada
  é sobrescrito sem `--sobrescrever`; pode ser repetida. `npm run test:migracao` testa no emulador.

- **Linha de base.** Congelar e replanejar gravam `baseline` e `baselineHistory` na obra, no
  mesmo formato do ObraTop; o avanço planejado e o Gantt passam a comparar com ela.
- **Documentos com anexo:** arquivo de até 10 MB no Storage, com os mesmos campos do ObraTop
  (`fileUrl`, `fileName`, `storagePath`).
- **Relatório da obra em PDF:** desempenho, cronograma com folgas e caminho crítico, medições,
  contratos e fluxo de caixa projetado.

Ainda não trazido do ObraTop: convites e membros (a plataforma usa papéis próprios), restrição
de usuário por obra, pontos de restauração, orçamento com composições próprias (`orcamento-ui`), análise econômica
(`economics-ui`), modelos de obra, os demais relatórios em PDF, manual
e a interface própria para celular. "Obras" (execução) e "projetos" (escritório de projeto) são
cadastros separados, ainda sem vínculo entre si.

## Serviços & Cotações (Quantifik integrado)

Tela `/composicoes`. É o Quantifik dentro da plataforma, com o mesmo cálculo:

- **Consulta de serviços** por atividade, código ou descrição, em SINAPI-BA e ORSE-SE.
- **Quantitativo por medidas** (comprimento × largura × altura × profundidade × peças) e consumo
  de cada insumo, com composições auxiliares abertas ou não.
- **Preços:** mão de obra horista pelo piso do Sinduscon-BA (piso ÷ horas × encargos) mais os
  encargos complementares da função no SINAPI; insumos pelo preço mediano; composições
  auxiliares recalculadas; preço digitado tem prioridade. BDI e regime de desoneração.
- **Cotações por cliente** com numeração anual, BDI próprio, PDF A4 com timbre do escritório,
  resumo por natureza de custo e composição de custos opcional. Exporta e importa em arquivo
  (inclusive a cópia de segurança do Quantifik).

Diferenças em relação ao Quantifik: cotações e parâmetros ficam no escritório (`cotacoes` e
`config/composicoes` no Firestore), não no navegador de cada pessoa; o ORSE vem pronto do
catálogo de bases, sem importação manual; exige login e conexão (não funciona offline); a
importação de uma base própria por planilha ainda não foi trazida.

**Dados.** O SINAPI analítico é lido do `index.html` do Quantifik (o mesmo bloco que o robô
regrava todo mês), configurável em `NEXT_PUBLIC_QUANTIFIK_DATA_URL`.

**Paridade.** `tests/composicoes.test.ts` executa o código original do Quantifik e o motor novo
sobre as mesmas composições e exige insumos, preços e origens idênticos. As tabelas e expressões
(`composicoes/tabelas.ts`) foram copiadas literalmente do original.

## Convenção de camadas para o QTO

Desenhe uma polilinha fechada por ambiente nas camadas abaixo e o quadro de áreas do orçamento é
preenchido automaticamente (regras em `REGRAS_CAMADAS_PADRAO`, customizáveis):

`A-AREA-PRIV` · `A-AREA-GARAGEM` · `A-AREA-VARANDA` · `A-AREA-TERRACO` · `A-AREA-PISCINA` ·
`A-AREA-JARDIM` · `A-AREA-ESTAC`

## Limites conhecidos

- **CUB:** o repositório não traz valores oficiais. As tabelas do modo demo e `data/cub-modelo.csv`
  são ilustrativas; importe a planilha do Sinduscon do seu estado todo mês.
- **IFC do Revit:** o exportador grava quantidades repetidas e, às vezes, em mm²/mm³; o leitor
  normaliza e avisa. Quando o próprio modelo traz área líquida maior que a bruta, o leitor só
  avisa — não há como saber qual valor é o certo.
- **Sugestões de composição:** vêm de semelhança de texto e erram com frequência em serviços
  parecidos (tubo predial × rede coletora, fornecimento × assentamento). Por isso ficam fora do
  total até serem confirmadas. Itens como "nó de rede" ou "área de parcelas" não têm composição
  direta e servem de conferência.
- **IFC:** lê quantidades gravadas no modelo, não calcula geometria. Sem *Base Quantities* só há
  contagem. Arquivos muito grandes (centenas de MB) são lidos inteiros em memória.
- **Pontos topográficos:** a área é a da envoltória convexa, que superestima perímetros côncavos.
- **Quadro urbanístico** (`urbanismo/quadro.ts`): motor pronto e testado, ainda sem tela.
- **Portal do Cliente:** o cliente vê o andamento dos próprios projetos; aprovar orçamento e ver
  contratos pela interface ainda não existe (as regras já permitem).
- **DWG:** é binário proprietário. A plataforma armazena e versiona; os quantitativos saem do DXF
  (`sync-cad.ps1 -ConverterDxf` gera via AutoCAD) ou da conversão APS, que exige credenciais Autodesk.
- **Visualizador:** Canvas 2D do model space (linhas, polilinhas, arcos, círculos, elipses,
  hachuras, textos; blocos aparecem como marcadores). Sem 3D.
- **Assinatura:** integração implementada para Clicksign (API v1). DocuSign e Gov.br estão previstos
  no tipo `ProvedorAssinatura`, sem adaptador.
- **Modelo de contrato:** ponto de partida; precisa de revisão jurídica do escritório.
