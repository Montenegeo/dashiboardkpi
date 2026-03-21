import sys, uuid, threading, json, os
from concurrent.futures import ThreadPoolExecutor, as_completed
try:
    from apify_client import ApifyClient
except ImportError:
    pass
try:
    from flask import Flask, render_template_string, request, jsonify, make_response
except ImportError:
    print("ERRO: pip install flask"); sys.exit(1)
import requests as http_req

app = Flask(__name__)
APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
MAX_LEADS   = 50

BRAZIL_STATES = [
    ("AC","Acre"),("AL","Alagoas"),("AP","Amapá"),("AM","Amazonas"),
    ("BA","Bahia"),("CE","Ceará"),("DF","Distrito Federal"),("ES","Espírito Santo"),
    ("GO","Goiás"),("MA","Maranhão"),("MT","Mato Grosso"),("MS","Mato Grosso do Sul"),
    ("MG","Minas Gerais"),("PA","Pará"),("PB","Paraíba"),("PR","Paraná"),
    ("PE","Pernambuco"),("PI","Piauí"),("RJ","Rio de Janeiro"),("RN","Rio Grande do Norte"),
    ("RS","Rio Grande do Sul"),("RO","Rondônia"),("RR","Roraima"),("SC","Santa Catarina"),
    ("SP","São Paulo"),("SE","Sergipe"),("TO","Tocantins"),
]

# ── Filtros silenciosos ──────────────────────────────────────────────────────
_NOISE = [
    "mei","microempreendedor individual","autônomo","franquia","franqueado",
    "franqueada","franchise","mcdonald","burger king","subway","habib's",
    "boticário","natura ","avon ","herbalife","cacau show","bob's","kfc ",
    "pizza hut","spoleto","giraffas",
]
def _is_noise(item):
    t = ((item.get("title") or "")+" "+(item.get("categoryName") or "")).lower()
    return any(k in t for k in _NOISE)

def _instagram(item):
    site = (item.get("website") or "").lower()
    if "instagram.com" in site: return item.get("website","")
    for s in (item.get("socialMedia") or []):
        u = (s.get("url") or s.get("link") or "") if isinstance(s,dict) else str(s)
        if "instagram" in u.lower(): return u
    return ""

# ── Jobs ─────────────────────────────────────────────────────────────────────
jobs = {}

def run_search(job_id, token, location, keywords):
    client = ApifyClient(token)
    jobs[job_id]["progress"] = f"Buscando no Google Maps…"
    results = []
    try:
        run = client.actor("compass/crawler-google-places").call(run_input={
            "searchStringsArray": keywords,
            "locationQuery": location,
            "maxCrawledPlacesPerSearch": MAX_LEADS,
            "language": "pt-BR",
        })
        if run:
            items = client.dataset(run["defaultDatasetId"]).list_items().items
            seen = set()
            for item in items:
                title = (item.get("title") or "").strip()
                if not title or not (item.get("phone") or item.get("website")):
                    continue
                if _is_noise(item): continue
                key = title.lower()
                if key in seen: continue
                seen.add(key)
                item["_instagram"] = _instagram(item)
                results.append(item)
    except Exception as e:
        jobs[job_id]["error"] = str(e)

    jobs[job_id]["status"]   = "done"
    jobs[job_id]["results"]  = results
    jobs[job_id]["progress"] = f"Concluído — {len(results)} empresas encontradas."

# ─────────────────────────────────────────────────────────────────────────────
HTML = r"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Gerador de Leads B2B</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#f5f6fa;
  --card:#ffffff;
  --border:#eaecf0;
  --primary:#2563eb;
  --primary-d:#1d4ed8;
  --text:#111827;
  --muted:#6b7280;
  --green:#16a34a;
  --radius:16px;
  --shadow:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.04);
  --shadow-md:0 4px 16px rgba(0,0,0,.10);
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
a{text-decoration:none}

/* ── Header ── */
.header{
  background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);
  padding:28px 20px 80px;
  text-align:center;
  position:relative;
}
.header h1{color:#fff;font-size:1.5rem;font-weight:800;letter-spacing:-.5px}
.header p{color:#bfdbfe;font-size:.85rem;margin-top:4px}

/* ── Search Card ── */
.search-card{
  background:var(--card);
  border-radius:var(--radius);
  box-shadow:var(--shadow-md);
  padding:20px;
  margin:-52px 16px 0;
  position:relative;
  z-index:10;
}

/* CNAE input */
.cnae-wrap{position:relative;margin-bottom:12px}
.cnae-wrap .icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:18px;pointer-events:none}
#cnae-input{
  width:100%;
  padding:14px 14px 14px 44px;
  border:2px solid var(--border);
  border-radius:12px;
  font-size:.95rem;
  font-family:inherit;
  color:var(--text);
  outline:none;
  transition:border-color .2s;
  background:#fff;
}
#cnae-input:focus{border-color:var(--primary)}
#cnae-input::placeholder{color:#9ca3af}

