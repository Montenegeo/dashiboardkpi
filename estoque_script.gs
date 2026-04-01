// ════════════════════════════════════════════════════════════════
// Montenegro Industria LTDA — Apps Script ESTOQUE
// Script SEPARADO e independente do dashboard comercial.
//
// COMO INSTALAR (script novo, não misturar com o dashboard):
// 1. Acesse script.google.com → "Novo projeto"
// 2. Renomeie para "Montenegro - Estoque"
// 3. Cole TODO este código → Ctrl+S para salvar
// 4. Executar → initEstoquistas() UMA VEZ para criar os usuários
// 5. Implantar → Nova implantação → App da Web
//    → Executar como: Eu | Acesso: Qualquer pessoa
// 6. Copie a URL gerada → cole em estoque.html na variável APPS_URL
// ════════════════════════════════════════════════════════════════

const SCRIPT_VERSION = '2026-03-24-v1-standalone';
const ADMIN_KEY      = 'mnt@admin2026';

// ── Gestão Click API ──────────────────────────────────────────
const GC = {
  url:    'https://api.gestaoclick.com',
  token:  'ce1b0ea8a6b55279c314c1b42575901635bb0fdd',
  secret: '8d6db29f17cd1450b6db9b472e49103e855046d1'
};

// ── Usuários do app de estoque ────────────────────────────────
// Rode initEstoquistas() UMA VEZ no editor para criar os usuários.
// Para adicionar/remover usuários, edite aqui e rode novamente.
function initEstoquistas() {
  const usuarios = {
    'Lucas Montenegro': 'ADM333@',
    'Lidiani Logística': 'MDAA22!',
    'Diogo Gestor':     'DM166H1'
  };
  PropertiesService.getScriptProperties().setProperty('usuarios', JSON.stringify(usuarios));
  Logger.log('✅ Usuários configurados: ' + Object.keys(usuarios).join(', '));
}

