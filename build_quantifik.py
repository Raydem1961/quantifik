#!/usr/bin/env python3
"""QUANTIFIK: atualiza a base SINAPI-BA embutida no index.html.

Uso:
  python build_quantifik.py                      # baixa o mês mais recente da Caixa (se for mais novo que o do app)
  python build_quantifik.py --source arq.zip     # usa um arquivo local (.zip da Caixa ou SINAPI_Referência_AAAA_MM.xlsx)

Lê SINAPI_Referência_AAAA_MM.xlsx (relatório mensal da Caixa, formato XLSX):
  Analítico        composições e seus insumos (coeficientes)
  ISD / ICD        preços medianos de insumos, sem / com desoneração (coluna BA = Salvador)
  CSD / CCD        custo oficial das composições, sem / com desoneração
  Linhas Horista / Mensalista das abas acima: encargos sociais por UF
Nunca grava zero no lugar de preço ausente. Se algo parecer errado, não altera o index.html e sai com código 2.
"""
import argparse, datetime, json, os, re, sys, tempfile, time, unicodedata, zipfile, collections

UF = "BA"
URL = os.environ.get("QUANTIFIK_URL", "https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-{y}-{m}-formato-xlsx.zip")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
MARK = re.compile(r'(<script type="application/json" id="embedded-data">)(.*?)(</script>)', re.S)
UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]


class Falha(Exception):
    pass


def txt(v):
    return re.sub(r"\s+", " ", str(v if v is not None else "")).strip()


def codigo(v):
    s = txt(v)
    return s[:-2] if re.fullmatch(r"\d+\.0", s) else s


