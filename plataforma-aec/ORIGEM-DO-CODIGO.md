# Origem do código do ObraTop 4

O ObraTop 4 reúne trechos de dois softwares do mesmo autor — **ObraTop 3** e **Quantifik** — e
código novo. Este documento diz, arquivo por arquivo, de onde veio cada parte, para que contratos
de licença, de entrega de código-fonte ou de cessão de direitos possam dizer com precisão o que
incluem e o que fica de fora.

Autoria: Eng. Civil Raydem Rabello Santana — © 2026, todos os direitos reservados (Leis 9.609/1998
e 9.610/1998). O teste `tests/origem.test.ts` confere que todos os caminhos citados existem e que
as cópias declaradas idênticas continuam idênticas (SHA-256).

Proporção aproximada do código-fonte (bytes de `src/` e `functions/src/`): **~13%** copiado do
ObraTop 3, **~4%** derivado do Quantifik e **~83%** escrito para o ObraTop 4.

## 1. Copiado do ObraTop 3

Módulos de cálculo do ObraTop 3 (`app/public/*.mjs`, versão 3.39), sem acesso a tela ou banco.

| Arquivo no ObraTop 4 | Original no ObraTop 3 | Situação | SHA-256 (16 primeiros) |
| --- | --- | --- | --- |
| `src/lib/obratop/vendor/calc.mjs` | `calc.mjs` — avanço, IDP/IDC, caixa, contratos, medições | cópia idêntica | `a34196e2a7f84365` |
| `src/lib/obratop/vendor/msproject.mjs` | `msproject.mjs` — predecessoras, caminho crítico, XML MS Project, revisão da EAP | cópia idêntica | `8e2de931ed846c3e` |
| `src/lib/obratop/vendor/orcamento.mjs` | `orcamento.mjs` — planilha orçamentária, ABC, cronograma do orçamento | cópia idêntica | `8467fa396976ebeb` |
| `src/lib/obratop/vendor/economics.mjs` | `economics.mjs` — análise econômica e reajuste | cópia idêntica | `3b6b1bd0dac512b4` |
| `src/lib/obratop/vendor/templates.mjs` | `templates.mjs` — modelos de obra (dados ilustrativos) | cópia idêntica | `e235df61612db8c7` |
| `src/lib/obratop/vendor/branding.mjs` | `branding.mjs` — logotipo e cabeçalho de PDF | cópia idêntica | `882e4b0bd632bfb1` |
| `src/lib/obratop/vendor/bases.mjs` | `bases.mjs` — leitura de bases de preços e busca | cópia com melhoria (busca por início de palavra) | — |
| `src/lib/obratop/esquemas.ts` | `const schemas` de `app.js` — campos dos 15 cadastros | campos copiados literalmente, em TypeScript | — |
| `regras/obratop-base.firestore.rules` | regras do Firestore do ObraTop 3.39.13 | cópia (base das regras publicadas) | `d2a712c93bdc466b` |
| `regras/obratop-base.storage.rules` | regras do Storage do ObraTop 3.39.13 | cópia | `269e7e25241fb766` |
| `public/ObraTop_Super_Planilha_Base.xlsx` | planilha modelo da Super Planilha | cópia | `4e189dfde88c66c7` |
| `tests/obratop-original/` | testes originais dos módulos acima | cópia | — |

Também vêm do ObraTop 3, **reescritos em código novo** (mesmas regras de negócio, implementação
própria do ObraTop 4): alertas e integridade (`src/lib/obratop/controle.ts`), formato da Super
Planilha (`src/lib/obratop/planilha.ts`), funções e permissões (`src/lib/obratop/permissoes.ts`),
ligações entre cadastros (`src/lib/obratop/fluxos.ts`), formato de empresa, membros e convites
(`src/lib/obratop/empresa.ts`) e o texto de Direitos Autorais (`src/app/legal/page.tsx`).

## 2. Derivado do Quantifik

| Arquivo no ObraTop 4 | Origem no Quantifik (`index.html`) | Situação |
| --- | --- | --- |
| `src/lib/composicoes/tabelas.ts` | tabelas e expressões de cálculo | cópia literal (arquivo gerado) |
| `src/lib/composicoes/motor.ts` | cálculo de composições, medidas, regimes com e sem desoneração | reescrito em TypeScript com paridade exata (612 composições, 7.406 linhas de insumo) |
| `src/lib/composicoes/fonte.ts` | leitura dos dados embutidos do SINAPI e do ORSE | reescrito |
| `src/lib/composicoes/importar-precos.ts` | tabela de preços própria (CSV, colar, Excel) | reescrito e ampliado |

## 3. Dados públicos (não são código)

| Pasta | Conteúdo | Origem |
| --- | --- | --- |
| `public/bases/` | SINAPI, SICRO e ORSE do mês, catálogo e SINAPI-BA analítico | Dados públicos (Caixa, DNIT, CEHOP-SE), coletados pelos robôs mensais dos repositórios obratop-bases e Quantifik e copiados por `npm run bases:atualizar` |

O ObraTop 4 serve essas bases pelo próprio endereço: não depende de nenhum outro repositório para
funcionar. Para levar o mês novo, rode `npm run bases:atualizar` antes de publicar (o instalador já
faz isso; sem internet, publica a cópia que está na pasta).

## 4. Escrito para o ObraTop 4

Todo o restante: a interface completa (`src/app/`, `src/components/`), Portal do Cliente, fotos do
diário, BIM/CAD/IFC e quantitativos (`src/lib/cad/`, `src/lib/import/`, `src/lib/orcamento/`),
CUB e orçamento paramétrico (`src/lib/cub/`), briefing, contratos e assinatura
(`src/lib/briefing/`, `src/lib/contracts/`, `src/lib/signature/`), integrações bancárias, fiscais e
eSocial (`src/lib/integracoes/`), urbanismo, relatórios, licenças da plataforma, backup, auditoria,
funções do servidor (`functions/`), extensão das regras de segurança (`regras/extensao-org.firestore.rules`, `regras/extensao-raiz.firestore.rules`, `regras/extensao.storage.rules`),
instalador e publicação (`scripts/`), manual (`manual/`) e testes (`tests/`, exceto
`tests/obratop-original/`).

## 5. Banco de dados compartilhado

Na instalação do autor, o ObraTop 4 usa o mesmo projeto Firebase e o mesmo formato de dados do
ObraTop 3 (empresas, usuários e cadastros), o que permite usar os dois ao mesmo tempo. Isso é
configuração da instalação, não dependência de código: num projeto Firebase novo, o instalador
publica o ObraTop 4 sozinho, com a cópia das regras do item 1.