/* Autocomplete */
.autocomplete{
  position:absolute;top:calc(100% + 4px);left:0;right:0;
  background:#fff;border-radius:12px;
  box-shadow:0 8px 32px rgba(0,0,0,.15);
  overflow:hidden;z-index:100;
  max-height:320px;overflow-y:auto;
  border:1px solid var(--border);
}
.ac-group-label{
  padding:8px 14px 4px;
  font-size:10px;font-weight:700;
  text-transform:uppercase;letter-spacing:.8px;
  color:var(--muted);background:#f9fafb;
  border-bottom:1px solid var(--border);
}
.ac-item{
  display:flex;align-items:center;gap:12px;
  padding:11px 14px;cursor:pointer;
  border-bottom:1px solid #f3f4f6;
  transition:background .1s;
}
.ac-item:hover,.ac-item.active{background:#eff6ff}
.ac-item:last-child{border-bottom:none}
.ac-badge{
  font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;
  flex-shrink:0;white-space:nowrap;
}
.badge-ind{background:#dbeafe;color:#1d4ed8}
.badge-imp{background:#ede9fe;color:#6d28d9}
.badge-ata{background:#d1fae5;color:#065f46}
.badge-out{background:#f3f4f6;color:#6b7280}
.ac-name{font-size:.87rem;font-weight:500;color:var(--text);flex:1;min-width:0}
.ac-code{font-size:11px;color:var(--muted);flex-shrink:0}

/* State select */
#state-select{
  width:100%;padding:12px 14px;
  border:2px solid var(--border);border-radius:12px;
  font-size:.9rem;font-family:inherit;color:var(--text);
  background:#fff;outline:none;cursor:pointer;
  -webkit-appearance:none;appearance:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 14px center;
  margin-bottom:14px;
}
#state-select:focus{border-color:var(--primary)}

/* Filters row */
.filter-chips{
  display:flex;gap:8px;overflow-x:auto;margin-bottom:14px;
  padding-bottom:2px;scrollbar-width:none;
}
.filter-chips::-webkit-scrollbar{display:none}
.chip{
  flex-shrink:0;
  padding:6px 14px;border-radius:20px;
  font-size:12px;font-weight:600;cursor:pointer;
  border:1.5px solid var(--border);
  background:#fff;color:var(--muted);
  transition:all .15s;white-space:nowrap;
}
.chip.active{background:var(--primary);color:#fff;border-color:var(--primary)}
.chip:hover:not(.active){background:#f0f5ff;border-color:var(--primary);color:var(--primary)}

/* Search button */
.btn-buscar{
  width:100%;padding:15px;
  background:var(--primary);color:#fff;
  border:none;border-radius:12px;
  font-size:1rem;font-weight:700;
  font-family:inherit;cursor:pointer;
  display:flex;align-items:center;justify-content:center;gap:8px;
  transition:background .2s,transform .1s;
  box-shadow:0 4px 12px rgba(37,99,235,.3);
}
.btn-buscar:hover{background:var(--primary-d)}
.btn-buscar:active{transform:scale(.98)}
.btn-buscar:disabled{background:#93c5fd;cursor:not-allowed;transform:none}

/* ── Selected tag ── */
.selected-cnae{
  display:flex;align-items:center;justify-content:space-between;
  background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;
  padding:10px 14px;margin-bottom:12px;
}
.selected-cnae .name{font-size:.9rem;font-weight:600;color:var(--primary)}
.selected-cnae .code{font-size:11px;color:#60a5fa}
.selected-cnae button{background:none;border:none;cursor:pointer;color:#93c5fd;font-size:16px;line-height:1}
.selected-cnae button:hover{color:#2563eb}

/* ── Progress ── */
#progress-section{display:none;padding:20px 16px 0}
.progress-card{background:var(--card);border-radius:var(--radius);padding:18px 20px;box-shadow:var(--shadow)}
.spinner{width:20px;height:20px;border:2.5px solid #bfdbfe;border-top-color:var(--primary);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.progress-bar-wrap{background:#e0e7ff;border-radius:8px;height:5px;margin-top:12px;overflow:hidden}
.progress-bar-inner{height:100%;background:var(--primary);border-radius:8px;transition:width .4s ease;animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}

/* ── Results ── */
#results-section{display:none;padding:20px 16px}
.results-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.results-header h2{font-size:1rem;font-weight:700}
.count-badge{background:var(--primary);color:#fff;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700}
.btn-excel{
  background:#16a34a;color:#fff;border:none;border-radius:10px;
  padding:9px 16px;font-size:12px;font-weight:700;
  font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:6px;
  transition:background .2s;
}
.btn-excel:hover{background:#15803d}

/* Filter bar */
.result-filter{
  background:var(--card);border-radius:12px;padding:12px;margin-bottom:14px;
  box-shadow:var(--shadow);display:flex;gap:8px;align-items:center;
}
.result-filter input{
  flex:1;border:none;outline:none;font-size:.88rem;font-family:inherit;
  color:var(--text);background:transparent;min-width:0;
}
.result-filter input::placeholder{color:#9ca3af}
.result-filter svg{color:var(--muted);flex-shrink:0}

/* ── Cards ── */
.lead-card{
  background:var(--card);border-radius:var(--radius);
  box-shadow:var(--shadow);margin-bottom:12px;
  overflow:hidden;transition:box-shadow .2s;
}
.lead-card:hover{box-shadow:var(--shadow-md)}
.lead-card-body{padding:16px}
.lead-card h3{font-size:.97rem;font-weight:700;color:var(--text);margin-bottom:3px;line-height:1.3}
.lead-category{font-size:.78rem;color:var(--muted);margin-bottom:10px;display:flex;align-items:center;gap:5px}
.lead-location{font-size:.82rem;color:var(--muted);display:flex;align-items:center;gap:5px;margin-bottom:12px}
.lead-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.lead-actions a,.lead-actions button{
  display:flex;align-items:center;justify-content:center;gap:5px;
  padding:9px 10px;border-radius:10px;
  font-size:.8rem;font-weight:600;font-family:inherit;
  cursor:pointer;border:none;transition:opacity .15s;
  text-decoration:none;
}
.lead-actions a:hover,.lead-actions button:hover{opacity:.85}
.btn-wa {background:#22c55e;color:#fff}
.btn-tel{background:#3b82f6;color:#fff}
.btn-site{background:#8b5cf6;color:#fff}
.btn-maps{background:#f59e0b;color:#fff}
.btn-na{background:#f3f4f6;color:#9ca3af;cursor:default}
.btn-na:hover{opacity:1}

/* ── Empty / error ── */
.empty-state{text-align:center;padding:40px 20px;color:var(--muted)}
.empty-state svg{opacity:.3;margin-bottom:12px}
.empty-state p{font-size:.9rem}

/* ── Bottom padding ── */
.pb{height:40px}
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <h1>🎯 Gerador de Leads B2B</h1>
  <p>Encontre fabricantes, atacadistas e importadores</p>
</div>

<!-- Search Card -->
<div style="padding:0 0 20px">
<div class="search-card">

  <!-- CNAE search -->
  <div class="cnae-wrap" id="cnae-wrap">
    <span class="icon">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    </span>
    <input id="cnae-input" type="text" autocomplete="off" spellcheck="false"
           placeholder="Toque para ver todos os CNAEs…"
           oninput="onCnaeInput()" onfocus="if(!selectedCnae) onCnaeInput()">
    <div class="autocomplete" id="autocomplete" style="display:none"></div>
  </div>

  <!-- Selected CNAE tag -->
  <div class="selected-cnae" id="selected-wrap" style="display:none">
    <div>
      <div class="name" id="sel-name"></div>
      <div class="code" id="sel-code"></div>
    </div>
    <button onclick="clearCnae()" title="Remover">✕</button>
  </div>

  <!-- State -->
  <select id="state-select">
    <option value="">📍 Selecione o estado…</option>
    __STATES__
  </select>

  <!-- Search button -->
  <button class="btn-buscar" id="btn-buscar" onclick="startSearch()">
    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    Buscar empresas
  </button>
</div>
</div>

<!-- Progress -->
<div id="progress-section">
  <div class="progress-card">
    <div style="display:flex;align-items:center;gap:12px">
      <div class="spinner"></div>
      <div>
        <div style="font-weight:600;font-size:.9rem" id="progress-text">Consultando Google Maps…</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:2px">Isso pode levar 30–90 segundos</div>
      </div>
    </div>
    <div class="progress-bar-wrap"><div class="progress-bar-inner" id="prog-bar" style="width:8%"></div></div>
  </div>
</div>

<!-- Results -->
<div id="results-section">
  <div class="results-header">
    <h2>Empresas encontradas</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <span class="count-badge" id="count-badge">0</span>
      <button class="btn-excel" onclick="exportExcel()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Excel
      </button>
    </div>
  </div>

  <!-- Dynamic type chips -->
  <div class="filter-chips" id="type-chips" style="margin-bottom:12px"></div>

  <!-- Filter bar -->
  <div class="result-filter">
    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    <input type="text" id="filter-input" placeholder="Filtrar por nome, cidade, categoria…" oninput="filterCards()">
  </div>

  <!-- Cards -->
  <div id="cards-container"></div>

  <!-- Load more -->
  <button id="btn-load-more" onclick="loadMore()" style="display:none;width:100%;margin:16px 0 4px;padding:16px;background:var(--primary);color:#fff;border:none;border-radius:12px;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;align-items:center;justify-content:center;gap:8px;transition:all .2s;box-shadow:0 4px 12px rgba(37,99,235,.3)">
    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
    ⬇ Carregar mais resultados
  </button>
  <div class="pb"></div>
</div>

<script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
<script>
// ─── CNAE Database ───────────────────────────────────────────────────────────
// cat: ind=Indústria, imp=Importador, ata=Atacadista, out=Outros
const CNAES = [
  // ── INDÚSTRIA / FÁBRICA ──────────────────────────────────────────────────
  {code:"10.11-2",name:"Abate e preparação de reses (exceto suínos)",cat:"ind",kw:["frigorifico bovino","abatedouro bovino"]},
  {code:"10.12-0",name:"Abate de aves e preparação de carnes de aves",cat:"ind",kw:["abatedouro de frango","frigorifico de aves"]},
  {code:"10.13-9",name:"Fabricação de produtos de carne",cat:"ind",kw:["fabricante de embutidos","fabrica de linguica","industria de frios"]},
  {code:"10.20-1",name:"Preservação de pescado e fabricação de subprodutos",cat:"ind",kw:["industria de pescados","fabrica de conservas de peixe"]},
  {code:"10.31-7",name:"Fabricação de conservas de frutas",cat:"ind",kw:["fabricante de conservas de frutas","industria de polpa de fruta"]},
  {code:"10.33-3",name:"Fabricação de sucos de frutas e legumes",cat:"ind",kw:["fabricante de suco","industria de suco de fruta","fabrica de suco"]},
  {code:"10.41-4",name:"Fabricação de óleos vegetais em bruto",cat:"ind",kw:["industria de oleo vegetal","fabricante de oleo de soja"]},
  {code:"10.42-2",name:"Fabricação de óleos vegetais refinados",cat:"ind",kw:["industria de oleo refinado","fabrica de azeite"]},
  {code:"10.51-1",name:"Fabricação de laticínios — leite e derivados",cat:"ind",kw:["industria de laticinios","fabricante de queijo","fabrica de iogurte"]},
  {code:"10.61-9",name:"Beneficiamento de arroz e fabricação de produtos",cat:"ind",kw:["beneficiadora de arroz","industria de cereais"]},
  {code:"10.63-5",name:"Fabricação de farinha de mandioca e derivados",cat:"ind",kw:["fabrica de farinha de mandioca","industria de tapioca"]},
  {code:"10.66-0",name:"Fabricação de amidos e féculas de vegetais",cat:"ind",kw:["fabricante de amido","industria de fecula"]},
  {code:"10.71-6",name:"Fabricação de açúcar em bruto",cat:"ind",kw:["usina de acucar","fabricante de acucar"]},
  {code:"10.81-3",name:"Torrefação e moagem de café",cat:"ind",kw:["torrefadora de cafe","fabrica de cafe","industria cafeeira"]},
  {code:"10.82-1",name:"Fabricação de produtos à base de cacau, chocolates",cat:"ind",kw:["fabrica de chocolate","industria de cacau","fabricante de chocolate"]},
  {code:"10.91-0",name:"Fabricação de produtos alimentícios para animais",cat:"ind",kw:["fabrica de racao","industria de racao animal","fabricante de racao pet"]},
  {code:"10.94-5",name:"Fabricação de massas alimentícias",cat:"ind",kw:["fabrica de macarrao","industria de massas","fabricante de massa alimenticia"]},
  {code:"10.95-3",name:"Fabricação de especiarias, molhos e temperos",cat:"ind",kw:["fabrica de tempero","industria de condimentos","fabricante de tempero","marca de tempero"]},
  {code:"10.96-1",name:"Fabricação de alimentos e pratos prontos",cat:"ind",kw:["fabrica de refeicoes prontas","industria de alimentos prontos"]},
  {code:"10.99-6",name:"Fabricação de outros produtos alimentícios",cat:"ind",kw:["industria alimenticia","fabricante de alimentos"]},
  {code:"11.11-3",name:"Fabricação de aguardente e outras bebidas destiladas",cat:"ind",kw:["destilaria de cachaca","fabricante de aguardente","industria de bebidas destiladas"]},
  {code:"11.12-1",name:"Fabricação de cerveja e chope",cat:"ind",kw:["cervejaria artesanal","fabrica de cerveja","industria cervejeira"]},
  {code:"11.13-0",name:"Fabricação de vinho",cat:"ind",kw:["vinícola","fabricante de vinho","industria vinicola"]},
  {code:"11.21-6",name:"Fabricação de refrescos e outras bebidas não alcoólicas",cat:"ind",kw:["fabrica de refrescos","industria de bebidas","fabricante de drinks"]},
  {code:"11.22-9",name:"Fabricação de águas envasadas e gaseificadas",cat:"ind",kw:["fabricante de agua mineral","agua de coco fabricante","kombucha fabricante"]},
  {code:"13.11-1",name:"Preparação e fiação de fibras têxteis de algodão",cat:"ind",kw:["industria textil","fabrica de fio","fiacao de algodao"]},
  {code:"13.21-9",name:"Tecelagem de fios de algodão",cat:"ind",kw:["tecelagem de algodao","fabrica de tecido","industria textil"]},
  {code:"14.11-8",name:"Confecção de roupas íntimas",cat:"ind",kw:["fabrica de lingerie","industria de roupas intimas","confeccao de moda intima"]},
  {code:"14.12-6",name:"Confecção de peças do vestuário",cat:"ind",kw:["confeccao de roupas","fabrica de camisas","industria de vestuario"]},
  {code:"15.10-6",name:"Curtimento e outras preparações de couro",cat:"ind",kw:["curtume","industria coureira","fabrica de couro"]},
  {code:"15.21-1",name:"Fabricação de artigos para viagem e bolsas",cat:"ind",kw:["fabrica de bolsas","industria de malas","fabricante de acessorios de couro"]},
  {code:"15.31-9",name:"Fabricação de calçados de couro",cat:"ind",kw:["fabrica de calçados","industria calcadista","fabricante de sapato"]},
  {code:"20.11-8",name:"Fabricação de cloro e álcalis",cat:"ind",kw:["industria quimica","fabrica de alcalis","industria de cloro"]},
  {code:"20.61-4",name:"Fabricação de sabões, detergentes e produtos de limpeza",cat:"ind",kw:["fabrica de detergente","industria de limpeza","fabricante de produtos de limpeza","fabrica de saneantes"]},
  {code:"20.62-2",name:"Fabricação de produtos de higiene pessoal",cat:"ind",kw:["fabrica de cosmeticos","industria de higiene","fabricante de creme","fabrica de shampoo"]},
  {code:"20.91-6",name:"Fabricação de adesivos e selantes",cat:"ind",kw:["fabrica de adesivo","industria de cola","fabricante de selante"]},
  {code:"21.10-6",name:"Fabricação de produtos farmoquímicos",cat:"ind",kw:["industria farmaceutica","fabrica de medicamentos","industria quimico-farmaceutica"]},
  {code:"21.21-1",name:"Fabricação de medicamentos para uso humano",cat:"ind",kw:["laboratorio farmaceutico","fabrica de medicamentos","fabricante de remedios"]},
  {code:"22.21-8",name:"Fabricação de embalagens plásticas",cat:"ind",kw:["fabrica de embalagem plastica","industria de plastico","fabricante de embalagem"]},
  {code:"23.20-3",name:"Fabricação de cimento",cat:"ind",kw:["fabrica de cimento","industria cimenteira","cimenteira"]},
  {code:"23.91-3",name:"Fabricação de abrasivos",cat:"ind",kw:["fabrica de lixa","industria de abrasivos"]},
  {code:"25.99-3",name:"Fabricação de outros produtos de metal",cat:"ind",kw:["metalurgica","fabrica de pecas metalicas","industria metalurgica"]},
  {code:"28.15-1",name:"Fabricação de aparelhos e equipamentos industriais",cat:"ind",kw:["fabricante de maquinas industriais","industria de equipamentos","fabrica de maquinas"]},
  {code:"31.01-2",name:"Fabricação de móveis com predominância de madeira",cat:"ind",kw:["fabrica de moveis","industria moveleira","fabricante de moveis"]},

  // ── IMPORTADORES ────────────────────────────────────────────────────────
  {code:"46.11-7",name:"Representantes comerciais — matérias-primas",cat:"imp",kw:["importador de materia prima","representante de insumos","importadora de commodities"]},
  {code:"46.12-5",name:"Representantes comerciais — combustíveis e lubrificantes",cat:"imp",kw:["importador de combustivel","representante de lubrificante"]},
  {code:"46.13-3",name:"Representantes comerciais — madeira e material de construção",cat:"imp",kw:["importador de madeira","representante de material de construcao"]},
  {code:"46.14-1",name:"Representantes comerciais — máquinas e equipamentos",cat:"imp",kw:["importador de maquinas","representante de equipamentos industriais"]},
  {code:"46.15-0",name:"Representantes comerciais — eletrodomésticos",cat:"imp",kw:["importador de eletrodomestico","representante de eletrônicos"]},
  {code:"46.16-8",name:"Representantes comerciais — têxteis e confecções",cat:"imp",kw:["importador de tecido","representante comercial textil"]},
  {code:"46.17-6",name:"Representantes comerciais — alimentos, bebidas e fumo",cat:"imp",kw:["importador de alimentos","importadora de bebidas","importador de alimento importado"]},
  {code:"46.18-4",name:"Representantes comerciais — outros produtos especializados",cat:"imp",kw:["importadora especializada","representante comercial especializado"]},
  {code:"46.84-2",name:"Comércio atacadista de produtos químicos e petroquímicos",cat:"imp",kw:["importador de quimicos","importadora de produtos quimicos","distribuidor de produtos quimicos"]},
  {code:"46.86-9",name:"Comércio atacadista de embalagens",cat:"imp",kw:["importador de embalagem","importadora de embalagens","distribuidora de embalagens"]},
  {code:"46.87-7",name:"Comércio atacadista de matérias-primas em geral",cat:"imp",kw:["importador de materia prima","importadora geral","trading company"]},

  // ── ATACADISTAS ──────────────────────────────────────────────────────────
  {code:"46.21-4",name:"Comércio atacadista de alimentos em geral",cat:"ata",kw:["atacadista de alimentos","distribuidor de alimentos","distribuidora alimentar"]},
  {code:"46.22-2",name:"Comércio atacadista de cereais, leguminosas e sementes",cat:"ata",kw:["atacadista de graos","distribuidor de cereais","distribuidora de sementes"]},
  {code:"46.23-1",name:"Comércio atacadista de leite e laticínios",cat:"ata",kw:["atacadista de laticinios","distribuidor de queijo","distribuidora de laticinio"]},
  {code:"46.31-1",name:"Comércio atacadista de frutas, verduras e hortaliças",cat:"ata",kw:["atacadista de hortifruti","distribuidor de frutas","ceasinha atacado"]},
  {code:"46.32-0",name:"Comércio atacadista de carnes e derivados",cat:"ata",kw:["atacadista de carnes","distribuidor de frios","distribuidora de frios e laticinios"]},
  {code:"46.33-8",name:"Comércio atacadista de pescados",cat:"ata",kw:["atacadista de pescados","distribuidor de peixes","distribuidora de frutos do mar"]},
  {code:"46.35-4",name:"Comércio atacadista de bebidas",cat:"ata",kw:["atacadista de bebidas","distribuidor de cerveja","distribuidora de refrigerante"]},
  {code:"46.37-1",name:"Comércio atacadista de sorvetes",cat:"ata",kw:["atacadista de sorvete","distribuidor de sorvete"]},
  {code:"46.41-9",name:"Comércio atacadista de tecidos, artefatos de tecido",cat:"ata",kw:["atacadista textil","distribuidor de tecidos","atacado de tecidos"]},
  {code:"46.49-4",name:"Comércio atacadista de outros artigos de uso pessoal",cat:"ata",kw:["atacadista de artigos","distribuidor de brindes","atacado de presentes"]},
  {code:"46.51-6",name:"Comércio atacadista de componentes eletrônicos",cat:"ata",kw:["atacadista de eletronicos","distribuidor de componentes eletronicos"]},
  {code:"46.61-3",name:"Comércio atacadista de máquinas, aparelhos e equipamentos",cat:"ata",kw:["atacadista de maquinas","distribuidor de equipamentos","centro de distribuicao de maquinas"]},
  {code:"46.71-0",name:"Comércio atacadista de madeira e produtos derivados",cat:"ata",kw:["atacadista de madeira","distribuidor de madeira","madeireira atacado"]},
  {code:"46.81-8",name:"Comércio atacadista de combustíveis sólidos, líquidos e gasosos",cat:"ata",kw:["distribuidora de combustivel","atacadista de combustivel","distribuidora de gas"]},
  {code:"46.83-4",name:"Comércio atacadista de defensivos agrícolas, fertilizantes",cat:"ata",kw:["atacadista agricola","distribuidor de agroquimicos","distribuidora de fertilizante"]},
  {code:"46.85-0",name:"Comércio atacadista de resíduos e sucatas",cat:"ata",kw:["atacadista de sucata","reciclagem atacado","distribuidor de residuos"]},
  {code:"46.91-5",name:"Comércio atacadista de mercadorias em geral",cat:"ata",kw:["atacado geral","distribuidor geral","central de distribuicao"]},

  // ── AGRONEGÓCIO ──────────────────────────────────────────────────────────
  {code:"01.11-3",name:"Cultivo de trigo e outros cereais",cat:"ind",kw:["produtor de trigo","agricultor de cereais","fazenda de graos"]},
  {code:"01.13-0",name:"Cultivo de cana-de-açúcar",cat:"ind",kw:["usina de cana","produtor de cana de acucar","fazenda de cana"]},
  {code:"01.15-6",name:"Cultivo de soja",cat:"ind",kw:["produtor de soja","fazenda de soja","armazem de soja"]},
  {code:"01.22-9",name:"Cultivo de uva",cat:"ind",kw:["viticultor","produtor de uva","vinicultor"]},
  {code:"01.31-8",name:"Horticultura — legumes e tubérculos",cat:"ind",kw:["produtor de hortifruti","agricultor de legumes","propriedade rural de legumes"]},
  {code:"01.41-5",name:"Pecuária — bovinos para corte",cat:"ind",kw:["pecuarista de corte","fazenda de gado","criador de bovinos"]},
  {code:"01.42-3",name:"Pecuária — bovinos para leite",cat:"ind",kw:["produtor de leite","fazenda leiteira","pecuaria leiteira"]},
  {code:"01.51-2",name:"Criação de suínos",cat:"ind",kw:["suinocultor","criador de porcos","granja de suinos"]},
  {code:"01.55-5",name:"Criação de aves — frangos",cat:"ind",kw:["avicultor","criador de frango","granja de frangos"]},
  {code:"01.61-0",name:"Atividades de apoio à agricultura",cat:"out",kw:["cooperativa agricola","armazem rural","beneficiamento agricola"]},

  // ── CONSTRUÇÃO CIVIL ─────────────────────────────────────────────────────
  {code:"41.20-4",name:"Construção de edifícios",cat:"out",kw:["construtora","incorporadora","construtora de imoveis"]},
  {code:"43.11-8",name:"Demolição e preparação do terreno",cat:"out",kw:["empresa de demolicao","terraplanagem","nivelamento de terreno"]},
  {code:"43.21-5",name:"Instalações elétricas",cat:"out",kw:["eletricista","instaladora eletrica","empresa de instalacao eletrica"]},
  {code:"43.22-3",name:"Instalações hidráulicas, de esgoto e gás",cat:"out",kw:["encanador","instaladora hidraulica","empresa de encanamento"]},
  {code:"43.30-4",name:"Acabamentos em geral — pintura, forro, piso",cat:"out",kw:["empresa de acabamento","pintora","empresa de reformas"]},
  {code:"23.30-3",name:"Fabricação de artefatos de cimento, concreto e gesso",cat:"ind",kw:["fabrica de pre-moldados","fabricante de bloco de concreto","industria de artefatos de cimento"]},
  {code:"23.91-3",name:"Aparelhamento e outros trabalhos em pedras",cat:"ind",kw:["marmoraria","granito","fabrica de pedras ornamentais"]},

  // ── PAPEL, EMBALAGEM E IMPRESSÃO ─────────────────────────────────────────
  {code:"17.10-9",name:"Fabricação de celulose e outras pastas",cat:"ind",kw:["fabrica de celulose","industria de papel","industria papeleira"]},
  {code:"17.21-4",name:"Fabricação de papel — caixas e embalagens",cat:"ind",kw:["fabrica de caixa de papelao","industria de embalagem de papel","fabricante de papelao"]},
  {code:"18.11-3",name:"Impressão de jornais, livros e revistas",cat:"ind",kw:["grafica","editora","industria grafica"]},
  {code:"18.13-0",name:"Impressão e serviços para gráfica em geral",cat:"ind",kw:["grafica comercial","impressao digital","servicos graficos"]},

  // ── BORRACHA E PLÁSTICOS ─────────────────────────────────────────────────
  {code:"22.11-1",name:"Fabricação de pneumáticos e câmaras-de-ar",cat:"ind",kw:["fabrica de pneu","industria de pneumaticos","fabricante de camara de ar"]},
  {code:"22.19-6",name:"Fabricação de outros produtos de borracha",cat:"ind",kw:["fabrica de borracha","industria de artefatos de borracha","fabricante de vedacoes"]},
  {code:"22.29-3",name:"Fabricação de outros artigos de plástico",cat:"ind",kw:["fabrica de plastico","industria de artefatos plasticos","fabricante de utilidades plasticas"]},

  // ── METALMECÂNICA E AUTOPEÇAS ─────────────────────────────────────────────
  {code:"24.11-3",name:"Produção de ferro-gusa e aço",cat:"ind",kw:["siderurgica","aciaria","industria siderurgica"]},
  {code:"24.51-2",name:"Fundição de ferro e aço",cat:"ind",kw:["fundição","fundicao de ferro","industria de fundição"]},
  {code:"25.10-5",name:"Fabricação de estruturas metálicas e obras de caldeiraria pesada",cat:"ind",kw:["estrutura metalica","caldeiraria","fabricante de estrutura de aco"]},
  {code:"25.32-6",name:"Fabricação de artefatos de cutelaria",cat:"ind",kw:["fabrica de faca","industria cutelaria","fabricante de talher"]},
  {code:"29.41-7",name:"Fabricação de peças e acessórios para veículos automotores",cat:"ind",kw:["fabrica de autopecas","industria de autopecas","fabricante de pecas automotivas"]},
  {code:"29.45-0",name:"Fabricação de material elétrico e eletrônico para veículos",cat:"ind",kw:["fabrica de eletrica automotiva","fabricante de chicote eletrico","industria automotiva eletrica"]},
  {code:"33.11-2",name:"Manutenção e reparação de máquinas e equipamentos industriais",cat:"out",kw:["manutencao industrial","mecanica industrial","empresa de manutencao de maquinas"]},

  // ── ELÉTRICA E ELETRÔNICA ─────────────────────────────────────────────────
  {code:"26.10-8",name:"Fabricação de componentes eletrônicos",cat:"ind",kw:["fabrica de componentes eletronicos","industria de placa eletronica","fabricante de circuito impresso"]},
  {code:"26.40-0",name:"Fabricação de receptores de rádio e televisão",cat:"ind",kw:["fabrica de eletronicos","industria de audio e video","fabricante de receptores"]},
  {code:"27.10-4",name:"Fabricação de geradores, transformadores e motores elétricos",cat:"ind",kw:["fabrica de transformador","industria de motores eletricos","fabricante de gerador"]},
  {code:"27.90-2",name:"Fabricação de equipamentos e aparelhos elétricos",cat:"ind",kw:["fabrica de equipamentos eletricos","industria eletrica","fabricante de paineis eletricos"]},

  // ── SAÚDE E HIGIENE ───────────────────────────────────────────────────────
  {code:"32.50-7",name:"Fabricação de instrumentos e materiais para uso médico",cat:"ind",kw:["fabrica de material medico","industria hospitalar","fabricante de produtos medicos"]},
  {code:"46.44-3",name:"Comércio atacadista de medicamentos e drogas",cat:"ata",kw:["distribuidora de medicamentos","atacadista farmaceutico","distribuidor de remedios"]},
  {code:"46.45-1",name:"Comércio atacadista de instrumentos e materiais de uso médico",cat:"ata",kw:["distribuidora hospitalar","atacadista de material medico","distribuidora de produtos hospitalares"]},

  // ── LOGÍSTICA E TRANSPORTE ────────────────────────────────────────────────
  {code:"49.30-2",name:"Transporte rodoviário de carga",cat:"out",kw:["transportadora","empresa de logistica","empresa de transporte de carga"]},
  {code:"52.11-7",name:"Depósitos de mercadorias para terceiros",cat:"out",kw:["armazem geral","deposito logistico","operador logistico"]},
  {code:"52.29-0",name:"Atividades auxiliares de transporte terrestre",cat:"out",kw:["despachante aduaneiro","agente de cargas","freight forwarder"]},
  {code:"52.39-7",name:"Atividades auxiliares dos transportes aquaviários",cat:"out",kw:["agente maritimo","despachante portuario","operador portuario"]},
  {code:"53.10-5",name:"Atividades de Correios",cat:"out",kw:["empresa de entrega","courier","servico de entrega expressa"]},

  // ── TECNOLOGIA E TI ───────────────────────────────────────────────────────
  {code:"62.01-5",name:"Desenvolvimento de programas de computador",cat:"out",kw:["software house","desenvolvimento de software","empresa de tecnologia"]},
  {code:"62.02-3",name:"Desenvolvimento e licenciamento de programas de computador customizáveis",cat:"out",kw:["desenvolvimento de sistema","fabrica de software","empresa de TI"]},
  {code:"62.04-0",name:"Consultoria em tecnologia da informação",cat:"out",kw:["consultoria de TI","empresa de informatica","consultoria em tecnologia"]},
  {code:"63.11-9",name:"Tratamento de dados, provedores de serviços de aplicação",cat:"out",kw:["datacenter","provedor de internet","empresa de cloud"]},

  // ── SERVIÇOS B2B ──────────────────────────────────────────────────────────
  {code:"69.20-6",name:"Atividades de contabilidade, consultoria e auditoria contábil",cat:"out",kw:["escritorio contabil","contabilidade","auditoria contabil"]},
  {code:"70.20-4",name:"Atividades de consultoria em gestão empresarial",cat:"out",kw:["consultoria empresarial","consultoria de gestao","empresa de consultoria"]},
  {code:"71.12-0",name:"Atividades de engenharia e consultorias técnicas",cat:"out",kw:["empresa de engenharia","consultoria tecnica","escritorio de engenharia"]},
  {code:"73.19-0",name:"Publicidade — agências e estúdios",cat:"out",kw:["agencia de publicidade","agencia de marketing","estudio de comunicacao"]},
  {code:"74.90-1",name:"Atividades profissionais científicas e técnicas",cat:"out",kw:["empresa de servicos especializados","consultoria especializada","prestadora de servicos tecnicos"]},
  {code:"81.21-4",name:"Limpeza em prédios e serviços de conservação",cat:"out",kw:["empresa de limpeza","terceirizada de limpeza","servicos de conservacao e limpeza"]},
  {code:"81.29-0",name:"Serviços de controle de pragas, fumigação e dedetização",cat:"out",kw:["empresa de dedetizacao","controle de pragas","fumigacao"]},

  // ── COMÉRCIO ATACADISTA — CONSTRUÇÃO ──────────────────────────────────────
  {code:"46.71-0",name:"Comércio atacadista de madeira e produtos derivados",cat:"ata",kw:["madeireira","atacadista de madeira","distribuidora de madeira"]},
  {code:"46.79-6",name:"Comércio atacadista de outros materiais de construção",cat:"ata",kw:["atacadista de material de construcao","distribuidora de construcao","distribuidor de ceramica"]},
  {code:"46.72-9",name:"Comércio atacadista de ferragens e ferramentas",cat:"ata",kw:["distribuidora de ferragens","atacadista de ferramentas","distribuidora de EPI"]},

  // ── OUTROS ───────────────────────────────────────────────────────────────
  {code:"47.11-3",name:"Comércio varejista de mercadorias em geral — hipermercados",cat:"out",kw:["hipermercado","supermercado atacarejo"]},
  {code:"46.19-2",name:"Comércio atacadista de mercadorias em geral (representantes)",cat:"out",kw:["representante comercial","agente comercial","trading company brasil"]},
  {code:"64.22-1",name:"Bancos múltiplos com carteira comercial",cat:"out",kw:["correspondente bancario","fintech","cooperativa de credito"]},
  {code:"66.22-3",name:"Corretores e agentes de seguros",cat:"out",kw:["corretora de seguros","seguradora","broker de seguros"]},
];

// ─── State ───────────────────────────────────────────────────────────────────
let selectedCnae = null;
let activeType   = "all";
let allLeads     = [];
let currentJob   = null;
let pollTimer    = null;

// ─── Autocomplete ────────────────────────────────────────────────────────────
function catLabel(c){return{ind:"Indústria",imp:"Importador",ata:"Atacadista",out:"Outros"}[c]||c}
function catBadge(c){return{ind:"badge-ind",imp:"badge-imp",ata:"badge-ata",out:"badge-out"}[c]||"badge-out"}

// Priority order for categories
const CAT_ORDER = {ind:0,imp:1,ata:2,out:3};

function matchCnaes(q){
  const query = q.toLowerCase().trim();
  if (!query) return CNAES.slice().sort((a,b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);
  return CNAES
    .filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.code.includes(query) ||
      c.kw.some(k => k.includes(query))
    )
    .sort((a,b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);
}

function onCnaeInput(){
  if (selectedCnae){ clearCnae(); }
  const q = document.getElementById('cnae-input').value;
  const ac = document.getElementById('autocomplete');
  const matches = matchCnaes(q);
  if (!matches.length){ ac.style.display='none'; return; }

  // Group by category
  const groups = {};
  matches.forEach(c => { (groups[c.cat] = groups[c.cat]||[]).push(c); });

  let html = '';
  ['ind','imp','ata','out'].forEach(cat => {
    if (!groups[cat]) return;
    html += `<div class="ac-group-label">${catLabel(cat)}</div>`;
    groups[cat].forEach(c => {
      html += `<div class="ac-item" onclick="selectCnaeByCode('${escJ(c.code)}')">
        <span class="ac-badge ${catBadge(c.cat)}">${catLabel(c.cat)}</span>
        <span class="ac-name">${q.trim() ? highlight(c.name, q) : escH(c.name)}</span>
        <span class="ac-code">${c.code}</span>
      </div>`;
    });
  });
  ac.innerHTML = html;
  ac.style.display = 'block';
}

function highlight(text, q){
  const re = new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return escH(text).replace(re,'<mark style="background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:0 2px">$1</mark>');
}

function selectCnaeByCode(code){
  const c = CNAES.find(x => x.code === code);
  if(!c) return;
  selectedCnae = c;
  document.getElementById('cnae-input').value = '';
  document.getElementById('autocomplete').style.display = 'none';
  document.getElementById('sel-name').textContent = c.name;
  document.getElementById('sel-code').textContent = c.code + ' · ' + catLabel(c.cat);
  document.getElementById('selected-wrap').style.display = 'flex';
  startSearch();
}

function clearCnae(){
  selectedCnae = null;
  document.getElementById('selected-wrap').style.display = 'none';
  document.getElementById('cnae-input').value = '';
  document.getElementById('cnae-input').focus();
}

function buildCityChips(leads){
  const cities = [...new Set(leads.map(l => l.city).filter(Boolean))].sort();
  const wrap = document.getElementById('type-chips');
  wrap.innerHTML = ['Todas'].concat(cities).map(c =>
    `<span class="chip${c==='Todas'?' active':''}" onclick="setCityChip(this,'${escJ(c)}')">${c}</span>`
  ).join('');
  activeType = 'all';
}

function setCityChip(el, city){
  document.querySelectorAll('#type-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  activeType = city === 'Todas' ? 'all' : city;
  filterCards();
}

// Close autocomplete on outside click
document.addEventListener('click', e => {
  if (!document.getElementById('cnae-wrap').contains(e.target))
    document.getElementById('autocomplete').style.display = 'none';
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1).toLowerCase():'';}
function cnaeToApiCode(code){return code.replace(/[.\-\/]/g,'').padEnd(7,'0');}
function isMob(phone){const d=(phone||'').replace(/\D/g,'');return d.length===11&&d[2]==='9';}
function fmtPhone(raw){
  const d=(raw||'').replace(/\D/g,'');
  if(d.length===11)return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if(d.length===10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return raw;
}
function mapCasa(item){
  const name=cap(item.nome_fantasia||'')||cap(item.razao_social||'')||'Empresa';
  const raw=((item.ddd_telefone_1||item.ddd_telefone_2||'').replace(/\D/g,''));
  const city=cap(item.municipio||'');
  const addr=[cap(item.descricao_tipo_de_logradouro||''),cap(item.logradouro||''),item.numero,cap(item.bairro||''),city,item.uf].filter(Boolean).join(', ');
  const email=item.email||'';
  return {
    title:name,
    categoryName:cap(item.cnae_fiscal_descricao||'Empresa'),
    phone:fmtPhone(raw),_raw:raw,
    _mobile:isMob(raw)?raw:'',
    website:email?`mailto:${email}`:'',
    _email:email,
    url:`https://maps.google.com/?q=${encodeURIComponent(name+' '+city+' '+(item.uf||''))}`,
    city,state:item.uf||'',address:addr,_instagram:''
  };
}
function mapGoogle(p, fallbackCategory){
  const name = (p.displayName||{}).text || 'Empresa';
  const raw  = (p.nationalPhoneNumber||'').replace(/\D/g,'');
  const addr = p.formattedAddress || '';
  const parts = addr.split(',');
  const city  = parts.length >= 3 ? cap(parts[parts.length-3].trim()) : '';
  const stRaw = parts.length >= 2 ? parts[parts.length-2].trim() : '';
  const state = stRaw.split('-')[0].trim();
  return {
    title: name,
    categoryName: fallbackCategory || 'Empresa',
    phone: p.nationalPhoneNumber || '',
    _raw: raw,
    _mobile: isMob(raw) ? raw : '',
    website: p.websiteUri || '',
    _email: '',
    url: p.googleMapsUri || `https://maps.google.com/?q=${encodeURIComponent(name)}`,
    city, state, address: addr, _instagram: ''
  };
}
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function escA(s){return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function escJ(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\\'")}

// ─── Search ──────────────────────────────────────────────────────────────────
let savedPageTokens = [];
let savedUf = '';
let savedCnae = null;

async function startSearch(){
  const uf = document.getElementById('state-select').value;
  if(!uf){ alert('Selecione o estado.'); return; }
  if(!selectedCnae){ document.getElementById('cnae-input').focus(); onCnaeInput(); return; }

  savedUf   = uf;
  savedCnae = selectedCnae;
  savedPageTokens = [];
  allLeads  = [];

  document.getElementById('btn-buscar').disabled = true;
  document.getElementById('progress-section').style.display = 'block';
  document.getElementById('results-section').style.display  = 'none';
  document.getElementById('filter-input').value = '';
  document.getElementById('prog-bar').style.width = '10%';
  document.getElementById('progress-text').textContent = uf === 'BR' ? 'Buscando em todo o Brasil… (pode levar 60–120s)' : 'Buscando no Google Maps…';

  await _doSearch({uf, keywords: selectedCnae.kw||[], cnae_name: selectedCnae.name}, true);
  document.getElementById('btn-buscar').disabled = false;
}


async function loadMore(){
  if(!savedPageTokens.length) return;
  const btn = document.getElementById('btn-load-more');
  if(btn) btn.disabled = true;
  document.getElementById('progress-section').style.display = 'block';
  document.getElementById('prog-bar').style.width = '30%';
  document.getElementById('progress-text').textContent = 'Carregando mais resultados…';

  await _doSearch({uf: savedUf, pageTokens: savedPageTokens}, false);
  if(btn) btn.disabled = false;
}

async function _doSearch(body, fresh){
  try{
    document.getElementById('prog-bar').style.width = '65%';
    const res  = await fetch('/api/pesquisa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data = await res.json();
    document.getElementById('prog-bar').style.width = '100%';

    const cnaeLabel = savedCnae ? savedCnae.name : '';
    const newLeads = (data.places||[]).map(p => mapGoogle(p, cnaeLabel));
    if(fresh){
      allLeads = newLeads;
      document.getElementById('filter-input').value = '';
    } else {
      const existPhones = new Set(allLeads.map(l => l._raw).filter(Boolean));
      const existNames  = new Set(allLeads.map(l => l.title.toLowerCase()));
      newLeads.forEach(l => {
        const dup = (l._raw && existPhones.has(l._raw)) || existNames.has(l.title.toLowerCase());
        if(!dup){ allLeads.push(l); existPhones.add(l._raw); existNames.add(l.title.toLowerCase()); }
      });
    }

    savedPageTokens = data.nextPageTokens || [];
    const sc = data.statesCount;
    if(sc && sc > 1) document.getElementById('progress-text').textContent = `Consolidando ${sc} estados…`;

    buildCityChips(allLeads);
    renderCards(allLeads);
    document.getElementById('count-badge').textContent = allLeads.length;
    document.getElementById('progress-section').style.display = 'none';
    document.getElementById('results-section').style.display  = 'block';

    // Show/hide load more button
    const btn = document.getElementById('btn-load-more');
    if(btn) btn.style.display = savedPageTokens.length ? 'flex' : 'none';
  }catch(e){
    document.getElementById('progress-section').style.display = 'none';
    alert('Erro na busca: '+e.message);
  }
}

// ─── Cards ───────────────────────────────────────────────────────────────────
function renderCards(leads){
  const c = document.getElementById('cards-container');
  if(!leads.length){
    c.innerHTML=`<div class="empty-state">
      <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <p>Nenhuma empresa encontrada.<br>Tente outro segmento ou estado.</p>
    </div>`;
    return;
  }
  c.innerHTML = leads.map(l => {
    const city  = l.city||'';
    const state = l.state||'';

    const waBtn = l._mobile
      ? `<a class="btn-wa" href="https://wa.me/55${l._mobile}" target="_blank">
           <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
           WhatsApp</a>`
      : `<span class="btn-na">Sem WhatsApp</span>`;

    const telBtn = l.phone
      ? `<a class="btn-tel" href="tel:${l._raw}">
           <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.94-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
           Ligar</a>`
      : `<span class="btn-na">Sem telefone</span>`;

    const mapsBtn = `<a class="btn-maps" href="${escA(l.url)}" target="_blank">
           <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
           Rota</a>`;

    return `<div class="lead-card" data-name="${escA((l.title||'').toLowerCase())}" data-addr="${escA((l.address||'').toLowerCase())}" data-cat="${escA((l.categoryName||'').toLowerCase())}" data-city="${escA((l.city||'').toLowerCase())}">
      <div class="lead-card-body">
        <h3>${escH(l.title||'')}</h3>
        <div class="lead-category">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          ${escH(l.categoryName||'Sem categoria')}
        </div>
        <div class="lead-location">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${escH(city)}${state?' — '+escH(state):''}
          ${l.phone?` · <strong>${escH(l.phone)}</strong>`:''}
        </div>
        <div class="lead-actions">
          ${waBtn}${telBtn}${l.website?`<a class="btn-site" href="${escA(l.website)}" target="_blank"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Site</a>`:`<span class="btn-na">Sem site</span>`}${mapsBtn}
        </div>
      </div>
    </div>`;
  }).join('');
  document.getElementById('count-badge').textContent = leads.length;
}

function filterCards(){
  const q = document.getElementById('filter-input').value.toLowerCase();
  let vis = 0;
  document.querySelectorAll('.lead-card').forEach(card => {
    const d = card.dataset;
    const matchText = !q || d.name.includes(q) || d.addr.includes(q) || d.cat.includes(q);
    const matchCity = activeType === 'all' || d.city === activeType.toLowerCase();
    card.style.display = (matchText && matchCity) ? '' : 'none';
    if(matchText && matchCity) vis++;
  });
  document.getElementById('count-badge').textContent = vis;
}

function exportExcel(){
  if(!allLeads.length){ alert('Nenhum lead para exportar.'); return; }
  const rows = [['#','Nome','Categoria','Cidade','Estado','Telefone','WhatsApp','Rota']];
  allLeads.forEach((l,i) => {
    rows.push([i+1,l.title,l.categoryName,l.city,l.state,l.phone,l._mobile?`https://wa.me/55${l._mobile}`:'',l.url]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:4},{wch:34},{wch:28},{wch:18},{wch:6},{wch:18},{wch:32},{wch:36}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  XLSX.writeFile(wb, `leads_${new Date().toISOString().slice(0,10)}.xlsx`);
}
</script>
</body>
</html>"""

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    brasil = '<option value="BR">🇧🇷 Brasil inteiro</option>'
    opts = brasil + "\n" + "\n".join(
        f'<option value="{uf}"{"  selected" if uf=="ES" else ""}>{uf} — {n}</option>'
        for uf, n in BRAZIL_STATES
    )
    return HTML.replace("__STATES__", opts)


@app.route("/api/start", methods=["POST"])
def start():
    data     = request.json or {}
    job_id   = str(uuid.uuid4())[:8]
    token    = data.get("token") or APIFY_TOKEN
    location = data.get("location", "Espírito Santo, Brazil")
    keywords = data.get("keywords", [])
    jobs[job_id] = {"status":"running","progress":"Iniciando…","results":[]}
    t = threading.Thread(target=run_search, args=(job_id, token, location, keywords))
    t.daemon = True
    t.start()
    return jsonify({"job_id": job_id})


@app.route("/api/status/<job_id>")
def status(job_id):
    j = jobs.get(job_id)
    if not j: return jsonify({"status":"not_found"}), 404
    return jsonify({"status":j["status"],"progress":j.get("progress",""),"count":len(j.get("results",[]))})


@app.route("/api/results/<job_id>")
def results(job_id):
    j = jobs.get(job_id)
    if not j: return jsonify([]), 404
    return jsonify(j.get("results",[]))


GOOGLE_KEY = "AIzaSyCXXucC_FA4eQiOCap5DEmrjeuNmKxE1yg"
UF_NAMES   = {uf: name for uf, name in BRAZIL_STATES}
FIELDS     = "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri"

# Top cities per state — used to generate city-level queries for more results
TOP_CITIES = {
    "AC":["Rio Branco"],
    "AL":["Maceió","Arapiraca"],
    "AP":["Macapá"],
    "AM":["Manaus"],
    "BA":["Salvador","Feira de Santana","Vitória da Conquista","Camaçari"],
    "CE":["Fortaleza","Caucaia","Juazeiro do Norte","Sobral"],
    "DF":["Brasília"],
    "ES":["Vitória","Vila Velha","Serra","Cariacica"],
    "GO":["Goiânia","Aparecida de Goiânia","Anápolis"],
    "MA":["São Luís","Imperatriz","Timon"],
    "MT":["Cuiabá","Várzea Grande","Rondonópolis"],
    "MS":["Campo Grande","Dourados","Três Lagoas"],
    "MG":["Belo Horizonte","Uberlândia","Contagem","Juiz de Fora","Betim"],
    "PA":["Belém","Ananindeua","Santarém"],
    "PB":["João Pessoa","Campina Grande"],
    "PR":["Curitiba","Londrina","Maringá","Foz do Iguaçu"],
    "PE":["Recife","Caruaru","Olinda","Petrolina"],
    "PI":["Teresina","Parnaíba"],
    "RJ":["Rio de Janeiro","Niterói","São Gonçalo","Duque de Caxias","Nova Iguaçu"],
    "RN":["Natal","Mossoró"],
    "RS":["Porto Alegre","Caxias do Sul","Pelotas","Canoas"],
    "RO":["Porto Velho","Ji-Paraná"],
    "RR":["Boa Vista"],
    "SC":["Florianópolis","Joinville","Blumenau","Chapecó"],
    "SP":["São Paulo","Campinas","Guarulhos","São Bernardo do Campo","Ribeirão Preto","Sorocaba"],
    "SE":["Aracaju"],
    "TO":["Palmas"],
}

# Coordenadas lat/lng de cada cidade — usadas como locationBias na API do Google
CITY_COORDS = {
    "Rio Branco":(-9.9754,-67.8249),"Maceió":(-9.6659,-35.7350),"Arapiraca":(-9.7556,-36.6613),
    "Macapá":(0.0349,-51.0694),"Manaus":(-3.1190,-60.0217),
    "Salvador":(-12.9718,-38.5011),"Feira de Santana":(-12.2664,-38.9663),
    "Vitória da Conquista":(-14.8619,-40.8444),"Camaçari":(-12.6972,-38.3246),
    "Fortaleza":(-3.7172,-38.5431),"Caucaia":(-3.7298,-38.6590),
    "Juazeiro do Norte":(-7.2134,-39.3151),"Sobral":(-3.6869,-40.3509),
    "Brasília":(-15.7942,-47.8825),
    "Vitória":(-20.3155,-40.3128),"Vila Velha":(-20.3297,-40.2922),
    "Serra":(-20.1287,-40.3094),"Cariacica":(-20.2636,-40.4199),
    "Goiânia":(-16.6799,-49.2550),"Aparecida de Goiânia":(-16.8194,-49.2446),"Anápolis":(-16.3281,-48.9528),
    "São Luís":(-2.5307,-44.3068),"Imperatriz":(-5.5248,-47.4916),"Timon":(-5.0949,-42.8355),
    "Cuiabá":(-15.5989,-56.0949),"Várzea Grande":(-15.6461,-56.1349),"Rondonópolis":(-16.4724,-54.6363),
    "Campo Grande":(-20.4697,-54.6201),"Dourados":(-22.2210,-54.8050),"Três Lagoas":(-20.7510,-51.6820),
    "Belo Horizonte":(-19.9167,-43.9345),"Uberlândia":(-18.9146,-48.2767),
    "Contagem":(-19.9317,-44.0536),"Juiz de Fora":(-21.7643,-43.3503),"Betim":(-19.9681,-44.1981),
    "Belém":(-1.4558,-48.5044),"Ananindeua":(-1.3653,-48.3726),"Santarém":(-2.4437,-54.7084),
    "João Pessoa":(-7.1195,-34.8450),"Campina Grande":(-7.2306,-35.8811),
    "Curitiba":(-25.4297,-49.2711),"Londrina":(-23.3045,-51.1696),
    "Maringá":(-23.4205,-51.9330),"Foz do Iguaçu":(-25.5478,-54.5882),
    "Recife":(-8.0539,-34.8811),"Caruaru":(-8.2760,-35.9764),
    "Olinda":(-8.0089,-34.8553),"Petrolina":(-9.3889,-40.5031),
    "Teresina":(-5.0920,-42.8038),"Parnaíba":(-2.9045,-41.7766),
    "Rio de Janeiro":(-22.9068,-43.1729),"Niterói":(-22.8833,-43.1036),
    "São Gonçalo":(-22.8269,-43.0539),"Duque de Caxias":(-22.7856,-43.3116),"Nova Iguaçu":(-22.7592,-43.4514),
    "Natal":(-5.7945,-35.2110),"Mossoró":(-5.1877,-37.3442),
    "Porto Alegre":(-30.0346,-51.2177),"Caxias do Sul":(-29.1680,-51.1793),
    "Pelotas":(-31.7719,-52.3425),"Canoas":(-29.9178,-51.1839),
    "Porto Velho":(-8.7612,-63.9039),"Ji-Paraná":(-10.8879,-61.9489),
    "Boa Vista":(2.8208,-60.6733),
    "Florianópolis":(-27.5954,-48.5480),"Joinville":(-26.3044,-48.8487),
    "Blumenau":(-26.9195,-49.0661),"Chapecó":(-27.1005,-52.6155),
    "São Paulo":(-23.5505,-46.6333),"Campinas":(-22.9099,-47.0626),
    "Guarulhos":(-23.4648,-46.5333),"São Bernardo do Campo":(-23.6939,-46.5650),
    "Ribeirão Preto":(-21.1775,-47.8103),"Sorocaba":(-23.5015,-47.4526),
    "Aracaju":(-10.9472,-37.0731),"Palmas":(-10.2491,-48.3243),
}

def _cors(resp):
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return resp

def _fetch_places(query_text=None, page_token=None, coords=None):
    body = {"languageCode": "pt-BR", "maxResultCount": 20}
    if query_text:  body["textQuery"] = query_text
    if page_token:  body["pageToken"] = page_token
    if coords:
        body["locationBias"] = {
            "circle": {
                "center": {"latitude": coords[0], "longitude": coords[1]},
                "radius": 60000.0   # 60 km — captura a região metropolitana
            }
        }
    try:
        r = http_req.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers={
                "X-Goog-Api-Key": GOOGLE_KEY,
                "X-Goog-FieldMask": FIELDS,
                "Content-Type": "application/json",
            },
            json=body, timeout=15,
        )
        result = r.json()
        return result.get("places", []), result.get("nextPageToken")
    except Exception:
        return [], None

@app.route("/api/pesquisa", methods=["POST", "OPTIONS"])
def pesquisa_google():
    if request.method == "OPTIONS":
        return _cors(make_response())

    data        = request.json or {}
    keywords    = data.get("keywords", [])
    cnae_name   = data.get("cnae_name", "")
    uf          = data.get("uf", "")
    page_tokens = data.get("pageTokens", [])
    state_name  = UF_NAMES.get(uf, uf)

    # Cada task = (query_text, page_token, coords)
    if page_tokens:
        tasks = [(None, pt, None) for pt in page_tokens if pt]
    elif uf == "BR":
        # Brasil inteiro: top cidade de cada estado
        kw_list = keywords if keywords else [cnae_name]
        tasks = [
            (f"{kw} {cities[0]}", None, CITY_COORDS.get(cities[0]))
            for kw in kw_list
            for state_uf, cities in TOP_CITIES.items()
            if cities
        ]
    else:
        kw_list = keywords if keywords else [cnae_name]
        cities  = TOP_CITIES.get(uf, [state_name])[:5]
        # TODOS os keywords × TODAS as cidades + locationBias por coordenada
        tasks = [
            (f"{kw} {city}", None, CITY_COORDS.get(city))
            for kw   in kw_list
            for city in cities
        ]

    seen_phones, seen_names, places, next_tokens_map = set(), set(), [], {}
    max_w = min(len(tasks), 16)

    with ThreadPoolExecutor(max_workers=max_w or 1) as ex:
        futures = {ex.submit(_fetch_places, qt, pt, coords): i for i, (qt, pt, coords) in enumerate(tasks)}
        for f in as_completed(futures):
            i = futures[f]
            ps, nt = f.result()
            next_tokens_map[i] = nt
            for p in ps:
                name  = ((p.get("displayName") or {}).get("text") or "").strip().lower()
                phone = (p.get("nationalPhoneNumber") or "").replace(" ","").replace("-","")
                key = phone if phone else name
                if not key:
                    continue
                if key in seen_phones or (not phone and name in seen_names):
                    continue
                if phone: seen_phones.add(phone)
                if name:  seen_names.add(name)
                places.append(p)

    next_tokens = [next_tokens_map[i] for i in range(len(tasks)) if next_tokens_map.get(i)]
    return _cors(jsonify({"places": places, "total": len(places), "nextPageTokens": next_tokens, "statesCount": len(tasks) if uf == "BR" else 1}))


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 8080))
    is_local = os.environ.get("RAILWAY_ENVIRONMENT") is None
    host = "127.0.0.1" if is_local else "0.0.0.0"
    if is_local:
        import webbrowser
        print(f"✓ Rodando em http://127.0.0.1:{port}")
        webbrowser.open(f"http://127.0.0.1:{port}")
    app.run(debug=False, host=host, port=port, threaded=True)
