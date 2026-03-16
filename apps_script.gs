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

    // ── Monta objeto final ───────────────────────────────────
    const gcData = {
      atualizado_em: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
      vendas: {
        pedidos_mes:  pedidosMes,
        receita_mes:  Math.round(receitaMes * 100) / 100,
        ticket_medio: Math.round(ticketMedio * 100) / 100
      },
      estoque: {
        total_skus:       totalSkus,
        zerados:          zerados.length,
        criticos:         criticos.length,
        inventario_custo: Math.round(inventarioCusto * 100) / 100,
        zerados_nomes:    zeradosNomes,
        criticos_nomes:   criticosNomes
      },
      financeiro: {
        recebimentos_mes: Math.round(recebimentosMes * 100) / 100,
        recebido_mes:     Math.round(recebidoMes * 100) / 100,
        pagamentos_mes:   Math.round(pagamentosMes * 100) / 100,
        pago_mes:         Math.round(pagoMes * 100) / 100,
        saldo_mes:        Math.round((recebidoMes - pagoMes) * 100) / 100
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

// ── doGet — endpoint principal do dashboard ───────────────────
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'lastSubmit') {
    const ts = PropertiesService.getScriptProperties().getProperty('last_form_submit') || '';
    return ContentService
      .createTextOutput(JSON.stringify({ last_submit: ts }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Retorna todos os dados: planilhas + Gestão Click
  return ContentService
    .createTextOutput(JSON.stringify(buildJSON()))
    .setMimeType(ContentService.MimeType.JSON);
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

// Retorna a última linha com conteúdo real (coluna 1 = quem preencheu)
function ultimaLinha(sheetId, gid) {
  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = gid != null
    ? (ss.getSheets().find(s => s.getSheetId() === gid) || ss.getSheets()[0])
    : ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] && String(data[i][1]).trim() !== '') return data[i];
  }
  return Array(20).fill('');
}

// Retorna TODOS os registros da data mais recente (manhã + tarde + etc.)
function linhasDoDia(sheetId, gid) {
  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = gid != null
    ? (ss.getSheets().find(s => s.getSheetId() === gid) || ss.getSheets()[0])
    : ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();

  // Acha a data do último registro real (coluna 2 = Data de hoje, ex: "16/03/2026")
  let dataReferencia = '';
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] && String(data[i][1]).trim() !== '') {
      dataReferencia = String(data[i][2]).trim();
      break;
    }
  }
  if (!dataReferencia) return [];

  // Coleta todas as linhas com essa mesma data
  const registros = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim() === dataReferencia && data[i][1] && String(data[i][1]).trim() !== '') {
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
