/**
 * Gera o Manual do ObraTop 4 (PDF ilustrado) a partir das capturas de tela.
 *   node manual/gerar-manual.cjs <pasta-das-imagens> <saida.pdf>
 * As imagens são produzidas com o aplicativo em modo demonstração (ver README).
 */
const fs = require('node:fs'); const path = require('node:path'); const { chromium } = require('playwright');
const [IMG, SAIDA] = process.argv.slice(2);
const img = (n) => `data:image/jpeg;base64,${fs.readFileSync(path.join(IMG, `${n}.jpg`)).toString('base64')}`;
const AREAS = { geral: '#3b4cca', comercial: '#7c3aed', engenharia: '#2563eb', orcamento: '#0d9488', planejamento: '#d97706', suprimentos: '#db2777', financeiro: '#16a34a', rh: '#a21caf', qualidade: '#a16207', integracoes: '#0891b2', administrativo: '#1d4ed8' };

/** Cada item: [área, título, para que serve, imagem, passos[], observações[]] */
const CAP = [
['geral', 'Primeiros passos', null, null, null, null, 'parte'],
['geral', 'Entrar no aplicativo', 'O ObraTop 4 usa os mesmos usuários do ObraTop anterior. Quem já tinha acesso entra com o mesmo e-mail e a mesma senha.', '01-login',
  ['Abra o endereço do aplicativo no navegador (Chrome ou Edge).', 'Digite seu <b>E-mail</b> e sua <b>Senha</b> e clique em <b>Entrar</b>. Também é possível usar <b>Continuar com Google</b>.', 'Esqueceu a senha? Digite o e-mail e clique em <b>Esqueci minha senha</b>: chega um link para criar outra.', 'Primeira vez e sem convite? Clique em <b>Criar conta</b>, informe nome, e-mail e senha. Na tela seguinte escolha <b>Criar minha empresa</b> (você vira o proprietário) ou <b>Tenho um convite</b>.'],
  ['Quem recebeu um link de convite deve abrir o link: a tela já vem em "Criar conta" e o código do convite é preenchido sozinho depois do cadastro.', 'No celular, use o menu do navegador → "Adicionar à tela inicial" para instalar o ObraTop como aplicativo.']],
['geral', 'Tela Início', 'É o painel da empresa: mostra o que precisa de atenção hoje e dá acesso a todas as áreas.', '02-inicio',
  ['No alto, a saudação resume o dia: pontos de atenção, obras em andamento e projetos ativos.', 'Em <b>Áreas</b>, cada cartão é um setor da empresa com o seu número principal. Um círculo vermelho indica quantas pendências a área tem. Clique no cartão para abrir a área.', 'A <b>Central de pendências</b> lista, do mais grave para o menos grave, o que pede decisão: obra atrasada, caixa negativo previsto, conta vencida, estoque abaixo do mínimo, não conformidade crítica, documento vencendo, manutenção e medição aguardando aprovação. Clique na linha para ir direto à tela.', '<b>Obras em andamento</b> compara o realizado (barra) com o planejado para hoje (marca vertical). Barra vermelha = mais de 5 pontos de atraso.', '<b>Fluxo de caixa projetado</b> (só o proprietário vê) mostra entradas e saídas dos próximos seis meses e o saldo acumulado embaixo de cada mês.'],
  ['Tudo é atualizado em tempo real: se um colega lançar algo, o número muda na sua tela sem recarregar.']],
['geral', 'Menu, busca rápida e tema', 'Como se movimentar pelo aplicativo.', '03-busca',
  ['A <b>faixa de ícones</b> à esquerda tem uma área por ícone (passe o mouse para ver o nome). O primeiro ícone volta ao Início.', 'Ao abrir uma área, aparece ao lado a <b>lista de telas</b> daquela área.', 'No alto, o caminho (por exemplo <i>Financeiro › Lançamentos</i>) mostra onde você está; clique no nome da área para voltar à página dela.', '<b>Busca rápida:</b> aperte <b>Ctrl + K</b> (ou clique em "Buscar tela, obra ou projeto…"), digite parte do nome e aperte <b>Enter</b>. Use as setas para escolher.', 'O <b>sino</b> mostra as notificações (arquivo CAD atualizado, orçamento aprovado, contrato assinado, ART vencendo). Clique em uma para marcar como lida.', 'O ícone de <b>lua/sol</b> alterna entre tema claro e escuro. O ícone de <b>porta</b> sai da conta.'],
  []],
['geral', 'Páginas de área', 'Cada área tem uma página-resumo com quatro indicadores, as telas disponíveis e o que precisa de atenção.', '04-area',
  ['Clique no ícone da área no menu (ou no cartão do Início).', 'Leia os <b>quatro indicadores</b> do topo. Um triângulo vermelho indica alerta.', 'Em <b>Telas desta área</b>, clique no cartão da tela que deseja abrir.', 'Abaixo ficam o gráfico da área (avanço das obras ou fluxo de caixa) e <b>Precisa de atenção</b>, com as pendências só daquela área.'],
  []],
['geral', 'No celular e no tema escuro', 'O aplicativo se adapta à tela do celular e funciona sem internet para consulta e lançamentos.', ['37-celular', '38-celular-menu', '36-escuro'],
  ['No celular, toque no ícone de <b>três linhas</b> (canto superior esquerdo) para abrir o menu.', 'Toque no ícone da área e depois na tela desejada.', '<b>Sem internet:</b> as telas já abertas antes continuam funcionando. O que você lançar fica guardado no aparelho e é enviado sozinho quando a conexão voltar.'],
  ['Para funcionar sem internet, abra o aplicativo pelo menos uma vez com conexão em cada aparelho.']],

['comercial', 'Comercial', null, null, null, null, 'parte'],
['comercial', 'Briefing', 'Registra o que o cliente quer e transforma em escopo técnico e lista de entregáveis. Ao salvar, cria o projeto.', '07-briefing',
  ['Abra <b>Comercial → Briefing</b>.', 'Em <b>Identificação</b>, preencha <b>Nome do projeto</b>, <b>Cliente</b>, <b>Município</b>, <b>UF</b> e escolha a <b>Tipologia</b> (residencial, comercial, condomínio, loteamento, infraestrutura viária, topografia, saneamento, rede de água…).', 'Preencha <b>Terreno e restrições legais</b> (áreas, pavimentos, taxa de ocupação, coeficiente de aproveitamento, topografia) e o <b>Programa de necessidades</b>.', 'Acompanhe à direita o <b>Escopo técnico</b> e os <b>Entregáveis iniciais</b>: eles mudam conforme a tipologia e as respostas.', 'Clique em <b>Criar projeto</b>. O projeto aparece em <i>Engenharia e Arquitetura → Projetos</i>, na coluna "Briefing".'],
  ['Quem pode: proprietário e coordenador.']],
['comercial', 'Serviços e composições', 'Consulta as composições do SINAPI-BA e do ORSE-SE e calcula materiais, mão de obra e preço de um serviço a partir das medidas.', '10-servicos',
  ['Abra <b>Comercial → Cotações</b> (ou <b>Orçamento → Serviços e composições</b>), aba <b>Serviços</b>.', 'Escolha a <b>Base</b> e, se quiser, a <b>Atividade</b>. Em <b>Buscar por código ou descrição</b>, digite parte do nome (ex.: "alvenaria bloco cerâmico 14").', 'Clique no serviço na lista.', 'Informe as medidas (<b>Comprimento</b>, <b>Largura</b>, <b>Altura</b>, <b>Profundidade</b>, <b>Quantidade</b>). O aplicativo calcula o quantitativo na unidade do serviço e mostra insumos, horas e custo.', 'Clique em <b>Adicionar à cotação</b>.'],
  ['Na aba <b>Parâmetros</b> ficam o <b>BDI (%)</b>, os pisos salariais e os encargos. Valem para toda a equipe.', 'A opção "Abrir composições auxiliares em insumos" detalha argamassas e concretos nos materiais que os compõem.']],
['comercial', 'Cotações', 'Junta serviços em uma cotação numerada por cliente, gera o PDF e leva os itens para o orçamento de uma obra.', '11-cotacoes',
  ['Na aba <b>Cotações</b>, preencha <b>Cliente</b>, <b>Obra / local</b>, <b>Validade (dias)</b> e o <b>BDI desta cotação (%)</b>.', 'À direita ficam os <b>Serviços da cotação</b>, com o total e a divisão em mão de obra, materiais e equipamentos. A lixeira remove um serviço.', 'Clique em <b>Baixar PDF</b> para gerar a cotação com o timbre da empresa.', 'Para transformar a cotação em orçamento de obra: escolha a obra em <b>Levar esta cotação para o orçamento de uma obra</b> e clique em <b>Enviar ao orçamento da obra</b>.', '<b>Nova</b> cria outra cotação; <b>Duplicar</b> copia a atual; <b>Exportar</b>/<b>Importar</b> trocam cotações em arquivo.'],
  ['Enviar a mesma cotação duas vezes não duplica os itens no orçamento da obra: eles são atualizados.']],
['comercial', 'Propostas e contratos', 'Monta o contrato a partir dos dados do projeto, gera o PDF e envia para assinatura digital.', '13-contratos',
  ['Abra <b>Comercial → Propostas e contratos</b> e escolha o <b>Projeto</b>.', 'Preencha <b>CPF/CNPJ do cliente</b>, <b>E-mail do cliente (assinatura)</b> e <b>Nº da ART/RRT</b>. Escolha qual <b>Estimativa de obra</b> entra no documento (CUB ou composições).', 'Confira a <b>Pré-visualização</b>. As cláusulas acompanham as disciplinas contratadas no projeto.', 'Se quiser alterar o texto, edite o <b>Modelo</b>; os campos entre chaves são preenchidos sozinhos. <b>Restaurar modelo padrão</b> desfaz as alterações.', 'Clique em <b>Gerar PDF</b>. O aplicativo mostra o código de integridade (SHA-256) do documento.', 'Clique em <b>Enviar para assinatura</b>. Quando todos assinarem, o contrato passa a "assinado" e você recebe uma notificação.'],
  ['Se mudar qualquer dado depois de gerar o PDF, gere o PDF de novo antes de enviar.', 'O envio para assinatura depende da conta da empresa no provedor de assinatura digital (Clicksign) e do plano Blaze do Firebase.', 'Quem pode: proprietário e coordenador. Contrato assinado não pode ser alterado nem excluído.']],

['engenharia', 'Engenharia e Arquitetura', null, null, null, null, 'parte'],
['engenharia', 'Projetos', 'Carteira de projetos em quadro (Kanban) ou linha do tempo (Gantt), com ART/RRT e horas técnicas.', '05-projetos',
  ['Abra <b>Engenharia e Arquitetura → Projetos</b>.', 'No <b>Kanban</b>, arraste o cartão do projeto para a coluna da etapa atual: Briefing, Estudo preliminar, Anteprojeto, Projeto executivo, Aprovação, Concluído.', 'Clique em <b>Gantt</b> para ver prazos e percentual concluído de cada projeto.', '<b>ART / RRT:</b> acompanhe o que está a emitir e o vencimento. O aplicativo avisa quando faltam 7 dias ou menos.', '<b>Horas técnicas:</b> escolha <b>Projeto</b> e <b>Disciplina</b>, clique em <b>Iniciar</b> ao começar e em <b>Parar e lançar</b> ao terminar. A tabela de margem compara honorários contratados com o custo das horas.'],
  ['O cronômetro continua contando se você fechar ou recarregar a página.', 'A tabela de margem é visível para proprietário e coordenador. O custo da hora é definido em Administrativo → Empresa e equipe.']],
['engenharia', 'CAD e revisões', 'Guarda os desenhos com controle de revisão (R00, R01…), mede áreas por camada e permite marcar correções sobre o desenho.', '08-cad',
  ['Abra <b>Engenharia e Arquitetura → CAD e revisões</b>, escolha o <b>Projeto</b> e a <b>Disciplina</b>.', 'Envie o arquivo (DXF, DWG, IFC e outros). Cada novo envio do mesmo arquivo vira uma nova revisão; as anteriores ficam guardadas.', 'O desenho abre na tela. Use <b>Mover</b>, <b>Aproximar</b>, <b>Afastar</b> e <b>Enquadrar</b>. Os botões com nomes de camadas ligam e desligam cada uma.', 'Em <b>Quantitativos por camada</b> ficam áreas e comprimentos medidos. Confira a <b>Unidade do desenho</b>.', 'Para apontar uma correção, clique em <b>Marcar revisão</b> e desenhe sobre a planta.', 'Clique em <b>Usar no orçamento</b> para levar as áreas ao orçamento pelo CUB.'],
  ['Para o cálculo de áreas, desenhe os contornos como polilinhas fechadas em camadas com os nomes: A-AREA-PRIV (privativa), A-AREA-GARAGEM, A-AREA-VARANDA, A-AREA-JARDIM, A-AREA-PISCINA.', 'Arquivos DWG são guardados e versionados; a medição automática de DWG depende da conta da empresa no serviço da Autodesk. Em DXF funciona direto.']],
['engenharia', 'BIM e quantitativos', 'Importa modelos e projetos de vários programas, extrai os quantitativos e precifica cada item por composições oficiais.', '09-quantitativos',
  ['Abra <b>Engenharia e Arquitetura → BIM e quantitativos</b> e escolha o <b>Projeto</b>, a <b>Base de preços</b> e o <b>BDI (%)</b>.', 'Clique em <b>Importar arquivos</b> e selecione um ou mais arquivos. Aceita IFC (Revit, Archicad, Tekla, TQS, Eberick, QiBuilder), DXF, LandXML (Civil 3D, TopoGRAPH, OpenRoads), EPANET e SWMM (.inp), pontos topográficos e planilhas CSV.', 'A <b>Planilha orçamentária</b> lista os itens por disciplina, com quantidade e a composição sugerida.', 'Itens marcados <b>Sugestão — revisar</b> ainda não entram no total. Clique no <b>✓</b> para confirmar, ou na <b>lupa</b> para buscar outra composição e clicar em <b>Usar</b>.', 'Itens "Sem composição": use a lupa para escolher uma.', 'Quando chegar uma nova revisão do arquivo, as quantidades e o preço são recalculados sozinhos.', 'Clique em <b>Gerar proposta e contrato</b> para levar o valor ao contrato.'],
  ['Arquivos nativos (.rvt, .pln, .dwg de Civil 3D) não são lidos diretamente: exporte em IFC ou LandXML no programa de origem. O aplicativo avisa quando isso acontece.', 'Uma composição confirmada vale para todos os projetos da empresa: da próxima vez, o mesmo item já vem precificado.', '<b>Carregar exemplos</b> traz arquivos de demonstração para conhecer a tela.']],

['orcamento', 'Orçamento', null, null, null, null, 'parte'],
['orcamento', 'Orçamento pelo CUB', 'Estima o custo da obra pela área equivalente (NBR 12721) e o CUB do estado, com BDI, cenários de padrão e Curva S.', '12-cub',
  ['Abra <b>Orçamento → Orçamento pelo CUB</b>.', 'Em <b>Referência</b>, escolha <b>Estado (UF)</b>, <b>Tipo de edificação</b>, <b>Projeto-padrão CUB</b> e o <b>Prazo de obra (meses)</b>.', 'No <b>Quadro de áreas</b>, informe a área real de cada tipo (privativa, garagem, varandas…). Use <b>Adicionar área</b> para incluir linhas. As áreas vindas do CAD já chegam preenchidas.', 'Ajuste o <b>BDI</b>: administração central, seguro e garantia, risco, despesas financeiras, lucro e tributos.', 'Em <b>Itens não inclusos no CUB</b>, acrescente o que o CUB não cobre (fundações especiais, elevadores, urbanização…).', 'O <b>Simulador de cenários</b> compara Popular, Médio, Luxo e Alto Luxo. Clique em um para adotá-lo.', 'A <b>Curva S</b> distribui o desembolso mês a mês.', 'Clique em <b>Salvar no projeto</b> ou em <b>Gerar proposta e contrato</b>.'],
  ['O CUB oficial de cada estado é carregado pela empresa (Sinduscon). Valores marcados como ilustrativos servem só para demonstração.', 'Para loteamentos, redes e infraestrutura, use o orçamento analítico (BIM e quantitativos): o CUB não se aplica.']],
['orcamento', 'Orçamento da obra', 'Itens do orçamento de cada obra, com BDI e preço de venda. É a base do avanço ponderado e do cronograma.', '20-orcamento-obra',
  ['Abra <b>Orçamento → Orçamento da obra</b> e filtre pela obra.', 'Clique em <b>Novo</b> e preencha categoria, descrição, unidade, quantidade, valor unitário e BDI. Clique em <b>Salvar</b>.', 'A coluna <b>Preço de venda</b> já considera o BDI.', 'Com uma obra selecionada, clique em <b>Gerar cronograma</b> para criar as atividades a partir dos itens do orçamento, distribuídas no prazo da obra.'],
  ['Itens vindos de uma cotação ou do orçamento analítico trazem a composição (materiais e horas).', '"Gerar cronograma" não altera atividades que você já cadastrou.']],

['planejamento', 'Planejamento e Obras', null, null, null, null, 'parte'],
['planejamento', 'Obras', 'Cadastro das obras e painel de desempenho de cada uma.', '14-obras',
  ['Abra <b>Planejamento e Obras → Obras</b>.', 'Os cartões do topo mostram, por obra, planejado × realizado, desvio, IDP (prazo), IDC (custo) e estimativa no término.', 'Clique em <b>Relatório PDF</b> no cartão para baixar o relatório gerencial da obra.', 'Use <b>Buscar…</b> para filtrar a tabela. O lápis edita; a lixeira exclui.'],
  ['IDP e IDC abaixo de 1,00 indicam atraso e estouro de custo, respectivamente.', 'Só o proprietário cria e exclui obras.']],
['planejamento', 'Cadastrar ou editar um registro', 'Todas as telas de cadastro (obras, medições, compras, estoque, pessoal…) funcionam do mesmo jeito.', '15-obras-form',
  ['Clique em <b>Novo</b> (ou no <b>lápis</b> da linha para editar).', 'Preencha os campos. Os marcados com <b>*</b> são obrigatórios.', 'Clique em <b>Salvar</b>. Para desistir, <b>Cancelar</b> ou o X.', 'Para excluir, clique na <b>lixeira</b> da linha e confirme.', 'O campo <b>Ir para</b>, no alto à direita, troca de cadastro sem passar pelo menu.'],
  ['A exclusão é lógica: o registro sai das telas, mas fica guardado no banco de dados.', 'Usuário de obra: lança e edita somente na obra a que está atribuído e não exclui.']],
['planejamento', 'Cronograma', 'Atividades da obra em tabela ou Gantt, com caminho crítico, linha de base e troca de arquivos com o MS Project.', '17-cronograma-gantt',
  ['Abra <b>Planejamento e Obras → Cronograma</b> e escolha a obra.', 'Clique em <b>Novo</b> para cadastrar uma atividade: EAP (1.1, 1.2…), nome, início, término, modo de avanço (percentual ou quantidade) e <b>predecessoras</b> (ex.: <i>1.2</i>, <i>2.1SS+10d</i>, <i>3.2FF</i>).', 'Alterne entre <b>Tabela</b> e <b>Gantt</b>. No Gantt: azul claro = planejado, azul escuro = executado, contorno vermelho = caminho crítico; a linha vertical é hoje.', 'Clique em uma barra para atualizar o avanço da atividade.', '<b>Congelar linha de base:</b> guarda o planejamento atual para comparação. Depois, o botão vira <b>Replanejar</b> e a base anterior vai para o histórico.', '<b>MS Project</b> exporta o cronograma em XML; <b>Importar XML</b> traz um cronograma feito no MS Project.'],
  ['O avanço da obra é ponderado pelo orçamento (quando as atividades estão ligadas a itens) ou pela duração.', 'Linha de base: só o proprietário congela e replaneja.']],
['planejamento', 'Diário de obra', 'Registro diário (RDO): clima, equipe, serviços executados e ocorrências.', '18-diario',
  ['Abra <b>Planejamento e Obras → Diário de obra</b> e clique em <b>Novo</b>.', 'Informe <b>Obra</b>, <b>Data</b>, <b>Clima</b>, se o dia foi trabalhável, mão de obra e equipamentos.', 'Descreva os <b>Serviços executados</b> e as <b>Ocorrências e impedimentos</b>.', 'Opcional: indique a atividade principal do dia e o avanço acumulado dela.', 'Em <b>Status</b>, deixe "Rascunho" ou marque "Assinado". <b>Salvar</b>.'],
  ['Pode ser lançado do celular, no canteiro, mesmo sem internet.']],
['planejamento', 'Medições', 'Medições de avanço com retenção e glosa, ligadas ao contrato.', '19-medicoes',
  ['Abra <b>Planejamento e Obras → Medições</b> e clique em <b>Novo</b>.', 'Informe obra, data, número, descrição, avanço físico (%), valor, contrato, retenção (%) e glosa.', 'Defina o <b>Status</b>: Pendente, Aprovada ou Paga.', 'A coluna <b>Líquido</b> mostra o valor a receber depois de retenção e glosa.'],
  ['Medições pendentes aparecem na Central de pendências.', 'O saldo a medir de cada contrato é atualizado em Financeiro → Contratos de obra.']],

['suprimentos', 'Suprimentos', null, null, null, null, 'parte'],
['suprimentos', 'Compras', 'Pedidos de compra, prazos de entrega e aprovação.', '21-compras',
  ['Abra <b>Suprimentos → Compras</b> e clique em <b>Novo</b>.', 'Informe obra, fornecedor, data, prazo de entrega, itens e valor total.', 'Opcional: ligue o pedido a um material do estoque e informe a quantidade.', 'Acompanhe pelo <b>Status</b>: Solicitado, Em cotação, Aguardando aprovação, Aprovado, Entregue, Cancelado.'], []],
['suprimentos', 'Estoque', 'Controle de materiais por obra com mínimo, máximo e ponto de pedido.', '22-estoque',
  ['Abra <b>Suprimentos → Estoque</b> e clique em <b>Novo</b>.', 'Informe material, unidade, estoque atual, mínimo e máximo. Para o ponto de pedido automático, informe consumo médio diário, prazo de reposição e estoque de segurança.', 'Atualize o <b>Estoque atual</b> sempre que houver entrada ou saída.'],
  ['Material abaixo do mínimo aparece na Central de pendências e no indicador da área.']],
['suprimentos', 'Fornecedores', 'Cadastro de fornecedores.', '23-fornecedores',
  ['Abra <b>Suprimentos → Fornecedores</b> e clique em <b>Novo</b>.', 'Informe nome, CNPJ, telefone, e-mail, categoria e status.'],
  ['Atalho: em <i>Fiscal e Integrações → Notas fiscais e CNPJ</i>, a consulta de CNPJ e a importação de nota fiscal cadastram o fornecedor sozinhas.', 'Só o proprietário cadastra e altera fornecedores.']],
['suprimentos', 'Equipamentos', 'Patrimônio, alocação por obra, custo mensal, horímetro e manutenção.', '24-equipamentos',
  ['Abra <b>Suprimentos → Equipamentos</b> e clique em <b>Novo</b>.', 'Informe equipamento, código, obra alocada, custo mensal, horímetro e a data da <b>Próxima manutenção</b>.', 'Atualize o <b>Status</b>: Operacional, Manutenção ou Parado.'],
  ['Manutenção prevista para os próximos 7 dias aparece na Central de pendências.']],

['financeiro', 'Financeiro', null, null, null, null, 'parte'],
['financeiro', 'Visão do Financeiro', 'Saldo realizado, valores a receber e a pagar, saldo de contratos a medir e fluxo de caixa projetado.', '31-area-financeiro',
  ['Clique no ícone do <b>Financeiro</b> no menu.', 'Leia os quatro indicadores. O último avisa se há caixa negativo previsto nos próximos seis meses.', 'No gráfico, passe o mouse (ou toque) em um mês para ver entradas, saídas e saldo.'], []],
['financeiro', 'Lançamentos', 'Receitas e despesas por obra, com vencimento e data de liquidação.', '25-financeiro',
  ['Abra <b>Financeiro → Lançamentos</b> e clique em <b>Novo</b>.', 'Informe obra, competência, vencimento, descrição, tipo (Receita ou Despesa), categoria e valor.', 'Em <b>Status</b>: Previsto, Pendente, Pago, Recebido ou Vencido. Ao pagar ou receber, preencha a <b>Liquidação</b>.', 'Opcional: ligue o lançamento à medição, ao pedido ou ao contrato de origem.'],
  ['Em vez de dar baixa uma a uma, importe o extrato do banco em <i>Bancos e Pix</i>: a baixa é feita sozinha.']],
['financeiro', 'Contratos de obra', 'Contratos com o cliente: valor, aditivos e saldo a medir.', '26-contratos-obra',
  ['Abra <b>Financeiro → Contratos de obra</b> e clique em <b>Novo</b>.', 'Informe obra, número, contratante, objeto, vigência, valor e, se houver, aditivo e sua justificativa.', 'A coluna <b>Saldo a medir</b> desconta as medições já lançadas para o contrato.'], []],
['financeiro', 'Bancos e Pix', 'Concilia o extrato do banco com os lançamentos e gera cobranças por Pix.', '32-bancos',
  ['<b>Conciliação:</b> no internet banking da empresa, exporte o extrato no formato <b>OFX</b> (também chamado "Money").', 'Abra <b>Financeiro → Bancos e Pix</b> e clique em <b>Importar extrato OFX</b>.', 'Cada movimento recebe uma situação: <b>Sugestão</b> (achou um lançamento em aberto de mesmo valor e data próxima), <b>Sem lançamento</b> ou <b>Conciliado</b>.', 'Clique em <b>Confirmar</b> na linha (ou em <b>Confirmar as sugestões</b>) para dar baixa: o lançamento passa a Pago/Recebido com a data do banco.', 'Para movimentos sem lançamento (tarifas, por exemplo), escolha a <b>Obra dos novos lançamentos</b> e clique em <b>Lançar</b>.', '<b>Pix:</b> preencha <b>Chave Pix</b>, <b>Recebedor</b> e <b>Cidade</b>. Opcional: escolha uma conta a receber para preencher o valor, ou digite <b>Valor</b> e <b>Identificador</b>.', 'Clique em <b>Gerar Pix</b>. Envie ao cliente o QR Code ou use <b>Copiar código</b> (Pix copia e cola).'],
  ['Importar o mesmo extrato de novo não duplica nada.', 'O arquivo do extrato é lido no seu computador; não é enviado a terceiros.', 'O Pix gerado cai direto na conta da chave informada. A confirmação do recebimento vem pelo extrato.', 'Extrato automático e boletos dependem de contrato de API com o banco e do certificado digital da empresa.']],
['financeiro', 'Notas fiscais e CNPJ', 'Transforma o XML da nota fiscal de compra em fornecedor e contas a pagar, e consulta CNPJ na Receita Federal.', '33-fiscal',
  ['Peça ao fornecedor o arquivo <b>.xml</b> da NF-e (não o PDF).', 'Abra <b>Financeiro → Notas fiscais e CNPJ</b>, escolha a <b>Obra dos novos lançamentos</b> e clique em <b>Importar XML de NF-e</b> (pode selecionar várias).', 'Confira o cartão da nota: fornecedor, valor, itens, se está <b>Autorizada pela SEFAZ</b> e as parcelas.', 'Clique em <b>Lançar contas a pagar</b>. O aplicativo cadastra o fornecedor (se for novo) e cria uma conta a pagar por duplicata, com o vencimento de cada uma.', '<b>Consulta de CNPJ:</b> digite o CNPJ, clique em <b>Consultar</b> e, se quiser, em <b>Cadastrar como fornecedor</b>.'],
  ['Lançar a mesma nota duas vezes não duplica as contas.', 'Emissão de NF-e/NFS-e e busca automática de notas na SEFAZ exigem o certificado digital e-CNPJ (A1) e um serviço emissor contratado; não são feitas por esta tela.']],

['rh', 'Recursos Humanos', null, null, null, null, 'parte'],
['rh', 'Pessoal', 'Cadastro da equipe, função, salário e obra em que cada pessoa está alocada.', '27-pessoal',
  ['Abra <b>Recursos Humanos → Pessoal</b> e clique em <b>Novo</b>.', 'Informe nome, função, CPF, nascimento, CBO (código da ocupação), admissão, salário e obra alocada.', 'Mantenha o <b>Status</b> atualizado: Ativo, Férias ou Inativo.'],
  ['CPF, nascimento e CBO são usados na conferência para o eSocial.']],
['rh', 'eSocial', 'Confere se os dados de cada trabalhador estão completos e válidos e gera a planilha para a contabilidade.', '34-esocial',
  ['Abra <b>Recursos Humanos → eSocial</b>.', 'Veja quantas pessoas estão com os dados de admissão completos. A coluna <b>O que falta</b> lista as pendências de cada uma (CPF inválido, CBO, datas, salário…).', 'Clique em <b>Corrigir em Pessoal</b> para completar os cadastros.', 'Clique em <b>Planilha para a contabilidade</b> para baixar o arquivo (abre no Excel).'],
  ['O envio dos eventos ao eSocial é feito pelo sistema de folha da contabilidade, com o certificado digital da empresa. Esta tela garante que os dados saiam completos.']],

['qualidade', 'Qualidade e Segurança', null, null, null, null, 'parte'],
['qualidade', 'Qualidade', 'Não conformidades e planos de ação.', '28-qualidade',
  ['Abra <b>Qualidade e Segurança → Qualidade</b> e clique em <b>Novo</b>.', 'Informe obra, data, etapa, a não conformidade, responsável e prazo.', 'Classifique a <b>Severidade</b> (Crítica, Maior, Menor) e acompanhe o <b>Status</b> (Aberta, Em andamento, Resolvida).'],
  ['Não conformidade crítica em aberto aparece em vermelho na Central de pendências.']],
['qualidade', 'Segurança do trabalho', 'DDS, inspeções, incidentes e treinamentos.', '29-seguranca',
  ['Abra <b>Qualidade e Segurança → Segurança do trabalho</b> e clique em <b>Novo</b>.', 'Escolha o <b>Tipo</b> (DDS, Inspeção, Incidente, Treinamento), descreva e indique o responsável.', 'Atualize o <b>Status</b> até "Concluído".'], []],
['qualidade', 'Documentos', 'Arquivo da empresa e das obras, com revisão, vencimento e anexo.', '30-documentos',
  ['Abra <b>Qualidade e Segurança → Documentos</b> e clique em <b>Novo</b>.', 'Informe nome, categoria, data, <b>Vencimento</b>, revisão e status.', 'Anexe o arquivo em <b>Enviar arquivo</b> (até 10 MB) ou informe um link.', 'Na tabela, clique no nome do arquivo para abrir.'],
  ['Documentos que vencem em até 30 dias aparecem na Central de pendências.', 'Anexos dependem do armazenamento de arquivos (Storage) ativado no Firebase.']],

['administrativo', 'Administrativo', null, null, null, null, 'parte'],
['administrativo', 'Empresa e equipe', 'Dados da empresa que saem nos PDFs e controle de quem acessa o aplicativo.', '35-admin',
  ['Abra <b>Administrativo → Empresa e equipe</b> (só o proprietário).', '<b>Empresa:</b> preencha nome, razão social, CNPJ, UF, responsável técnico, conselho (CREA/CAU) e número do registro, custo da hora técnica e cor da marca. Clique em <b>Salvar empresa</b>.', '<b>Convidar pessoa:</b> digite o <b>E-mail</b>, escolha a <b>Obra</b> e clique em <b>Gerar convite</b>. Copie o link que aparece e envie à pessoa (WhatsApp ou e-mail).', 'A pessoa abre o link, cria a própria senha e entra. Ela aparece na tabela <b>Equipe</b>.', 'Na tabela <b>Equipe</b>, ajuste a <b>Obra</b> e o <b>Perfil</b> de cada pessoa. A lixeira remove o acesso na hora.'],
  ['O convite vale 7 dias e só para o e-mail informado.', 'É preciso ter pelo menos uma obra cadastrada para convidar alguém.']],
];