// ── Catálogo de produtos ──────────────────────────────────────
const CATALOGO_EST = {
  fardos: [
    { sku:'FAR-PCO38-17G7-120ML-450UN',    label:'FARDO 38MM | 17,7g | 120ML | 450UN',          fator:450, gramatura:'17,7g', gc_nome:'Fardo 120ML (450un)' },
    { sku:'FAR-PCO38-17G7-200ML-300UN',    label:'FARDO 38MM | 17,7g | 200ML | 300UN',          fator:300, gramatura:'17,7g', gc_nome:'Fardo 200ML (300un)' },
    { sku:'FAR-PCO38-19G-300ML-240UN',     label:'FARDO 38MM | 19g | 300ML | 240UN',            fator:240, gramatura:'19g',   gc_nome:'Fardo 300ML (240un)' },
    { sku:'FAR-PCO38-33G-500ML-150UN',     label:'FARDO 38MM | 33g | 500ML | BOCA LARGA | 150UN', fator:150, gramatura:'33g', gc_nome:'Fardo 500ML boca larga' },
    { sku:'FAR-PCO28-24G-300ML-KMBA-300UN',label:'FARDO 28MM | 24g | 300ML | KOMBUCHA | 300UN', fator:300, gramatura:'24g', gc_nome:'Fardo kombucha 500ML (300un)' },
    { sku:'FAR-PCO28-24G-500ML-BOR-200UN', label:'FARDO 28MM | 24g | 500ML | BORRIFADOR | 200UN', fator:200, gramatura:'24g', gc_nome:'Fardo 500ML borrifador' },
    { sku:'FAR-PCO28-33G-500ML-AMBAR-200UN',label:'FARDO 28MM | 33g | 500ML | ÂMBAR | 200UN',  fator:200, gramatura:'33g', gc_nome:'Fardo 500ML ambar' }
  ],
  preformas: [
    { sku:'PRE-38-18-CRI', label:'PRÉ-FORMA 38MM | 18G | CRISTAL | 120-200ML', fator:1, gc_nome:'Pré forma 17.7g (120/200ML)' },
    { sku:'PRE-38-19-CRI', label:'PRÉ-FORMA 38MM | 19G | CRISTAL | 300ML',    fator:1, gc_nome:'Pré forma 19g (300ML)' },
    { sku:'PRE-28-24-CRI', label:'PRÉ-FORMA 28MM | 24G | CRISTAL | KOM-500ML',fator:1, gc_nome:'Pré forma 33g (500ML)' },
    { sku:'PRE-28-33-AMB', label:'PRÉ-FORMA 28MM | 33G | ÂMBAR | 500ML',     fator:1, gc_nome:'Preforma 33 grs 1810 ambar 10.080' }
  ],
  tampas: [
    { sku:'TAM-38-SUC-PT', label:'Tampa sem lacre (Plastow) — Preta',     fator:1, gc_nome:'Tampa suco preta lacre' },
    { sku:'TAM-38-SUC-AZ', label:'Tampa sem lacre (Plastow) — Azul',      fator:1, gc_nome:'Tampa suco azul' },
    { sku:'TAM-38-SUC-RS', label:'Tampa sem lacre (Plastow) — Rosa',      fator:1, gc_nome:'Tampa suco rosa' },
    { sku:'TAM-38-SUC-RX', label:'Tampa sem lacre (Plastow) — Roxa',      fator:1, gc_nome:'Tampa suco roxa' },
    { sku:'TAM-38-SUC-VM', label:'Tampa sem lacre (Plastow) — Vermelha',  fator:1, gc_nome:'Tampa suco vermelha' },
    { sku:'TAM-38-TMP-PT', label:'Tampa com lacre (Milênio) — Preta',     fator:1, gc_nome:'Tampa tempero preta' },
    { sku:'TAM-38-TMP-VM', label:'Tampa com lacre (Milênio) — Vermelha',  fator:1, gc_nome:'Tampa tempero vermelha' },
    { sku:'TAM-28-TRI-PT', label:'Tampa 28MM | Trigger — Preta',          fator:1, gc_nome:'Tampa trigger preta' },
    { sku:'TAM-28-PUM-PT', label:'Tampa 28MM | Pump — Preta',             fator:1, gc_nome:'Tampa pump preta' },
    { sku:'TAM-28-KOM-BR', label:'Tampa 28MM | Kombucha — Branca',        fator:1, gc_nome:'Tampa kombucha branca' }
  ]
};

function getTodosItens_() {
  return [
    ...CATALOGO_EST.fardos,
    ...CATALOGO_EST.preformas,
    ...CATALOGO_EST.tampas
  ];
}

function getFatorItem_(sku) {
  const overrides = JSON.parse(
    PropertiesService.getScriptProperties().getProperty('fator_overrides') || '{}'
  );
  if (overrides[sku] != null) return Number(overrides[sku]);
  const item = getTodosItens_().find(i => i.sku === sku);
  return item ? item.fator : null;
}

// ── Normaliza texto: minúsculo + sem acento ───────────────────
function norm_(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[áàãâä]/g,'a').replace(/[éèêë]/g,'e')
    .replace(/[íìîï]/g,'i').replace(/[óòõôö]/g,'o')
    .replace(/[úùûü]/g,'u').replace(/[ç]/g,'c').replace(/[ñ]/g,'n');
}

// ── Helper numérico ───────────────────────────────────────────
function gcNum(val) {
  if (val == null) return 0;
  return parseFloat(String(val).replace(',', '.')) || 0;
}

