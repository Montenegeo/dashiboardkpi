// ════════════════════════════════════════════════════════════════
// Montenegro Industria LTDA — Apps Script
//
// COMO USAR:
// 1. Acesse script.google.com → Novo projeto
// 2. Cole todo este código → Salve com Ctrl+S
// 3. Implantar → Nova implantação → App da Web
//    → Executar como: Eu | Acesso: Qualquer pessoa
// 4. Copie a URL → cole no dashboard.html (variável APPS_URL)
// 5. Execute configurarTriggers() UMA VEZ para ativar automações
// ════════════════════════════════════════════════════════════════

// ── IDs das planilhas ─────────────────────────────────────────
const IDS = {
  producao:   '1fgNeGLEf2fcg_X-loxkVHAmjxyjLECofK18DUMkWskk',
  expedicao:  '1iF_XdKdr9jC4wxqHs7Lm8XEAIa9yeAKkbEoHktiFUGo',
  reuniao:    '1Rpj4ZrYcv2-9tPNNXFmDD7-YNZDttzG5Mp66uoacVZ4',
  devolucoes: '1ZFK2pmper_f-jg3FaZNrU3JPbawEIrsWcYGK-GypiRc',
  prospeccao: '' // Cole o ID da planilha do form de prospecção aqui
};

const GIDS = { producao: 729143139, expedicao: 907565730 };

// ── Green API — WhatsApp ──────────────────────────────────────
const WA = {
  url:      'https://7107.api.greenapi.com',
  instance: '7107547894',
  token:    '1c50f1b9d9be4b2db87dc3c0ba2e7c451ea1d8f81a8d489eb3'
};

const DESTINATARIOS = [
  '5527996461883', // Lucas Montenegro
  '5522999328710'  // Gestor
];

// ── Gestão Click API ──────────────────────────────────────────
const GC = {
  url:    'https://api.gestaoclick.com',
  token:  'ce1b0ea8a6b55279c314c1b42575901635bb0fdd',
  secret: '8d6db29f17cd1450b6db9b472e49103e855046d1'
};

// Metas para alertas
const METAS = {
  roas_shopee_min: 15,
  roas_shopee_meta: 20,
  roas_meta_min: 5,
  shopee_saldo_alerta: 80
};

