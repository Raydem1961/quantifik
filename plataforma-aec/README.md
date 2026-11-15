# ObraTop 4 — gestão de obras, projetos e orçamento

Nova versão do ObraTop. Usa **os mesmos dados e os mesmos usuários** do ObraTop 3
(`organizations/{org}/…`, `members`, `invites`) e acrescenta, em um layout por áreas:
projetos e briefing, CAD/BIM com versões, quantitativos de qualquer software de engenharia,
orçamento pelo CUB (NBR 12721), composições SINAPI/ORSE e cotações (Quantifik), contratos com
assinatura digital, conciliação bancária, Pix, notas fiscais de compra e conferência para o eSocial.

Next.js 14 (exportação estática) + TypeScript + Tailwind · Firebase (Auth, Firestore, Storage,
Functions) · funciona instalado no celular e sem internet.

## Instalar sem programar

`INSTALAR.cmd` (dois cliques, Windows) ou `npm run instalar`. Passo a passo em `LEIA-ME.txt`.
O instalador localiza a chave de acesso, guarda cópia das regras que estão no ar, mantém as
regras do ObraTop e acrescenta as dos módulos novos, publica em **endereço próprio** (o ObraTop
atual continua no ar) e autoriza o endereço para login. Pode ser repetido; nada é duplicado.
Em servidor/CI: `FIREBASE_SERVICE_ACCOUNT_JSON='<conteúdo da chave>' npm run instalar -- --sim`.

## Áreas do aplicativo

| Área | Telas |
|---|---|
| Comercial | Briefing · Cotações · Propostas e contratos |
| Engenharia e Arquitetura | Projetos (Kanban, Gantt, ART/RRT, horas) · CAD e revisões · BIM e quantitativos |
| Orçamento | Serviços e composições · Orçamento pelo CUB · Orçamento da obra · Orçamento analítico |
| Planejamento e Obras | Obras · Cronograma (Gantt, caminho crítico, linha de base, MS Project) · Diário · Medições |
| Suprimentos | Compras · Estoque · Fornecedores · Equipamentos |
| Financeiro | Lançamentos · Contratos de obra · Bancos e Pix · Notas fiscais e CNPJ |
| Recursos Humanos | Pessoal · Horas técnicas · eSocial |
| Qualidade e Segurança | Qualidade · Segurança do trabalho · Documentos |
| Fiscal e Integrações | Bancos e Pix · Notas fiscais e CNPJ · eSocial |
| Administrativo | Empresa e equipe (convites, obra e perfil de cada pessoa) · Documentos |

Início com saudação, números de cada área, central de pendências, avanço das obras e fluxo de
caixa; busca rápida com **Ctrl+K**; tema claro e escuro; menu em gaveta no celular.
O mapa das áreas fica em `src/lib/modulos.ts`; os indicadores, em `src/lib/indicadores.ts`.

## Dados, usuários e segurança

- **Empresa e pessoas**: `organizations/{org}` (campos novos em `aec`), `members/{uid}`
  (`owner` ou `project_user` com `workId`), `invites/{code}`, `users/{uid}.currentOrg` —
  exatamente como o ObraTop 3. Proprietário grava tudo; usuário de obra grava só na sua obra,
  não cria obras nem fornecedores e não exclui (exclusão é lógica: `deleted: true`).
- **Perfis dos módulos novos** (Coordenador, Orçamentista, Projetista):
  `organizations/{org}/perfis/{uid}`, que só o proprietário grava — ninguém se promove.
- **Regras** = regras do ObraTop + extensão. `regras/obratop-base.*` é a cópia das regras do
  ObraTop 3.39.13; `regras/extensao-*.rules` são os módulos novos; `npm run regras:gerar`
  produz `firestore.rules` e `storage.rules`. Na publicação, a base é **o que está no ar**
  (`regrasParaPublicar`), então nenhuma regra do ObraTop se perde.
- **Functions** (`functions/src`): versão e quantitativos a cada upload de CAD, trilha de
  auditoria imutável, notificações com webhook assinado (HMAC), assinatura digital (Clicksign),
  alertas diários de ART/RRT. Exigem o plano Blaze.