// ── doGet — endpoints do app de estoque ──────────────────────
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  // Versão do script
  if (action === 'version') {
    return json_({ version: SCRIPT_VERSION, ok: true });
  }

  // Catálogo de produtos
  if (action === 'catalogo') {
    return json_({ ok: true, catalogo: CATALOGO_EST });
  }

  // Login: ?action=login&nome=Lucas Montenegro&senha=ADM333@
  if (action === 'login') {
    const nomeIn  = (e.parameter.nome  || '').trim();
    const senhaIn = (e.parameter.senha || e.parameter.pin || '').trim();
    const usuarios = JSON.parse(
      PropertiesService.getScriptProperties().getProperty('usuarios') || '{}'
    );
    // Busca por nome normalizado (ignora maiúsculas e acentos)
    const nomeNorm = norm_(nomeIn);
    const match = Object.entries(usuarios).find(
      ([u, s]) => norm_(u) === nomeNorm && norm_(s) === norm_(senhaIn)
    );
    if (!match) {
      return json_({ ok: false, erro: 'Usuário ou senha incorretos' });
    }
    return json_({ ok: true, nome: match[0] }); // retorna nome original com acentos
  }

  // Histórico de lançamentos (últimos 50)
  if (action === 'lancamentos') {
    const lista = JSON.parse(
      PropertiesService.getScriptProperties().getProperty('lancamentos_estoque') || '[]'
    );
    return json_({ lancamentos: lista.slice(0, 50) });
  }

  // Lançar estoque via GET (compatibilidade com frontend atual)
  if (action === 'lancarEstoque') {
    return lancarEstoqueGC_(e.parameter);
  }

  // Gerenciar usuários via admin
  // ?action=gerenciarUsuarios&adminKey=mnt@admin2026&op=add&nome=Maria&senha=senha123
  if (action === 'gerenciarUsuarios') {
    const adminKey = e.parameter.adminKey || '';
    if (adminKey !== ADMIN_KEY) return json_({ ok: false, erro: 'Acesso negado' });
    const usuarios = JSON.parse(
      PropertiesService.getScriptProperties().getProperty('usuarios') || '{}'
    );
    const op   = e.parameter.op || 'list';
    const nome = (e.parameter.nome  || '').trim();
    const senha = (e.parameter.senha || '').trim();
    if (op === 'add' && nome && senha) {
      usuarios[nome] = senha;
      PropertiesService.getScriptProperties().setProperty('usuarios', JSON.stringify(usuarios));
      return json_({ ok: true, msg: nome + ' adicionado', usuarios: Object.keys(usuarios) });
    }
    if (op === 'remove' && nome) {
      delete usuarios[nome];
      PropertiesService.getScriptProperties().setProperty('usuarios', JSON.stringify(usuarios));
      return json_({ ok: true, msg: nome + ' removido', usuarios: Object.keys(usuarios) });
    }
    return json_({ ok: true, usuarios: Object.keys(usuarios) });
  }

  return json_({ ok: false, erro: 'Ação não reconhecida: ' + action });
}

// ── doPost — lançamento via POST ──────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'catalogo') return json_({ ok: true, catalogo: CATALOGO_EST });
    if (body.action === 'set_fator') {
      const overrides = JSON.parse(PropertiesService.getScriptProperties().getProperty('fator_overrides') || '{}');
      overrides[body.sku] = Number(body.fator);
      PropertiesService.getScriptProperties().setProperty('fator_overrides', JSON.stringify(overrides));
      return json_({ ok: true, msg: 'Fator salvo: ' + body.sku + ' = ' + body.fator });
    }
    if (body.action === 'interpretarFoto') {
      try {
        const result = interpretarFotoEstoque_(body.image, body.mimeType || 'image/jpeg');
        return json_({ ok: true, itens: result.itens });
      } catch(e) {
        return json_({ ok: false, erro: e.message });
      }
    }
    if (body.action === 'lancarEstoqueEmMassa') {
      return lancarEstoqueEmMassa_(body.responsavel, body.modo || 'conferencia', body.itens || []);
    }
    return lancarEstoqueGC_(body);
  } catch(err) {
    return json_({ ok: false, erro: err.message });
  }
}