// ── Gestão Click — busca dados e salva em cache ───────────────
function syncGestaoClick() {
  try {
    const headers = {
      'access_token':        GC.token,
      'secret_access_token': GC.secret,
      'Content-Type':        'application/json'
    };

    const hoje    = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    const iniMes  = Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'America/Sao_Paulo', 'yyyy-MM-dd');

    // ── Vendas do mês ────────────────────────────────────────
    const resVendas = UrlFetchApp.fetch(
      `${GC.url}/vendas?data_inicio=${iniMes}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const vendas = resVendas.getResponseCode() === 200
      ? (JSON.parse(resVendas.getContentText()).data || [])
      : [];

    const pedidosMes  = vendas.length;
    const receitaMes  = vendas.reduce((s, v) => s + gcNum(v.valor_total), 0);
    const ticketMedio = pedidosMes > 0 ? receitaMes / pedidosMes : 0;

    // ── Vendas de hoje (atacado do dia) ──────────────────────
    const resVendasHoje = UrlFetchApp.fetch(
      `${GC.url}/vendas?data_inicio=${hoje}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const vendasHoje  = resVendasHoje.getResponseCode() === 200
      ? (JSON.parse(resVendasHoje.getContentText()).data || [])
      : [];
    const pedidosHoje = vendasHoje.length;
    const receitaHoje = vendasHoje.reduce((s, v) => s + gcNum(v.valor_total), 0);

    // ── Produtos / Estoque ───────────────────────────────────
    const resProd = UrlFetchApp.fetch(
      `${GC.url}/produtos?limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const produtos = resProd.getResponseCode() === 200
      ? (JSON.parse(resProd.getContentText()).data || [])
      : [];

    const totalSkus       = produtos.length;
    const zerados         = produtos.filter(p => gcNum(p.estoque) <= 0);
    const criticos        = produtos.filter(p => gcNum(p.estoque) > 0 && gcNum(p.estoque) <= 10);
    const inventarioCusto = produtos
      .filter(p => gcNum(p.estoque) > 0)
      .reduce((s, p) => s + gcNum(p.valor_custo) * gcNum(p.estoque), 0);

    const zeradosNomes  = zerados.slice(0, 5).map(p => p.nome || '?');
    const criticosNomes = criticos.slice(0, 5).map(p => p.nome || '?');

    // ── Recebimentos do mês ──────────────────────────────────
    const resRec = UrlFetchApp.fetch(
      `${GC.url}/recebimentos?data_inicio=${iniMes}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const recebimentos = resRec.getResponseCode() === 200
      ? (JSON.parse(resRec.getContentText()).data || [])
      : [];

    const recebimentosMes = recebimentos.reduce((s, r) => s + gcNum(r.valor_total || r.valor), 0);
    const recebidoMes     = recebimentos.filter(r => String(r.liquidado) === '1').reduce((s, r) => s + gcNum(r.valor_total || r.valor), 0);

    // ── Pagamentos do mês ────────────────────────────────────
    const resPag = UrlFetchApp.fetch(
      `${GC.url}/pagamentos?data_inicio=${iniMes}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const pagamentos = resPag.getResponseCode() === 200
      ? (JSON.parse(resPag.getContentText()).data || [])
      : [];

    const pagamentosMes = pagamentos.reduce((s, p) => s + gcNum(p.valor_total || p.valor), 0);
    const pagoMes       = pagamentos.filter(p => String(p.liquidado) === '1').reduce((s, p) => s + gcNum(p.valor_total || p.valor), 0);

    // ── Recebimentos de hoje ──────────────────────────────────────
    const resRecHoje = UrlFetchApp.fetch(
      `${GC.url}/recebimentos?data_inicio=${hoje}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const recebimentosHoje = resRecHoje.getResponseCode() === 200
      ? (JSON.parse(resRecHoje.getContentText()).data || [])
      : [];
    const recebidoHoje = recebimentosHoje
      .filter(r => String(r.liquidado) === '1')
      .reduce((s, r) => s + gcNum(r.valor_total || r.valor), 0);

    // ── Pagamentos de hoje ────────────────────────────────────────
    const resPagHoje = UrlFetchApp.fetch(
      `${GC.url}/pagamentos?data_inicio=${hoje}&data_fim=${hoje}&limite=500`,
      { headers, muteHttpExceptions: true }
    );
    const pagamentosHoje = resPagHoje.getResponseCode() === 200
      ? (JSON.parse(resPagHoje.getContentText()).data || [])
      : [];
    const pagoHoje = pagamentosHoje
      .filter(p => String(p.liquidado) === '1')
      .reduce((s, p) => s + gcNum(p.valor_total || p.valor), 0);

    // ── Monta objeto final ───────────────────────────────────
    const gcData = {
      atualizado_em: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
      vendas: {
        pedidos_mes:   pedidosMes,
        receita_mes:   Math.round(receitaMes * 100) / 100,
        ticket_medio:  Math.round(ticketMedio * 100) / 100,
        pedidos_hoje:  pedidosHoje,
        receita_hoje:  Math.round(receitaHoje * 100) / 100
      },
      estoque: {
        total_skus:       totalSkus,
        zerados:          zerados.length,
        criticos:         criticos.length,
        inventario_custo: Math.round(inventarioCusto * 100) / 100,
        zerados_nomes:    zeradosNomes,
        criticos_nomes:   criticosNomes,
        produtos_raw:     produtos.slice(0, 200).map(p => ({
          id:          String(p.id||p.codigo||p.nome||''),
          nome:        p.nome||'',
          estoque:     gcNum(p.estoque),
          valor_custo: gcNum(p.valor_custo)
        }))
      },
      financeiro: {
        recebimentos_mes: Math.round(recebimentosMes * 100) / 100,
        recebido_mes:     Math.round(recebidoMes * 100) / 100,
        pagamentos_mes:   Math.round(pagamentosMes * 100) / 100,
        pago_mes:         Math.round(pagoMes * 100) / 100,
        saldo_mes:        Math.round((recebidoMes - pagoMes) * 100) / 100
      },
      saldo_hoje: {
        receita_atacado: Math.round(receitaHoje * 100) / 100,
        recebido:        Math.round(recebidoHoje * 100) / 100,
        pago:            Math.round(pagoHoje * 100) / 100,
        saldo:           Math.round((receitaHoje + recebidoHoje - pagoHoje) * 100) / 100
      }
    };

    // Salva em cache (Script Properties)
    PropertiesService.getScriptProperties().setProperty('gc_cache', JSON.stringify(gcData));
    Logger.log('✅ Gestão Click sync OK — pedidos mês: ' + pedidosMes + ' | inventário: R$' + inventarioCusto.toFixed(2));
    return gcData;

  } catch(e) {
    Logger.log('❌ Gestão Click sync erro: ' + e.message);
    return null;
  }
}

// Helper: converte valor da API GC (ponto decimal americano "1390.00") para número
function gcNum(val) {
  if (val == null) return 0;
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
}

// ── Teste manual — rode para validar conexão ──────────────────
function testarGestaoClick() {
  const resultado = syncGestaoClick();
  if (resultado) {
    Logger.log('=== RESULTADO GESTÃO CLICK ===');
    Logger.log(JSON.stringify(resultado, null, 2));
  } else {
    Logger.log('❌ Falha — verifique credenciais e conexão');
  }
}

// ── Monta JSON consolidado (planilhas + Gestão Click) ─────────
function buildJSON() {
  const now  = new Date();
  const hoje = Utilities.formatDate(now, 'America/Sao_Paulo', 'dd/MM/yyyy');

  // Produção — agrupa todos os registros do dia (manhã + tarde + troca de molde)
  const registrosProd = linhasDoDia(IDS.producao, GIDS.producao);
  const turnos = registrosProd.map(r => ({
    turno:     String(r[3]||'').replace('da ','').trim(),
    realizado: toNum(r[5]),
    perda_kg:  toNum(r[6]),
    perda_un:  toNum(r[7]),
    molde:     String(r[8]||''),
    troca:     String(r[9]||'Não'),
    obs:       String(r[10]||'')
  }));
  const totalRealizado = turnos.reduce((s, t) => s + t.realizado, 0);
  const totalPerdaKg   = turnos.reduce((s, t) => s + t.perda_kg, 0);
  const totalPerdaUn   = turnos.reduce((s, t) => s + t.perda_un, 0);
  const houveTroca     = turnos.some(t => String(t.troca).toLowerCase() !== 'não' && t.troca !== '');
  const quem           = registrosProd.length > 0 ? String(registrosProd[0][1]||'') : '';

  const exp  = ultimaLinha(IDS.expedicao, GIDS.expedicao);
  const reu  = ultimaLinha(IDS.reuniao);

  const devSheet = SpreadsheetApp.openById(IDS.devolucoes).getSheets()[0];
  const devRows  = devSheet.getDataRange().getValues().slice(1);
  const devHoje  = devRows.filter(r => String(r[4]).startsWith(hoje.slice(0,5)));

  let prospeccao = { vendedor:'', prospeccoes:0, followups:0, orcamentos:0, valor_fechado:0, obs:'' };
  if (IDS.prospeccao) {
    const pro = ultimaLinha(IDS.prospeccao);
    prospeccao = {
      vendedor: pro[1]||'', prospeccoes: toNum(pro[2]), followups: toNum(pro[3]),
      orcamentos: toNum(pro[4]), valor_fechado: toNum(pro[5]), obs: pro[6]||''
    };
  }

  // Lê cache do Gestão Click (salvo pelo trigger de 10 min)
  let gestaoclick = null;
  try {
    const cached = PropertiesService.getScriptProperties().getProperty('gc_cache');
    if (cached) gestaoclick = JSON.parse(cached);
  } catch(_) {}

  return {
    atualizado_em: Utilities.formatDate(now, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
    producao: {
      quem,
      total_realizado: totalRealizado,
      total_perda_kg:  totalPerdaKg,
      total_perda_un:  totalPerdaUn,
      troca_molde:     houveTroca,
      turnos,           // array: [{turno, realizado, perda_kg, molde, troca, obs}, ...]
      // campos legados para compatibilidade
      realizado: totalRealizado,
      perda_kg:  totalPerdaKg,
      perda_un:  totalPerdaUn,
      turno:     turnos.map(t => t.turno).join(' + ')
    },
    expedicao: {
      pedidos_1impressao: toNum(exp[2]), pedidos_3impressao: toNum(exp[3]),
      sacos_kits: exp[4]||'', etiquetas_sobra: toNum(exp[5]),
      atraso: String(exp[6]||'Não'), pedidos_atrasados: exp[11]||''
    },
    reuniao: {
      status: reu[1]||'', coleta_15h: reu[2]||'', pct_17h: reu[3]||'',
      ameaca: String(reu[4]||'Não'), solucao: reu[5]||'', horas_extras: String(reu[6]||'Não')
    },
    devolucoes: {
      total_dia: devHoje.length,
      itens: devHoje.map(r => ({ rastreio:r[0]||'', produto:r[1]||'', pedido:r[2]||'', estado:r[3]||'' }))
    },
    prospeccao,
    gestaoclick  // null se cache vazio, objeto completo se já sincronizado
  };
}

// ── Resumo diário 18h — enviado via WhatsApp ──────────────────
function resumoDiario18h() {
  const d    = buildJSON();
  const prod = d.producao;
  const exp  = d.expedicao;
  const dev  = d.devolucoes;
  const pro  = d.prospeccao;
  const reu  = d.reuniao;
  const gc   = d.gestaoclick;

  const totalPedidos = (exp.pedidos_1impressao || 0) + (exp.pedidos_3impressao || 0);

  const blocoGC = gc ? `
💰 *GESTÃO CLICK*
▸ Pedidos mês: ${gc.vendas.pedidos_mes}
▸ Receita mês: R$ ${gc.vendas.receita_mes.toLocaleString('pt-BR')}
▸ Inventário: R$ ${gc.estoque.inventario_custo.toLocaleString('pt-BR')}
▸ SKUs zerados: ${gc.estoque.zerados}` : '';

  // Monta bloco de produção com turnos separados
  const blocoProd = prod.turnos && prod.turnos.length > 1
    ? prod.turnos.map(t =>
        `▸ ${t.turno}: ${t.realizado.toLocaleString('pt-BR')} un${t.troca && t.troca !== 'Não' ? ' 🔄 troca molde' : ''}`
      ).join('\n') + `\n▸ *Total: ${prod.total_realizado.toLocaleString('pt-BR')} un*`
    : `▸ Realizado: ${prod.total_realizado.toLocaleString('pt-BR')} un`;

  const msg =
`🏭 *Montenegro Industria LTDA*
📅 Fechamento ${d.atualizado_em}
━━━━━━━━━━━━━━━━━━━━

📦 *PRODUÇÃO* ${prod.troca_molde ? '🔄' : ''}
${blocoProd}
▸ Perdas: ${prod.total_perda_un} un (${prod.total_perda_kg} kg)

📤 *EXPEDIÇÃO*
▸ Total pedidos: ${totalPedidos}
▸ Devoluções hoje: ${dev.total_dia}
▸ Horas extras: ${reu.horas_extras}
${exp.atraso !== 'Não' ? '⚠️ Atraso identificado' : '✅ Sem atrasos'}

💼 *COMERCIAL*
▸ Prospecções: ${pro.prospeccoes}/30
▸ Orçamentos: ${pro.orcamentos}
▸ Fechado hoje: R$ ${pro.valor_fechado.toLocaleString('pt-BR')}
${blocoGC}

_Enviado automaticamente — Sistema Montenegro_`;

  enviarTodos(msg);
}

// ── Dispara ao receber envio de formulário ────────────────────
function onFormSubmitHandler(e) {
  PropertiesService.getScriptProperties().setProperty(
    'last_form_submit', new Date().toISOString()
  );

  let setor = 'Formulário';
  try {
    const sheetName = e.source.getName();
    if (sheetName.toLowerCase().includes('producao') || sheetName.toLowerCase().includes('produção')) setor = '📦 Produção';
    else if (sheetName.toLowerCase().includes('expedicao') || sheetName.toLowerCase().includes('expedição')) setor = '📤 Expedição';
    else if (sheetName.toLowerCase().includes('reuniao') || sheetName.toLowerCase().includes('reunião')) setor = '🕒 Reunião 15h';
    else if (sheetName.toLowerCase().includes('devolucao') || sheetName.toLowerCase().includes('devolução')) setor = '↩️ Devoluções';
    else if (sheetName.toLowerCase().includes('prospeccao') || sheetName.toLowerCase().includes('prospecção')) setor = '💼 Prospecção';
  } catch(_) {}

  const now = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'HH:mm');
  enviarTodos(`✅ *${setor}* atualizado às ${now} — dashboard disponível`);
}

// ══════════════════════════════════════════════════════════════
// CATÁLOGO DE ESTOQUE — itens, fardos e fatores de conversão
// ══════════════════════════════════════════════════════════════
const CATALOGO_EST = {
  fardos: [
    { sku:'FAR-38-120-450', label:'FARDO 38MM | 120ML | 450UN',   fator:450, gc_nome:'Fardo 120ML (450un)' },
    { sku:'FAR-38-200-300', label:'FARDO 38MM | 200ML | 300UN',   fator:300, gc_nome:'Fardo 200ML (300un)' },
    { sku:'FAR-38-300-240', label:'FARDO 38MM | 300ML | 240UN',   fator:240, gc_nome:'Fardo 300ML (240un)' },
    { sku:'FAR-38-500-BL',  label:'FARDO 38MM | 500ML | BOCA LARGA', fator:null, gc_nome:'Fardo 500ML boca larga' },
    { sku:'FAR-28-500-BOR', label:'FARDO 28MM | 500ML | BORRIFADOR', fator:null, gc_nome:'Fardo 500ML borrifador' },
    { sku:'FAR-28-500-KOM', label:'FARDO 28MM | 500ML | KOMBUCHA | 300UN', fator:300, gc_nome:'Fardo kombucha 500ML (300un)' }
  ],
  garrafas: [
    { sku:'GAR-38-120-CRI', label:'GARRAFA 38MM | 120ML | CRISTAL',          fator:1, gc_nome:'Garrafa 120 ML' },
    { sku:'GAR-38-200-CRI', label:'GARRAFA 38MM | 200ML | CRISTAL',          fator:1, gc_nome:'Garrafa 200 ML' },
    { sku:'GAR-38-300-CRI', label:'GARRAFA 38MM | 300ML | CRISTAL',          fator:1, gc_nome:'Garrafa 300 ML' },
    { sku:'GAR-38-500-CRI', label:'GARRAFA 38MM | 500ML | CRISTAL',          fator:1, gc_nome:'Garrafa 500 ML' },
    { sku:'GAR-28-300-KOM', label:'GARRAFA 28MM | 300ML | CRISTAL | KOMBUCHA', fator:1, gc_nome:'Garrafa kombucha' },
    { sku:'GAR-28-500-CRI', label:'GARRAFA 28MM | 500ML | CRISTAL',          fator:1, gc_nome:'Garrafa borrifador' },
    { sku:'GAR-28-500-AMB', label:'GARRAFA 28MM | 500ML | AMBAR',            fator:1, gc_nome:'Garrafa 500ML ambar' }
  ],
  preformas: [
    { sku:'PRE-38-18-CRI', label:'PRE-FORMA 38MM | 18G | CRISTAL | 120-200ML', fator:1, gc_nome:'Pré forma 17.7g (120/200ML)' },
    { sku:'PRE-38-19-CRI', label:'PRE-FORMA 38MM | 19G | CRISTAL | 300ML',    fator:1, gc_nome:'Pré forma 19g (300ML)' },
    { sku:'PRE-28-24-CRI', label:'PRE-FORMA 28MM | 24G | CRISTAL | KOM-500ML',fator:1, gc_nome:'Pré forma 33g (500ML)' },
    { sku:'PRE-28-33-AMB', label:'PRE-FORMA 28MM | 33G | AMBAR | 500ML',     fator:1, gc_nome:'Preforma 33 grs 1810 ambar 10.080' }
  ],
  tampas: [
    { sku:'TAM-38-SUC-PT', label:'TAMPA 38MM | SUCO | PRETA | COM LACRE',    fator:1, gc_nome:'Tampa suco preta lacre' },
    { sku:'TAM-38-SUC-AZ', label:'TAMPA 38MM | SUCO | AZUL | COM LACRE',     fator:1, gc_nome:'Tampa suco azul' },
    { sku:'TAM-38-SUC-RS', label:'TAMPA 38MM | SUCO | ROSA | COM LACRE',     fator:1, gc_nome:'Tampa suco rosa' },
    { sku:'TAM-38-SUC-RX', label:'TAMPA 38MM | SUCO | ROXA | COM LACRE',     fator:1, gc_nome:'Tampa suco roxa' },
    { sku:'TAM-38-SUC-VM', label:'TAMPA 38MM | SUCO | VERMELHA | COM LACRE', fator:1, gc_nome:'Tampa suco vermelha' },
    { sku:'TAM-38-TMP-PT', label:'TAMPA 38MM | TEMPERO | PRETA',             fator:1, gc_nome:'Tampa tempero preta' },
    { sku:'TAM-38-TMP-VM', label:'TAMPA 38MM | TEMPERO | VERMELHA',          fator:1, gc_nome:'Tampa tempero vermelha' },
    { sku:'TAM-28-TRI-PT', label:'TAMPA 28MM | TRIGGER | PRETA',             fator:1, gc_nome:'Tampa trigger preta' },
    { sku:'TAM-28-PUM-PT', label:'TAMPA 28MM | PUMP | PRETA',               fator:1, gc_nome:'Tampa pump preta' },
    { sku:'TAM-28-KOM-BR', label:'TAMPA 28MM | KOMBUCHA | BRANCA',           fator:1, gc_nome:'Tampa kombucha branca' }
  ]
};

function getTodosItens_() {
  return [
    ...CATALOGO_EST.fardos,
    ...CATALOGO_EST.garrafas,
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

// ── doPost — recebe lançamentos de estoque do formulário ──────
function doPost(e) {
  try {
    const body  = JSON.parse(e.postData.contents);
    const acao  = body.action || 'lancar';

    if (acao === 'catalogo') {
      return ContentService
        .createTextOutput(JSON.stringify({ ok:true, catalogo: CATALOGO_EST }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (acao === 'set_fator') {
      // Permite configurar fatores pendentes via POST
      const { sku, fator } = body;
      const prop = PropertiesService.getScriptProperties();
      const overrides = JSON.parse(prop.getProperty('fator_overrides') || '{}');
      overrides[sku] = Number(fator);
      prop.setProperty('fator_overrides', JSON.stringify(overrides));
      return ContentService
        .createTextOutput(JSON.stringify({ ok:true, msg:'Fator salvo: '+sku+' = '+fator }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ação padrão: lancar estoque
    const resultado = processarLancamento_(body);
    return ContentService
      .createTextOutput(JSON.stringify(resultado))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok:false, erro: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function processarLancamento_(dados) {
  const { sku, categoria, label, qtd, responsavel, data, obs } = dados;
  const fator = getFatorItem_(sku);

  if (fator === null) {
    return {
      ok: false,
      erro: 'Fator de conversão não definido para este item. Configure-o no painel de fatores.'
    };
  }

  const qtd_num  = Number(qtd);
  const total_un = Math.round(qtd_num * fator);

  const lancamento = {
    sku, categoria, label,
    qtd_informada: qtd_num,
    fator,
    total_unidades: total_un,
    responsavel: responsavel || '',
    data: data || Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy'),
    obs: obs || '',
    criado_em: new Date().toISOString()
  };

  // Salva histórico em Script Properties (últimos 300 lançamentos)
  const prop  = PropertiesService.getScriptProperties();
  const lista = JSON.parse(prop.getProperty('lancamentos_estoque') || '[]');
  lista.unshift(lancamento);
  if (lista.length > 300) lista.splice(300);
  prop.setProperty('lancamentos_estoque', JSON.stringify(lista));

  // Tenta atualizar no Gestão Click
  let gc_ok  = false;
  let gc_msg = 'Não tentado';
  try {
    const r = atualizarEstoqueGC_(label, sku, total_un);
    gc_ok  = r.ok;
    gc_msg = r.msg;
  } catch(err) {
    gc_msg = 'Erro: ' + err.message;
  }

  Logger.log(`Lançamento: ${label} | ${qtd_num} × ${fator} = ${total_un} un | GC: ${gc_msg}`);

  return {
    ok: true,
    label,
    qtd_informada: qtd_num,
    fator,
    total_unidades: total_un,
    gc_atualizado: gc_ok,
    gc_msg,
    mensagem: `${label}: ${qtd_num} un/fardo(s) → ${total_un.toLocaleString('pt-BR')} unidades totais`
  };
}

function atualizarEstoqueGC_(label, sku, novaQuantidade) {
  const headers = {
    'access_token':        GC.token,
    'secret_access_token': GC.secret,
    'Content-Type':        'application/json'
  };

  // Busca todos os produtos
  const resList = UrlFetchApp.fetch(`${GC.url}/produtos?limite=500`, {
    headers, muteHttpExceptions: true
  });
  if (resList.getResponseCode() !== 200) {
    return { ok:false, msg:'Falha ao listar produtos GC ('+resList.getResponseCode()+')' };
  }

  const produtos = JSON.parse(resList.getContentText()).data || [];

  // Tenta encontrar por código/SKU, depois por nome aproximado
  const catalogoItem = getTodosItens_().find(i => i.sku === sku);
  let produto = null;

  if (catalogoItem) {
    // 1. Por código exato
    produto = produtos.find(p => p.codigo && p.codigo.toUpperCase() === sku.toUpperCase());
    // 2. Por gc_nome aproximado
    if (!produto) {
      const gcNomeLower = catalogoItem.gc_nome.toLowerCase();
      produto = produtos.find(p => p.nome && p.nome.toLowerCase().includes(gcNomeLower.split(' ').slice(0,2).join(' ')));
    }
    // 3. Por primeiras palavras do label
    if (!produto) {
      const primPalavras = label.toLowerCase().split('|')[0].trim();
      produto = produtos.find(p => p.nome && p.nome.toLowerCase().includes(primPalavras.split(' ')[0]));
    }
  }

  if (!produto || !produto.id) {
    return { ok:false, msg:`Produto não encontrado no GC — atualize manualmente. (sku: ${sku})` };
  }

  // Atualiza estoque via PUT
  const resUp = UrlFetchApp.fetch(`${GC.url}/produtos/${produto.id}`, {
    method: 'PUT',
    headers,
    payload: JSON.stringify({ estoque: novaQuantidade }),
    muteHttpExceptions: true
  });

  const code = resUp.getResponseCode();
  if (code === 200 || code === 201) {
    return { ok:true, msg:`GC atualizado — produto id:${produto.id}, novo estoque: ${novaQuantidade}` };
  }
  return { ok:false, msg:`GC retornou HTTP ${code}: ${resUp.getContentText().slice(0,120)}` };
}

// ── doGet — endpoint principal do dashboard ───────────────────
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'lastSubmit') {
    const ts = PropertiesService.getScriptProperties().getProperty('last_form_submit') || '';
    return ContentService
      .createTextOutput(JSON.stringify({ last_submit: ts }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'lancamentos') {
    const lista = JSON.parse(
      PropertiesService.getScriptProperties().getProperty('lancamentos_estoque') || '[]'
    );
    return ContentService
      .createTextOutput(JSON.stringify({ lancamentos: lista.slice(0, 50) }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'catalogo') {
    return ContentService
      .createTextOutput(JSON.stringify({ ok:true, catalogo: CATALOGO_EST }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'lancarEstoque') {
    return lancarEstoqueGC_(e.parameter);
  }

  // Retorna todos os dados: planilhas + Gestão Click
  return ContentService
    .createTextOutput(JSON.stringify(buildJSON()))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Lançamento de estoque via formulário → Gestão Click ───────
function lancarEstoqueGC_(params) {
  const resp = (msg, ok) => ContentService
    .createTextOutput(JSON.stringify(ok ? {ok:true,...msg} : {ok:false,erro:msg}))
    .setMimeType(ContentService.MimeType.JSON);

  try {
    const itemId       = params.itemId   || '';
    const itemNome     = params.itemNome || '';
    const tipo         = params.tipo     || 'fardo'; // fardo | tampa | preforma
    const responsavel  = params.responsavel || '';

    // Calcula total de unidades conforme tipo
    let totalUnidades = 0;
    if (tipo === 'fardo') {
      totalUnidades = parseInt(params.totalUnidades) || 0;
    } else if (tipo === 'tampa') {
      // tampas: caixas × fator/caixa (fator ainda não configurado → salva caixas)
      totalUnidades = (parseInt(params.cxFechadas)||0) + (parseInt(params.cxAbertas)||0);
    } else if (tipo === 'preforma') {
      // pré-formas: caixas fechadas + (abertas × % / 100)
      const fechadas = parseInt(params.cxFechadas) || 0;
      const abertas  = parseInt(params.cxAbertas)  || 0;
      const pct      = parseFloat(params.pctAberta) || 100;
      totalUnidades  = Math.round(fechadas + abertas * (pct / 100));
    }

    if (!itemNome) return resp('itemNome obrigatório', false);
    if (totalUnidades < 1) return resp('Quantidade inválida', false);

    const headers = {
      'access_token':        GC.token,
      'secret_access_token': GC.secret,
      'Content-Type':        'application/json'
    };

    // Busca lista de produtos do GC
    const resProd = UrlFetchApp.fetch(`${GC.url}/produtos?limite=500`, { headers, muteHttpExceptions:true });
    if (resProd.getResponseCode() !== 200) return resp('Erro ao buscar produtos do GC: HTTP '+resProd.getResponseCode(), false);

    const produtos = JSON.parse(resProd.getContentText()).data || [];

    // Encontra produto por itemId (SKU) ou por palavras-chave do nome
    const idLower = itemId.toLowerCase();

    // Extrai tokens relevantes (>= 2 chars, sem palavras vazias)
    const tokens = itemNome.toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    let produto = null;

    // Estratégia 1: SKU exato (campo codigo)
    produto = produtos.find(p => (p.codigo || '').toLowerCase() === idLower);

    // Estratégia 2: todos os tokens presentes no nome do GC
    if (!produto && tokens.length) {
      produto = produtos.find(p => {
        const pn = (p.nome || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ');
        return tokens.every(t => pn.includes(t));
      });
    }

    // Estratégia 3: maioria dos tokens (>=60%) para tolerar pequenas divergências
    if (!produto && tokens.length) {
      produto = produtos.find(p => {
        const pn = (p.nome || '').toLowerCase().replace(/[^a-z0-9\s]/gi, ' ');
        const matches = tokens.filter(t => pn.includes(t)).length;
        return matches / tokens.length >= 0.6;
      });
    }

    // Log para debug — mostra nomes disponíveis no GC quando não encontra
    if (!produto) {
      const nomes = produtos.slice(0, 30).map(p => p.nome).join(' | ');
      Logger.log('❌ Não encontrado: "' + itemNome + '" | Tokens: ' + tokens.join(',') + ' | GC nomes: ' + nomes);
      return resp('Produto não encontrado no GC: "' + itemNome + '" — verifique o log do Apps Script para ver os nomes cadastrados', false);
    }

    // Atualiza estoque: substitui pelo valor contado (Modelo A — contagem)
    const estoqueAtual = gcNum(produto.estoque);
    const novoEstoque  = totalUnidades;

    const putRes = UrlFetchApp.fetch(`${GC.url}/produtos/${produto.id}`, {
      method: 'PUT',
      headers,
      payload: JSON.stringify({ estoque: String(novoEstoque) }),
      muteHttpExceptions: true
    });

    const code = putRes.getResponseCode();
    if (code < 200 || code > 299) {
      return resp('GC PUT falhou: HTTP '+code+' — '+putRes.getContentText().slice(0,200), false);
    }

    // Salva log do lançamento (últimos 100)
    const logKey = 'lancamentos_estoque';
    let logs = [];
    try { logs = JSON.parse(PropertiesService.getScriptProperties().getProperty(logKey) || '[]'); } catch(_){}
    logs.unshift({
      data:        Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
      responsavel,
      tipo,
      item:        produto.nome,
      quantidade:  totalUnidades,
      estoque_ant: estoqueAtual,
      estoque_novo: novoEstoque
    });
    PropertiesService.getScriptProperties().setProperty(logKey, JSON.stringify(logs.slice(0, 100)));

    // Invalida cache do GC para forçar atualização
    PropertiesService.getScriptProperties().deleteProperty('gc_cache');

    Logger.log('✅ Lançamento: '+produto.nome+' | +'+totalUnidades+' un | novo: '+novoEstoque);
    return resp({ produto: produto.nome, estoque_anterior: estoqueAtual, estoque_novo: novoEstoque, quantidade_lancada: totalUnidades }, true);

  } catch(e) {
    Logger.log('❌ lancarEstoqueGC_: '+e.message);
    return resp(e.message, false);
  }
}

// ── Alertas ───────────────────────────────────────────────────
function alertaRoasShopee(roas, campanha) {
  if (roas >= METAS.roas_shopee_min) return;
  enviarTodos(
`🚨 *ALERTA — ROAS Shopee baixo*
Campanha: *${campanha}*
ROAS atual: *${roas.toFixed(2)}x* (mínimo: ${METAS.roas_shopee_min}x)
Ação: Revisar criativos e segmentação urgente.`);
}

function alertaSaldoShopee(saldo) {
  if (saldo > METAS.shopee_saldo_alerta) return;
  enviarTodos(
`⚠️ *ALERTA — Saldo Shopee ADS crítico*
Saldo atual: *R$ ${saldo}*
Recarregue antes que as campanhas sejam pausadas.`);
}

// ── WhatsApp ──────────────────────────────────────────────────
function enviarTodos(mensagem) {
  DESTINATARIOS.forEach(numero => enviarWA(numero, mensagem));
}

function enviarWA(numero, mensagem) {
  try {
    const url  = `${WA.url}/waInstance${WA.instance}/sendMessage/${WA.token}`;
    const body = JSON.stringify({ chatId: numero + '@c.us', message: mensagem });
    UrlFetchApp.fetch(url, {
      method: 'POST', contentType: 'application/json',
      payload: body, muteHttpExceptions: true
    });
    Logger.log('✅ WhatsApp enviado para ' + numero);
  } catch(e) {
    Logger.log('❌ Erro WhatsApp: ' + e.message);
  }
}

function testarWhatsApp() {
  enviarWA(DESTINATARIOS[0], '✅ *Teste Montenegro Dashboard*\nWhatsApp integrado com sucesso via Green API!');
}

// ── Helpers ───────────────────────────────────────────────────

// Verifica se uma linha é uma resposta real de formulário
// Coluna 0 = Timestamp do Google Forms — sempre preenchida em respostas reais
function _linhaReal(row) {
  return row[0] && String(row[0]).trim() !== '' && String(row[0]).trim() !== '0';
}

// Retorna a última linha com conteúdo real (pelo timestamp, coluna 0)
function ultimaLinha(sheetId, gid) {
  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = gid != null
    ? (ss.getSheets().find(s => s.getSheetId() === gid) || ss.getSheets()[0])
    : ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (_linhaReal(data[i])) return data[i];
  }
  return Array(20).fill('');
}

// Retorna TODOS os registros da data mais recente (manhã + tarde + etc.)
// Usa coluna 2 da produção (Data de hoje) para agrupar turnos do mesmo dia
function linhasDoDia(sheetId, gid) {
  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = gid != null
    ? (ss.getSheets().find(s => s.getSheetId() === gid) || ss.getSheets()[0])
    : ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();

  // Acha a data do último registro real (coluna 2 = "Data de hoje" dd/MM/yyyy)
  let dataReferencia = '';
  for (let i = data.length - 1; i >= 1; i--) {
    if (_linhaReal(data[i])) {
      dataReferencia = String(data[i][2]).trim();
      break;
    }
  }
  if (!dataReferencia) return [];

  // Coleta todas as linhas com essa mesma data
  const registros = [];
  for (let i = 1; i < data.length; i++) {
    if (_linhaReal(data[i]) && String(data[i][2]).trim() === dataReferencia) {
      registros.push(data[i]);
    }
  }
  return registros;
}

function toNum(val) {
  const n = parseFloat(String(val).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// ── Configura todos os triggers — rode UMA VEZ ───────────────
function configurarTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Resumo diário às 18h
  ScriptApp.newTrigger('resumoDiario18h')
    .timeBased().atHour(18).everyDays(1)
    .inTimezone('America/Sao_Paulo').create();

  // Sync Gestão Click a cada 10 minutos
  ScriptApp.newTrigger('syncGestaoClick')
    .timeBased().everyMinutes(10).create();

  // onFormSubmit para cada planilha
  Object.values(IDS).forEach(id => {
    if (!id) return;
    try {
      ScriptApp.newTrigger('onFormSubmitHandler')
        .forSpreadsheet(SpreadsheetApp.openById(id))
        .onFormSubmit().create();
    } catch(e) { Logger.log('Trigger form: ' + e.message); }
  });

  Logger.log('✅ Todos os triggers configurados!');
}