const PERFIS = `<table class="perfis"><thead><tr><th>Quem</th><th>Obras e cadastros de obra</th><th>Projetos e contratos</th><th>Orçamentos e cotações</th><th>Equipe e empresa</th></tr></thead><tbody>
<tr><td><b>Proprietário</b></td><td>Tudo, em todas as obras; cria e exclui</td><td>Tudo</td><td>Tudo; aprova orçamento</td><td>Sim</td></tr>
<tr><td><b>Coordenador</b></td><td>Lança e edita na obra atribuída</td><td>Cria e edita projetos; envia contratos</td><td>Cria e edita</td><td>Não</td></tr>
<tr><td><b>Orçamentista</b></td><td>Lança e edita na obra atribuída</td><td>Consulta</td><td>Cria e edita; não aprova</td><td>Não</td></tr>
<tr><td><b>Projetista / Usuário de obra</b></td><td>Lança e edita na obra atribuída</td><td>Consulta; envia CAD; lança as próprias horas</td><td>Consulta</td><td>Não</td></tr></tbody></table>
<p class="obs">Ninguém além do proprietário exclui registros, cria obras ou cadastra fornecedores. Todos os membros consultam os dados da empresa.</p>`;

const esc = (s) => s;
let n = 0, parte = 0; const sumario = [];
const corpo = CAP.map((c) => {
  const [area, titulo, para, imagens, passos, obs, tipo] = c; const cor = AREAS[area];
  if (tipo === 'parte') { parte++; n = 0; sumario.push({ parte: true, titulo, cor, parteN: parte }); return `<section class="parte" style="--cor:${cor}"><p>Parte ${parte}</p><h1>${titulo}</h1></section>`; }
  n++; const num = `${parte}.${n}`; sumario.push({ titulo, num });
  const lista = Array.isArray(imagens) ? imagens : [imagens];
  const figs = lista.length > 1 ? `<div class="trio">${lista.map((i) => `<img src="${img(i)}" class="${i.includes('celular') ? 'cel' : ''}">`).join('')}</div>` : `<img class="tela" src="${img(lista[0])}">`;
  return `<section class="cap" style="--cor:${cor}"><h2><span>${num}</span>${titulo}</h2><p class="para">${para}</p>${figs}
  <h3>Passo a passo</h3><ol>${passos.map((p) => `<li>${p}</li>`).join('')}</ol>${obs.length ? `<div class="notas"><h3>Importante</h3><ul>${obs.map((o) => `<li>${o}</li>`).join('')}</ul></div>` : ''}</section>`;
}).join('\n');

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Manual do ObraTop 4</title><style>
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; } body { font: 10.5pt/1.5 'Segoe UI', Inter, Helvetica, Arial, sans-serif; color: #1c1c22; margin: 0; }
.capa { height: 262mm; display: flex; flex-direction: column; justify-content: space-between; padding: 14mm 6mm; page-break-after: always; background: linear-gradient(150deg, #eef0ff 0%, #fff 55%); border-radius: 6mm; }
.capa .marca { display: flex; align-items: center; gap: 4mm; font-size: 16pt; font-weight: 700; }
.capa .marca b { display: grid; place-items: center; width: 14mm; height: 14mm; border-radius: 4mm; color: #fff; background: linear-gradient(135deg, #3b4cca, #7c3aed); font-size: 13pt; }
.capa h1 { font-size: 40pt; line-height: 1.05; margin: 0 0 5mm; letter-spacing: -1px; } .capa .sub { font-size: 14pt; color: #555; max-width: 130mm; }
.capa img { width: 100%; border-radius: 3mm; border: 1px solid #dcdce4; box-shadow: 0 6mm 14mm -8mm #3b4cca88; } .capa small { color: #666; }
h1, h2, h3 { margin: 0; } .sum { page-break-after: always; } .sum h1 { font-size: 20pt; margin-bottom: 6mm; }
.sum ul { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 10mm; } .sum li { padding: 1.1mm 0; break-inside: avoid; display: flex; gap: 2.5mm; }
.sum li.p { font-weight: 700; margin-top: 3mm; color: var(--cor); border-bottom: 1px solid #e3e3ea; } .sum li span { color: #888; min-width: 8mm; font-variant-numeric: tabular-nums; }
.intro { page-break-after: always; } .intro h1 { font-size: 20pt; margin-bottom: 4mm; } .intro h2 { font-size: 13pt; margin: 6mm 0 2mm; }
.parte { height: 262mm; display: flex; flex-direction: column; justify-content: center; page-break-before: always; page-break-after: always; border-left: 5mm solid var(--cor); padding-left: 12mm; }
.parte p { text-transform: uppercase; letter-spacing: 2px; color: var(--cor); font-weight: 700; margin: 0 0 2mm; } .parte h1 { font-size: 34pt; letter-spacing: -0.5px; }
.cap { page-break-before: always; } .parte + .cap { page-break-before: avoid; }
.cap h2 { font-size: 17pt; display: flex; align-items: baseline; gap: 3mm; border-bottom: 0.8mm solid var(--cor); padding-bottom: 2mm; } .cap h2 span { color: var(--cor); font-size: 12pt; }
.para { color: #444; margin: 3mm 0 4mm; font-size: 11pt; } .tela { display: block; max-width: 100%; max-height: 98mm; margin: 0 auto 4mm; border: 1px solid #d6d6de; border-radius: 2mm; }
.trio { display: flex; gap: 4mm; align-items: flex-start; justify-content: center; margin-bottom: 4mm; } .trio img { border: 1px solid #d6d6de; border-radius: 2mm; max-height: 90mm; max-width: 58%; } .trio img.cel { max-width: 19%; }
h3 { font-size: 10pt; text-transform: uppercase; letter-spacing: 1px; color: var(--cor, #3b4cca); margin: 3mm 0 1.5mm; }
ol { margin: 0; padding-left: 6mm; } ol li { margin-bottom: 1.4mm; padding-left: 1mm; } ol li::marker { font-weight: 700; color: var(--cor); }
.notas { margin-top: 4mm; background: #f6f6fa; border-left: 1.2mm solid var(--cor); border-radius: 1.5mm; padding: 2.5mm 4mm; break-inside: avoid; } .notas ul { margin: 0; padding-left: 5mm; } .notas li { margin-bottom: 1mm; }
table.perfis { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 3mm; } .perfis th, .perfis td { border: 1px solid #d6d6de; padding: 2mm; text-align: left; vertical-align: top; } .perfis th { background: #eef0ff; }
.obs { color: #555; font-size: 9.5pt; } .faq dt { font-weight: 700; margin-top: 3mm; } .faq dd { margin: 1mm 0 0; }
</style></head><body>
<div class="capa"><div class="marca"><img src="data:image/svg+xml;base64,${fs.readFileSync(path.join(__dirname, '..', 'public', 'marca', 'obratop-logo.svg')).toString('base64')}" style="height:16mm;width:auto;border:0;box-shadow:none;border-radius:0"></div><div><h1>Manual do usuário</h1><p class="sub">Todas as funcionalidades, tela por tela, com o passo a passo ilustrado.</p></div><img src="${img('02-inicio')}"><small>Versão 4.0 · novembro de 2026 · As telas deste manual usam dados fictícios de demonstração.</small></div>
<div class="sum"><h1>Sumário</h1><ul><li><span></span>Como usar este manual</li>${sumario.map((s) => (s.parte ? `<li class="p" style="--cor:${s.cor}">Parte ${s.parteN} — ${s.titulo}</li>` : `<li><span>${s.num}</span>${s.titulo}</li>`)).join('')}<li class="p" style="--cor:#3b4cca">Anexos</li><li><span>A</span>Quem pode fazer o quê</li><li><span>B</span>Dúvidas frequentes</li><li><span>C</span>O que depende de contratos e certificado</li></ul></div>
<div class="intro"><h1>Como usar este manual</h1>
<p>O ObraTop 4 reúne em um só lugar a gestão de obras, os projetos de engenharia e arquitetura, o orçamento e as rotinas administrativas e financeiras. Ele é organizado em <b>áreas</b>, e este manual segue a mesma ordem do menu.</p>
<p>Cada capítulo traz: <b>para que serve</b> a tela, a <b>imagem</b> dela, o <b>passo a passo</b> e os pontos de <b>atenção</b>. Os nomes em <b>negrito</b> são exatamente os que aparecem na tela.</p>
<h2>As áreas</h2><table class="perfis"><tbody>
<tr><td><b>Comercial</b></td><td>Briefing, cotações, propostas e contratos</td></tr><tr><td><b>Engenharia e Arquitetura</b></td><td>Projetos, CAD e revisões, BIM e quantitativos</td></tr>
<tr><td><b>Orçamento</b></td><td>Serviços e composições, orçamento pelo CUB, orçamento da obra, orçamento analítico</td></tr><tr><td><b>Planejamento e Obras</b></td><td>Obras, cronograma, diário de obra, medições</td></tr>
<tr><td><b>Suprimentos</b></td><td>Compras, estoque, fornecedores, equipamentos</td></tr><tr><td><b>Financeiro</b></td><td>Lançamentos, contratos de obra, bancos e Pix, notas fiscais e CNPJ</td></tr>
<tr><td><b>Recursos Humanos</b></td><td>Pessoal, horas técnicas, eSocial</td></tr><tr><td><b>Qualidade e Segurança</b></td><td>Qualidade, segurança do trabalho, documentos</td></tr>
<tr><td><b>Fiscal e Integrações</b></td><td>Atalho para bancos e Pix, notas fiscais e CNPJ, eSocial</td></tr><tr><td><b>Administrativo</b></td><td>Empresa e equipe, documentos</td></tr></tbody></table>
<h2>O caminho completo de um trabalho</h2><ol><li><b>Briefing</b> do cliente → cria o projeto.</li><li><b>CAD / BIM</b> → os desenhos e modelos geram os quantitativos.</li><li><b>Orçamento</b> pelo CUB ou por composições → <b>proposta e contrato</b> com assinatura digital.</li><li><b>Cotação</b> ou orçamento analítico → <b>orçamento da obra</b> → <b>cronograma</b>.</li><li>Na execução: <b>diário</b>, <b>medições</b>, <b>compras</b>, <b>estoque</b>, <b>qualidade</b> e <b>segurança</b>.</li><li>No escritório: <b>financeiro</b>, <b>conciliação bancária</b>, <b>notas fiscais</b> e <b>pessoal</b>.</li><li>O <b>Início</b> reúne tudo em indicadores e pendências.</li></ol></div>
${corpo}
<section class="cap" style="--cor:#3b4cca"><h2><span>A</span>Quem pode fazer o quê</h2><p class="para">O acesso é definido em Administrativo → Empresa e equipe: cada pessoa é ligada a uma obra e recebe um perfil.</p>${PERFIS}
<h2 style="margin-top:8mm"><span>B</span>Dúvidas frequentes</h2><dl class="faq">
<dt>Lancei algo sem internet. Perdi?</dt><dd>Não. O lançamento fica no aparelho e sobe sozinho quando a conexão voltar. Não limpe os dados do navegador antes disso.</dd>
<dt>Excluí um registro por engano.</dt><dd>A exclusão é lógica: o registro continua no banco de dados e pode ser recuperado pelo suporte.</dd>
<dt>Não vejo o botão "Novo" ou a lixeira.</dt><dd>Seu acesso não permite essa ação nessa tela ou nessa obra. Fale com o proprietário da empresa.</dd>
<dt>O total do orçamento analítico está menor do que eu esperava.</dt><dd>Itens com "Sugestão — revisar" não entram no total até serem confirmados com o ✓.</dd>
<dt>O convidado não consegue entrar.</dt><dd>O convite vale 7 dias e só para o e-mail em que foi emitido. Gere outro convite com o e-mail correto.</dd>
<dt>O ObraTop antigo continua funcionando?</dt><dd>Sim. Os dois usam os mesmos dados: o que é lançado em um aparece no outro.</dd>
<dt>Como instalo no celular?</dt><dd>Abra o endereço no Chrome, toque no menu (⋮) e em "Adicionar à tela inicial".</dd></dl>
<h2 style="margin-top:8mm"><span>C</span>O que depende de contratos e certificado</h2><table class="perfis"><thead><tr><th>Recurso</th><th>O que é necessário</th></tr></thead><tbody>
<tr><td>Assinatura digital de contratos</td><td>Conta da empresa no provedor de assinatura (Clicksign) e plano Blaze do Firebase</td></tr>
<tr><td>Medição automática de arquivos DWG</td><td>Conta da empresa no serviço Autodesk Platform Services (DXF e IFC funcionam sem isso)</td></tr>
<tr><td>Anexos, envio de CAD ao servidor, auditoria e notificações automáticas</td><td>Plano Blaze do Firebase com o Storage ativado</td></tr>
<tr><td>Emissão de NF-e / NFS-e e busca de notas na SEFAZ</td><td>Certificado digital e-CNPJ (A1) e serviço emissor contratado</td></tr>
<tr><td>Transmissão ao eSocial</td><td>Certificado digital; feita pelo sistema de folha da contabilidade</td></tr>
<tr><td>Extrato bancário automático e boletos</td><td>Contrato de API com o banco e certificado digital</td></tr></tbody></table></section>
</body></html>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  await p.pdf({ path: SAIDA, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font:8pt Helvetica,Arial;color:#888;padding:0 15mm;display:flex;justify-content:space-between"><span>Manual do ObraTop 4</span><span class="pageNumber"></span></div>' });
  await b.close(); console.log('capítulos:', sumario.filter((s) => !s.parte).length);
})();