// ── Lançamento de estoque → Gestão Click ─────────────────────
function lancarEstoqueGC_(params) {
  try {
    const itemId      = params.itemId   || '';
    const itemNome    = params.itemNome || '';
    const responsavel = params.responsavel || '';
    const modo        = (params.modo || 'conferencia').toLowerCase().trim();

    let totalUnidades = parseInt(params.totalUnidades) || 0;
    if (!totalUnidades) {
      const fechadas = parseInt(params.cxFechadas) || 0;
      const abertas  = parseInt(params.cxAbertas)  || 0;
      const pct      = parseFloat(params.pctAberta) || 100;
      totalUnidades  = Math.round(fechadas + abertas * (pct / 100));
    }

    if (!itemNome) return json_({ ok: false, erro: 'itemNome obrigatório' });
    if (totalUnidades < 1) return json_({ ok: false, erro: 'Quantidade inválida' });
    if (!['entrada','saida','conferencia'].includes(modo)) {
      return json_({ ok: false, erro: 'Modo inválido: ' + modo });
    }

    const headers = {
      'access_token':        GC.token,
      'secret_access_token': GC.secret,
      'Content-Type':        'application/json'
    };

    // Busca produtos do GC
    const resProd = UrlFetchApp.fetch(GC.url + '/produtos?limite=500', { headers, muteHttpExceptions: true });
    if (resProd.getResponseCode() !== 200) {
      return json_({ ok: false, erro: 'Erro ao buscar produtos do GC: HTTP ' + resProd.getResponseCode() });
    }
    const produtos = JSON.parse(resProd.getContentText()).data || [];

    // Localiza produto: SKU exato → todos os tokens → maioria dos tokens
    const idLower = itemId.toLowerCase();
    const tokens  = itemNome.toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    // 1. Match por codigo_interno exato (QR code → SKU)
    let produto = produtos.find(p => (p.codigo_interno || '').toUpperCase() === idLower.toUpperCase());
    // 2. Fallback: todos os tokens no nome
    if (!produto && tokens.length) {
      produto = produtos.find(p => {
        const pn = (p.nome || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ');
        return tokens.every(t => pn.includes(t));
      });
    }
    // 3. Fallback: maioria dos tokens
    if (!produto && tokens.length) {
      produto = produtos.find(p => {
        const pn = (p.nome || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ');
        return tokens.filter(t => pn.includes(t)).length / tokens.length >= 0.6;
      });
    }
    if (!produto) {
      Logger.log('❌ Produto não encontrado: "' + itemNome + '" | Tokens: ' + tokens.join(','));
      return json_({ ok: false, erro: 'Produto não encontrado no GC: "' + itemNome + '"' });
    }

    // qtdGC = totalUnidades (frontend já envia fardos, não garrafas individuais)
    const qtdGC = totalUnidades;

    // Calcula novo estoque em fardos
    const estoqueAtual = gcNum(produto.estoque);
    let novoEstoque;
    if (modo === 'entrada') {
      novoEstoque = estoqueAtual + qtdGC;
    } else if (modo === 'saida') {
      if (qtdGC > estoqueAtual) {
        return json_({ ok: false, erro: 'Estoque insuficiente: atual=' + estoqueAtual + ' fardos, saída=' + qtdGC });
      }
      novoEstoque = estoqueAtual - qtdGC;
    } else {
      novoEstoque = qtdGC; // conferencia: substituição direta
    }

    // PUT com estoque atualizado — usa objeto do list diretamente (evita GET extra)
    const prodPut = Object.assign({}, produto);
    ['cadastrado_em','modificado_em','nome_grupo','grupo','estoque_disponivel',
     'imagens','variantes','tributacao','preco_custo_medio','lucro','margem_lucro',
     'nome_categoria','categoria','nome_marca','marca','nome_fornecedor'].forEach(c => delete prodPut[c]);
    prodPut.estoque = Number(novoEstoque);
    const putRes = UrlFetchApp.fetch(GC.url + '/produtos/' + produto.id, {
      method: 'PUT', headers,
      payload: JSON.stringify(prodPut),
      muteHttpExceptions: true
    });

    const code = putRes.getResponseCode();
    const putBody = putRes.getContentText();
    Logger.log('PUT /produtos/' + produto.id + ' → HTTP ' + code + ' | body: ' + putBody.slice(0, 300));
    if (code < 200 || code > 299) {
      return json_({ ok: false, erro: 'GC PUT falhou: HTTP ' + code + ' — ' + putBody.slice(0, 200) });
    }

    // Salva log (últimos 100 lançamentos)
    let logs = [];
    try { logs = JSON.parse(PropertiesService.getScriptProperties().getProperty('lancamentos_estoque') || '[]'); } catch(_){}
    logs.unshift({
      data:         Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
      responsavel,
      modo,
      item:         produto.nome,
      quantidade:   qtdGC,
      estoque_ant:  estoqueAtual,
      estoque_novo: novoEstoque
    });
    PropertiesService.getScriptProperties().setProperty('lancamentos_estoque', JSON.stringify(logs.slice(0, 100)));

    Logger.log('✅ ' + modo + ': ' + produto.nome + ' | ' + estoqueAtual + ' → ' + novoEstoque + ' fardos');
    return json_({
      ok:               true,
      produto:          produto.nome,
      modo,
      estoque_anterior: estoqueAtual,
      estoque_novo:     novoEstoque,
      quantidade:       qtdGC,
      total_unidades:   totalUnidades
    });

  } catch(err) {
    Logger.log('❌ lancarEstoqueGC_: ' + err.message);
    return json_({ ok: false, erro: err.message });
  }
}

// ── Interpreta foto de planilha com Claude Vision ─────────────
// Pré-requisito: adicione ANTHROPIC_KEY nas Propriedades do Script
function interpretarFotoEstoque_(base64, mimeType) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
  if (!apiKey) throw new Error('Chave ANTHROPIC_KEY não configurada nas Propriedades do Script.');

  const prompt = 'Você está lendo uma planilha de contagem de estoque da Montenegro Industria LTDA.\n\n' +
    'Analise a imagem e extraia os valores numéricos da coluna TOTAL de cada item.\n' +
    'Retorne SOMENTE um JSON válido, sem nenhum texto antes ou depois.\n\n' +
    'Use exatamente esta estrutura (preencha "total" com o número lido; use 0 se não preenchido ou ilegível):\n' +
    '{\n  "itens": [\n' +
    '    {"sku":"FAR-38-120-450","nome":"Fardo 120ml (450un)","total":0},\n' +
    '    {"sku":"FAR-38-200-300","nome":"Fardo 200ml (300un)","total":0},\n' +
    '    {"sku":"FAR-38-300-240","nome":"Fardo 300ml (240un)","total":0},\n' +
    '    {"sku":"FAR-38-500-BL","nome":"Fardo 500ml Boca Larga","total":0},\n' +
    '    {"sku":"FAR-28-500-BOR","nome":"Fardo 500ml Borrifador","total":0},\n' +
    '    {"sku":"FAR-28-500-KOM","nome":"Fardo 500ml Kombucha","total":0},\n' +
    '    {"sku":"PRE-38-18-CRI","nome":"Pre-forma 18g 120-200ml","total":0},\n' +
    '    {"sku":"PRE-38-19-CRI","nome":"Pre-forma 19g 300ml","total":0},\n' +
    '    {"sku":"PRE-28-24-CRI","nome":"Pre-forma 24g Kombucha","total":0},\n' +
    '    {"sku":"PRE-28-33-AMB","nome":"Pre-forma 33g Ambar","total":0},\n' +
    '    {"sku":"TAM-38-SUC-PT","nome":"Tampa sem lacre Preta Plastow","total":0},\n' +
    '    {"sku":"TAM-38-SUC-AZ","nome":"Tampa sem lacre Azul Plastow","total":0},\n' +
    '    {"sku":"TAM-38-SUC-RS","nome":"Tampa sem lacre Rosa Plastow","total":0},\n' +
    '    {"sku":"TAM-38-SUC-RX","nome":"Tampa sem lacre Roxa Plastow","total":0},\n' +
    '    {"sku":"TAM-38-SUC-VM","nome":"Tampa sem lacre Vermelha Plastow","total":0},\n' +
    '    {"sku":"TAM-38-TMP-PT","nome":"Tampa com lacre Preta Milenio","total":0},\n' +
    '    {"sku":"TAM-38-TMP-VM","nome":"Tampa com lacre Vermelha Milenio","total":0},\n' +
    '    {"sku":"TAM-28-TRI-PT","nome":"Tampa Trigger Preta 28mm","total":0},\n' +
    '    {"sku":"TAM-28-PUM-PT","nome":"Tampa Pump Preta 28mm","total":0},\n' +
    '    {"sku":"TAM-28-KOM-BR","nome":"Tampa Kombucha Branca 28mm","total":0}\n' +
    '  ]\n}';

  const payload = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
      { type: 'text', text: prompt }
    ]}]
  };

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();
  Logger.log('Claude API HTTP ' + code + ': ' + text.slice(0, 300));
  if (code !== 200) throw new Error('Claude API erro HTTP ' + code);

  const content = JSON.parse(text).content[0].text;
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('IA nao retornou JSON valido');
  return JSON.parse(match[0]);
}

