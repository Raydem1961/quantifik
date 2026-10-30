# QUANTIFIK

Quantitativos e preços de obra (SINAPI-BA, ORSE-SE, Sinduscon-BA e BDI), instalável no celular pelo Chrome.

## Atualização automática
Todo dia o GitHub Actions confere se a Caixa publicou um mês novo do SINAPI. Se publicou, o robô (`build_quantifik.py`):
1. baixa o pacote mensal da Caixa;
2. lê composições, coeficientes, preços de insumos de Salvador, custos oficiais e **encargos sociais (horista/mensalista, com e sem desoneração)**;
3. valida os dados (se algo estiver estranho, não altera o app e abre um aviso em Issues);
4. regrava a base dentro do `index.html` e republica o app no GitHub Pages.

O app usa os encargos do SINAPI-BA da própria base, então eles acompanham o mês.

## Plano B
Se o download falhar, envie o .zip do mês para a pasta `fontes/` (veja `fontes/LEIA-ME.txt`).

## Não automático
Os pisos salariais do Sinduscon-BA (convenção coletiva, em geral anual) ficam no app, aba Preços > Parâmetros.