## Integrações (Fiscal e Integrações)

| Tela | O que funciona hoje | O que depende da empresa |
|---|---|---|
| Bancos e Pix | Extrato OFX → conciliação com o financeiro (baixa com data e referência do banco, sem duplicar); lançamento do que não tem par; Pix copia e cola + QR Code (BR Code estático, CRC conferido) | Extrato automático e boletos: contrato de API com o banco e certificado |
| Notas fiscais e CNPJ | XML de NF-e (modelo 55) → fornecedor + contas a pagar pelas duplicatas (idempotente); validação da chave; consulta pública de CNPJ | Emissão de NF-e/NFS-e, busca na SEFAZ e manifestação: certificado e-CNPJ A1 e serviço emissor |
| eSocial | Conferência dos dados de admissão (CPF, CBO, datas, salário) e planilha para a contabilidade | Transmissão dos eventos: certificado digital, pelo sistema de folha |

Os arquivos são lidos no navegador; nada é enviado a terceiros (exceto a consulta de CNPJ, à BrasilAPI).

## Desenvolvimento

```bash
npm install && npm --prefix functions install
npm run dev            # sem .env.local abre em modo demonstração (dados fictícios em memória)
npm run build          # exportação estática em out/ + service worker
```

## Testes

```bash
npm run typecheck && npm run lint
npm test                  # 80 testes de unidade (motores de cálculo, importadores, integrações, instalador)
npm run test:obratop      # testes originais dos módulos de cálculo do ObraTop (34)
npm run test:rules        # 20 testes das regras de segurança no emulador
npm run test:instalador   # reconhecimento do ObraTop existente (4)

# ponta a ponta, com o Firebase Emulator Suite
printf 'CLICKSIGN_TOKEN=token-teste\nCLICKSIGN_HMAC_SECRET=hmac-teste\nWEBHOOK_SIGNING_KEY=chave-webhook-teste\nAPS_CLIENT_ID=\nAPS_CLIENT_SECRET=\n' > functions/.secret.local
printf 'CLICKSIGN_BASE_URL=http://127.0.0.1:4180\nAPS_BUCKET=\n' > functions/.env.local
node scripts/sync-shared.mjs && npm --prefix functions run build
npm run emuladores &      # deixe rodando
npm run test:e2e:backend  # 45: papéis, upload→versão→quantitativos, auditoria, webhook, assinatura, alertas
NEXT_PUBLIC_FIREBASE_API_KEY=demo NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-aec \
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-aec.appspot.com NEXT_PUBLIC_USE_EMULATORS=1 npm run build
npx serve out -l 4173 &
npm run test:e2e:ui           # 73: todas as áreas, convite → conta → empresa, papéis
npm run test:e2e:integracoes  # 21: OFX, Pix, NF-e, CNPJ (resposta simulada), eSocial
npm run test:e2e:offline      # 5: lançar sem internet e sincronizar
```

Clicksign, o destino do webhook e a consulta de CNPJ são simulados por servidores locais nos testes.

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
- **Mesmos dados.** Os registros ficam em `organizations/{org}/{coleção}`, com os mesmos nomes de
  coleção e de campo do ObraTop 3, inclusive a exclusão lógica (`deleted`). Não há migração nem
  cópia: os dois aplicativos leem e gravam os mesmos documentos.

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

- **Nada foi publicado no Firebase real por este repositório**: os testes rodam no emulador.
  A publicação é feita pelo instalador, com a chave do dono do projeto.
- Não verificados em ambiente real: Clicksign e Autodesk APS (conversão de DWG) com credenciais
  de produção; scripts PowerShell (`scripts/*.ps1`); `INSTALAR.cmd` em Windows.
- No emulador, o autor gravado na trilha de auditoria é fictício (limitação do emulador).
- Sugestões automáticas de composição não entram no total até serem confirmadas.
- Ainda não trazidos do ObraTop 3: análise econômica, modelos de obra, pontos de restauração e
  parte dos relatórios em PDF. O ObraTop 3 continua no ar e usa os mesmos dados.
- Transmissão oficial (SEFAZ, eSocial, API bancária) depende de certificado digital e contratos.