// ── Lançamento em massa → Gestão Click ───────────────────────
function lancarEstoqueEmMassa_(responsavel, modo, itens) {
  const headers = { 'access_token': GC.token, 'secret_access_token': GC.secret, 'Content-Type': 'application/json' };

  // Busca todos os produtos do GC uma única vez
  const resProd = UrlFetchApp.fetch(GC.url + '/produtos?limite=500', { headers, muteHttpExceptions: true });
  if (resProd.getResponseCode() !== 200) return json_({ ok: false, erro: 'Erro ao buscar produtos do GC' });
  const produtos = JSON.parse(resProd.getContentText()).data || [];

  const resultados = [];
  let logs = [];
  try { logs = JSON.parse(PropertiesService.getScriptProperties().getProperty('lancamentos_estoque') || '[]'); } catch(_){}

  for (const item of itens) {
    if (!item.total || item.total <= 0) continue;
    try {
      const idLower = (item.sku || '').toLowerCase();
      const tokens  = (item.nome || '').toLowerCase().replace(/[^a-z0-9\s]/gi,' ').split(/\s+/).filter(w => w.length >= 2);
      let produto = produtos.find(p => (p.codigo||'').toLowerCase() === idLower);
      if (!produto && tokens.length) produto = produtos.find(p => { const pn=(p.nome||'').toLowerCase().replace(/[^a-z0-9\s]/gi,' '); return tokens.every(t=>pn.includes(t)); });
      if (!produto && tokens.length) produto = produtos.find(p => { const pn=(p.nome||'').toLowerCase().replace(/[^a-z0-9\s]/gi,' '); return tokens.filter(t=>pn.includes(t)).length/tokens.length>=0.6; });
      if (!produto) { resultados.push({ sku: item.sku, nome: item.nome, ok: false, erro: 'Nao encontrado no GC' }); continue; }

      const estoqueAtual = gcNum(produto.estoque);
      let novoEstoque = modo === 'entrada' ? estoqueAtual + item.total
                      : modo === 'saida'   ? Math.max(0, estoqueAtual - item.total)
                      : item.total;

      const putRes = UrlFetchApp.fetch(GC.url + '/produtos/' + produto.id, { method:'PUT', headers, payload: JSON.stringify({ estoque: novoEstoque }), muteHttpExceptions: true });
      const code = putRes.getResponseCode();

      if (code >= 200 && code <= 299) {
        resultados.push({ sku: item.sku, nome: produto.nome, ok: true, anterior: estoqueAtual, novo: novoEstoque });
        logs.unshift({ data: Utilities.formatDate(new Date(),'America/Sao_Paulo','dd/MM/yyyy HH:mm'), responsavel, modo, item: produto.nome, quantidade: item.total, estoque_ant: estoqueAtual, estoque_novo: novoEstoque });
      } else {
        resultados.push({ sku: item.sku, nome: item.nome, ok: false, erro: 'GC HTTP ' + code });
      }
    } catch(e) {
      resultados.push({ sku: item.sku, nome: item.nome, ok: false, erro: e.message });
    }
  }

  PropertiesService.getScriptProperties().setProperty('lancamentos_estoque', JSON.stringify(logs.slice(0,100)));
  PropertiesService.getScriptProperties().deleteProperty('gc_cache');

  const ok = resultados.filter(r => r.ok).length;
  Logger.log('✅ Lançamento em massa: ' + ok + '/' + resultados.length + ' itens atualizados');
  return json_({ ok: true, atualizados: ok, total: resultados.length, resultados });
}