def numero(v):
    if isinstance(v, (int, float)):
        return float(v)
    s = txt(v).replace("R$", "").replace(" ", "")
    if not s or s in ("-", "–"):
        return 0.0
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def norm(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn").lower()).strip()


# ---------------------------------------------------------------- leitura
def abrir(fonte):
    """Devolve (caminho do xlsx de referência, pasta temporária ou None)."""
    if fonte.lower().endswith(".xlsx"):
        return fonte, None
    tmp = tempfile.mkdtemp(prefix="sinapi_")
    if not zipfile.is_zipfile(fonte):
        raise Falha(f"{fonte} não é um .zip válido")
    with zipfile.ZipFile(fonte) as z:
        alvo = [n for n in z.namelist() if re.search(r"SINAPI_Refer[eê]ncia_\d{4}_\d{2}\.xlsx$", n, re.I)]
        if not alvo:
            raise Falha("o .zip não contém SINAPI_Referência_AAAA_MM.xlsx")
        z.extract(alvo[0], tmp)
        return os.path.join(tmp, alvo[0]), tmp


def linhas(ws):
    return list(ws.iter_rows(values_only=True))


def cabecalho(rows, inicio=0):
    for i in range(inicio, min(len(rows), 40)):
        t = [norm(x) for x in rows[i]]
        if any(x.startswith("codigo") for x in t) and any(x.startswith("descricao") for x in t):
            return i
    raise Falha("cabeçalho não encontrado")


def colunas_uf(linha):
    return {txt(x).upper(): j for j, x in enumerate(linha) if txt(x).upper() in UFS}


def ler_referencia(caminho):
    import openpyxl
    wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    try:
        faltam = [s for s in ("Analítico", "ISD", "ICD", "CSD", "CCD") if s not in wb.sheetnames]
        if faltam:
            raise Falha("abas ausentes: " + ", ".join(faltam))
        R = {s: linhas(wb[s]) for s in ("Analítico", "ISD", "ICD", "CSD", "CCD")}
    finally:
        wb.close()
    ref = ""
    for r in R["ISD"][:8]:
        if r and norm(r[0]).startswith("mes de referencia"):
            m = re.search(r"(0[1-9]|1[0-2])\s*/\s*(20\d{2})", txt(r[1]))
            ref = f"{m.group(2)}-{m.group(1)}" if m else ""
    if not ref:
        raise Falha("mês de referência não encontrado")

    # --- encargos sociais (linhas Horista / Mensalista, sob a linha de UFs)
    enc = {}
    for aba, reg in (("ISD", "sd"), ("ICD", "cd")):
        rows = R[aba]
        ufrow = next((r for r in rows[:9] if len(colunas_uf(r)) >= 20), None)
        if ufrow is None:
            raise Falha(f"aba {aba}: linha de UFs não encontrada")
        j = colunas_uf(ufrow)[UF]
        for r in rows[:9]:
            for k, x in enumerate(r):
                if txt(x).lower() in ("horista", "mensalista") and k < j and len(r) > j:
                    v = numero(r[j])
                    if v > 0:
                        enc.setdefault(reg, {})[txt(x).lower()] = round(v * 100, 2)
        if "horista" not in enc.get(reg, {}):
            raise Falha(f"encargos horistas não encontrados na aba {aba}")

    # --- preços de insumos (BA)
    classe, preco = {}, {"sd": {}, "cd": {}}
    for aba, reg in (("ISD", "sd"), ("ICD", "cd")):
        rows = R[aba]
        h = cabecalho(rows)
        ufs = colunas_uf(rows[h])
        if UF not in ufs:
            raise Falha(f"aba {aba}: coluna {UF} não encontrada")
        j = ufs[UF]
        for r in rows[h + 1:]:
            if len(r) <= j or r[1] is None:
                continue
            c = codigo(r[1])
            if reg == "sd":
                classe[c] = txt(r[0])
            p = numero(r[j])
            if 0 < p < 1e9:
                preco[reg][c] = round(p, 2)

    # --- analítico
    grupo_de, itens_de, ordem = {}, collections.defaultdict(list), []
    cab = {}
    for r in R["Analítico"][10:]:
        if not r or len(r) < 8 or r[1] is None:
            continue
        cod = codigo(r[1])
        if r[2] is None and r[3] is None:
            if cod not in cab:
                cab[cod] = (txt(r[0]), txt(r[4]), txt(r[5]))
                ordem.append(cod)
            continue
        tipo = txt(r[2]).upper()
        if tipo not in ("COMPOSICAO", "INSUMO") or r[3] is None:
            continue
        coef = numero(r[6])
        if coef > 0 and cod in cab:
            itens_de[cod].append(("C" if tipo == "COMPOSICAO" else "I", codigo(r[3]), txt(r[4]), txt(r[5]), coef))
    chave = {v: k for k, v in cab.items()}

    # --- custo oficial das composições (BA)
    custo = {}
    for aba, reg in (("CSD", "sd"), ("CCD", "cd")):
        rows = R[aba]
        h = cabecalho(rows)
        ufrow = rows[h - 1]
        j = colunas_uf(ufrow).get(UF)
        if j is None:
            raise Falha(f"aba {aba}: coluna {UF} não encontrada")
        gi, di, ui = 0, [k for k, x in enumerate(rows[h]) if norm(x).startswith("descricao")][0], [k for k, x in enumerate(rows[h]) if norm(x).startswith("unidade")][0]
        for r in rows[h + 1:]:
            if len(r) <= j or r[di] is None:
                continue
            cod = chave.get((txt(r[gi]), txt(r[di]), txt(r[ui])))
            if cod:
                p = numero(r[j])
                custo[(cod, reg)] = round(p, 2) if 0 < p < 1e9 else 0.0
    return dict(ref=ref, enc=enc, classe=classe, preco=preco, cab=cab, ordem=ordem, itens=itens_de, custo=custo)


# ---------------------------------------------------------------- montagem
CLASSE_T = {"MATERIAL": "mat", "ESPECIAIS": "mat", "EQUIPAMENTO (AQUISIÇÃO)": "eqp", "EQUIPAMENTO (LOCAÇÃO)": "eqp",
            "MAO DE OBRA": "mo", "ENCARGOS COMPLEMENTARES": "mo", "SERVIÇOS": "srv"}


def montar(d):
    ordem, cab, itens = d["ordem"], d["cab"], d["itens"]
    dic, idx, comps = [], {}, []
    for cod in ordem:
        its = []
        for pref, ic, desc, un, coef in itens.get(cod, []):
            k = pref + ic
            if k not in idx:
                if pref == "I":
                    t = CLASSE_T.get(d["classe"].get(ic, ""), "mat")
                else:
                    sub = cab.get(ic)
                    if sub and sub[0].startswith("Livro SINAPI"):
                        t = "mo"
                    elif un.upper() in ("CHP", "CHI"):
                        t = "eqp"
                    else:
                        t = "aux"
                idx[k] = len(dic)
                dic.append([k, desc, un, t])
            its.append([idx[k], coef])
        if its:
            g, desc, un = cab[cod]
            comps.append([cod, desc, un, g, its, d["custo"].get((cod, "sd"), 0.0), d["custo"].get((cod, "cd"), 0.0)])
    return dic, comps


def recuperar(dic, comps, preco):
    """Preços de insumos que o SINAPI usou no custo oficial mas que não vieram na tabela de preços:
    resolve-se o único item sem preço de cada composição com custo oficial e só se aceita o valor
    quando todas as composições que usam o insumo concordam (dentro do arredondamento)."""
    comp = {c[0]: c for c in comps}
    out = {}
    for reg, sel in (("sd", 5), ("cd", 6)):
        base = dict(preco[reg])
        rec = {}
        for _ in range(3):
            est = collections.defaultdict(list)
            for c in comps:
                if c[sel] <= 0:
                    continue
                desc, tot = [], 0.0
                for di, coef in c[4]:
                    x = dic[di]
                    k = x[0][1:]
                    p = base.get(k) if x[0][0] == "I" else (comp[k][sel] if k in comp else None)
                    if p is None:
                        desc.append((di, coef))
                    else:
                        tot += coef * p
                if len(desc) == 1 and dic[desc[0][0]][0][0] == "I":
                    di, coef = desc[0]
                    est[dic[di][0][1:]].append(((c[sel] - tot) / coef, 0.005 / coef))
            novo = {}
            for k, l in est.items():
                v, t = min(l, key=lambda z: z[1])
                if v > 0 and all(abs(x[0] - v) <= x[1] + t + 0.02 * abs(v) for x in l):
                    novo[k] = round(v, 2)
            if not novo:
                break
            base.update(novo)
            rec.update(novo)
        out[reg] = rec
    return out


def dados(d):
    dic, comps = montar(d)
    rec = recuperar(dic, comps, d["preco"])
    mes, ano = d["ref"][5:], d["ref"][:4]
    return {"v": 2,
            "bases": {"sinapi": {"meta": {"nome": f"SINAPI {mes}/{ano} · composições analíticas (Bahia)"}, "dict": dic, "comps": comps}},
            "precos": {"sd": d["preco"]["sd"], "cd": d["preco"]["cd"],
                       "meta": {"nome": f"SINAPI {mes}/{ano} · preços medianos de insumos, Salvador/BA", "n": len(d["preco"]["sd"]), "rec_n": len(rec["sd"])},
                       "rec": rec, "enc": d["enc"], "ref": d["ref"]}}


def validar(novo, antigo):
    n = novo["bases"]["sinapi"]
    erros = []
    if len(n["comps"]) < 8000:
        erros.append(f"poucas composições ({len(n['comps'])})")
    if len(novo["precos"]["sd"]) < 3000 or len(novo["precos"]["cd"]) < 3000:
        erros.append("poucos preços de insumos para Salvador")
    com_custo = sum(1 for c in n["comps"] if c[5] > 0) / max(1, len(n["comps"]))
    if com_custo < 0.5:
        erros.append(f"só {com_custo:.0%} das composições com custo")
    for reg in ("sd", "cd"):
        h = novo["precos"]["enc"].get(reg, {}).get("horista", 0)
        if not 80 <= h <= 150:
            erros.append(f"encargos horistas fora do esperado ({reg}: {h}%)")
    if antigo:
        a = antigo["bases"]["sinapi"]
        if len(n["comps"]) < 0.9 * len(a["comps"]):
            erros.append("número de composições caiu mais de 10%")
        if len(novo["precos"]["sd"]) < 0.9 * len(antigo["precos"]["sd"]):
            erros.append("número de preços caiu mais de 10%")
    return erros


# ---------------------------------------------------------------- download
def baixar(ref_atual):
    import requests
    hoje = datetime.date.today().replace(day=1)
    meses = []
    d = hoje
    for _ in range(4):
        meses.append((d.year, d.month))
        d = (d - datetime.timedelta(days=1)).replace(day=1)
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9"})
    problemas = []
    for a, m in meses:
        ref = f"{a}-{m:02d}"
        if ref_atual and ref <= ref_atual:
            if problemas:
                raise Falha("não consegui verificar meses novos na Caixa: " + "; ".join(problemas))
            return None, ref_atual   # confirmado: o mais novo já está no app
        url = URL.format(y=a, m=f"{m:02d}")
        r, erro = None, ""
        for tentativa in range(3):          # a Caixa às vezes oscila: 3 tentativas com espera
            try:
                r = s.get(url, timeout=90, stream=True)
                if r.status_code < 500 and r.status_code != 429:
                    break
                erro = f"HTTP {r.status_code}"
            except Exception as e:
                r, erro = None, str(e)[:120]
            time.sleep(5 * (tentativa + 1))
        if r is None:
            problemas.append(f"{ref}: erro de rede")
            print(f"  {ref}: erro de rede ({erro})")
            continue
        if r.status_code == 404:
            print(f"  {ref}: ainda não publicado")
            continue
        if r.status_code != 200:
            problemas.append(f"{ref}: HTTP {r.status_code}")
            print(f"  {ref}: HTTP {r.status_code}")
            continue
        fd, p = tempfile.mkstemp(suffix=".zip")
        with os.fdopen(fd, "wb") as f:
            for blk in r.iter_content(1 << 20):
                f.write(blk)
        if os.path.getsize(p) < 2_000_000 or not zipfile.is_zipfile(p):
            problemas.append(f"{ref}: arquivo baixado inválido")
            print(f"  {ref}: arquivo baixado inválido")
            continue
        print(f"  {ref}: baixado de {url}")
        return p, ref
    raise Falha("não consegui baixar nenhum mês recente da Caixa" + (": " + "; ".join(problemas) if problemas else ""))


def local_mais_novo(ref_atual):
    """Plano B: .zip do SINAPI colocado na pasta fontes/ (ex.: fontes/SINAPI-2026-09-formato-xlsx.zip)."""
    achados = []
    for f in os.listdir("fontes") if os.path.isdir("fontes") else []:
        m = re.search(r"(20\d{2})[-_](\d{2})", f)
        if m and f.lower().endswith((".zip", ".xlsx")) and f"{m.group(1)}-{m.group(2)}" > (ref_atual or ""):
            achados.append((f"{m.group(1)}-{m.group(2)}", os.path.join("fontes", f)))
    return max(achados)[1] if achados else None


def principal():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", default="index.html")
    ap.add_argument("--source", help="arquivo local (.zip da Caixa ou .xlsx)")
    ap.add_argument("--force", action="store_true", help="regrava mesmo que o mês seja o mesmo")
    a = ap.parse_args()
    html = open(a.index, encoding="utf-8").read()
    m = MARK.search(html)
    if not m:
        raise Falha("marcador embedded-data não encontrado no index.html")
    antigo = json.loads(m.group(2))
    ref_atual = antigo.get("precos", {}).get("ref", "")
    print("Base atual do app:", ref_atual or "(sem referência)")
    fonte = a.source
    if not fonte:
        try:
            fonte, _ = baixar(ref_atual)
        except Falha as e:
            fonte = local_mais_novo(ref_atual)
            if not fonte:
                raise
            print(f"Download indisponível ({e}); usando o arquivo local {fonte}")
        if fonte is None and not a.force:
            print("Nada a fazer: o app já está no mês mais recente.")
            return 0
    caminho, tmp = abrir(fonte)
    d = ler_referencia(caminho)
    if ref_atual and d["ref"] < ref_atual and not a.force:
        raise Falha(f"o arquivo é de {d['ref']}, mais antigo que o do app ({ref_atual})")
    novo = dados(d)
    erros = validar(novo, antigo)
    if erros:
        raise Falha("validação reprovou o arquivo: " + "; ".join(erros))
    js = json.dumps(novo, ensure_ascii=False, separators=(",", ":"))
    assert "</" not in js
    html2 = html[:m.start(2)] + js + html[m.end(2):]
    open(a.index, "w", encoding="utf-8").write(html2)
    # carimba o service worker para o celular buscar a versão nova
    sw = os.path.join(os.path.dirname(os.path.abspath(a.index)), "sw.js")
    if os.path.exists(sw):
        s = open(sw, encoding="utf-8").read()
        s = re.sub(r'const CACHE = "[^"]*";', f'const CACHE = "quantifik-{d["ref"]}";', s)
        open(sw, "w", encoding="utf-8").write(s)
    n = novo["bases"]["sinapi"]
    resumo = {"referencia": d["ref"], "composicoes": len(n["comps"]), "insumos_com_preco": len(novo["precos"]["sd"]),
              "precos_derivados": novo["precos"]["meta"]["rec_n"], "encargos_percent": novo["precos"]["enc"],
              "composicoes_com_custo_oficial": sum(1 for c in n["comps"] if c[5] > 0),
              "atualizado_em": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}
    json.dump(resumo, open(os.path.join(os.path.dirname(os.path.abspath(a.index)), "status.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(resumo, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(principal())
    except Falha as e:
        print("ERRO:", e, file=sys.stderr)
        sys.exit(2)