// ── Migração: atualiza campo "codigo" de todos os fardos no GC ───
// Execute UMA VEZ no editor do Apps Script: Executar → atualizarCodigosGC
function atualizarCodigosGC() {
  const headers = {
    'access_token':        GC.token,
    'secret_access_token': GC.secret,
    'Content-Type':        'application/json'
  };

  // Busca todos os produtos do GC
  const res = UrlFetchApp.fetch(GC.url + '/produtos?limite=500', { headers, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    Logger.log('❌ Erro ao buscar produtos: HTTP ' + res.getResponseCode());
    return;
  }
  const produtos = JSON.parse(res.getContentText()).data || [];
  Logger.log('📦 ' + produtos.length + ' produtos encontrados no GC');

  const resultados = [];

  for (const fardo of CATALOGO_EST.fardos) {
    // Busca produto pelo gc_nome (match por tokens)
    const tokens = fardo.gc_nome.toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    let produto = produtos.find(p => {
      const pn = (p.nome || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ');
      return tokens.every(t => pn.includes(t));
    });
    if (!produto) {
      produto = produtos.find(p => {
        const pn = (p.nome || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ');
        return tokens.filter(t => pn.includes(t)).length / tokens.length >= 0.6;
      });
    }

    if (!produto) {
      Logger.log('⚠️  Não encontrado: ' + fardo.gc_nome + ' (SKU: ' + fardo.sku + ')');
      resultados.push({ sku: fardo.sku, gc_nome: fardo.gc_nome, ok: false, erro: 'Produto não encontrado no GC' });
      continue;
    }

    // Atualiza o campo "codigo" com o SKU
    const put = UrlFetchApp.fetch(GC.url + '/produtos/' + produto.id, {
      method: 'PUT',
      headers,
      payload: JSON.stringify({ codigo: fardo.sku }),
      muteHttpExceptions: true
    });

    const code = put.getResponseCode();
    if (code >= 200 && code <= 299) {
      Logger.log('✅ ' + produto.nome + ' → codigo = ' + fardo.sku);
      resultados.push({ sku: fardo.sku, gc_nome: produto.nome, ok: true });
    } else {
      Logger.log('❌ Falha PUT ' + produto.nome + ': HTTP ' + code + ' | ' + put.getContentText().slice(0,200));
      resultados.push({ sku: fardo.sku, gc_nome: produto.nome, ok: false, erro: 'HTTP ' + code });
    }

    Utilities.sleep(300); // evita rate limit
  }

  const ok  = resultados.filter(r => r.ok).length;
  const nok = resultados.filter(r => !r.ok).length;
  Logger.log('════════════════════════════════');
  Logger.log('✅ Atualizados: ' + ok + '/' + resultados.length);
  if (nok > 0) {
    Logger.log('⚠️  Falhas (' + nok + '):');
    resultados.filter(r => !r.ok).forEach(r => Logger.log('   - ' + r.gc_nome + ': ' + r.erro));
  }
  Logger.log('════════════════════════════════');
}

// ── Helper JSON ───────────────────────────────────────────────
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
