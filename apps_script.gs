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
  url:      'https://SEU_ID.api.greenapi.com', // ex: https://7107.api.greenapi.com
  instance: 'SEU_ID_INSTANCIA',               // ex: 7107547894
  token:    'SEU_TOKEN_GREENAPI'               // apiTokenInstance do painel Green API
};

// Números que recebem os alertas (formato: 55XXXXXXXXXXX)
const DESTINATARIOS = [
  '55XXXXXXXXXXX' // ex: 5527996461883
];

// Metas para alertas
const METAS = {
  roas_shopee_min: 15,
  roas_shopee_meta: 20,
  roas_meta_min: 5,
  shopee_saldo_alerta: 80
};

// ── Monta JSON consolidado ────────────────────────────────────
function buildJSON() {
  const now   = new Date();
  const hoje  = Utilities.formatDate(now, 'America/Sao_Paulo', 'dd/MM/yyyy');
  const prod  = ultimaLinha(IDS.producao, GIDS.producao);
  const exp   = ultimaLinha(IDS.expedicao, GIDS.expedicao);
  const reu   = ultimaLinha(IDS.reuniao);

  const devSheet = SpreadsheetApp.openById(IDS.devolucoes).getSheets()[0];
  const devRows  = devSheet.getDataRange().getValues().slice(1);
  const devHoje  = devRows.filter(r => String(r[4]).startsWith(hoje.slice(0,5)));

  let prospeccao = { vendedor:'', prospeccoes:0, followups:0, orcamentos:0, valor_fechado:0, obs:'' };
  if (IDS.prospeccao) {
    const pro  = ultimaLinha(IDS.prospeccao);
    prospeccao = {
      vendedor: pro[1]||'', prospeccoes: toNum(pro[2]), followups: toNum(pro[3]),
      orcamentos: toNum(pro[4]), valor_fechado: toNum(pro[5]), obs: pro[6]||''
    };
  }

  return {
    atualizado_em: Utilities.formatDate(now, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'),
    producao: {
      quem: prod[1]||'', turno: prod[3]||'',
      realizado: toNum(prod[5]), perda_kg: toNum(prod[6]), perda_un: toNum(prod[7]),
      molde: prod[8]||'', troca: String(prod[9]||'Não'), obs: prod[10]||''
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
    prospeccao
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

  const totalPedidos = (exp.pedidos_1impressao || 0) + (exp.pedidos_3impressao || 0);

  const msg =
`🏭 *Montenegro Industria LTDA*
📅 Fechamento ${d.atualizado_em}
━━━━━━━━━━━━━━━━━━━━

📦 *PRODUÇÃO*
▸ Realizado: ${prod.realizado.toLocaleString('pt-BR')} un
▸ Perdas: ${prod.perda_un} un (${prod.perda_kg} kg)
▸ Molde: ${prod.molde || '—'}

📤 *EXPEDIÇÃO*
▸ Total pedidos: ${totalPedidos}
▸ Devoluções hoje: ${dev.total_dia}
▸ Horas extras: ${reu.horas_extras}
${exp.atraso !== 'Não' ? '⚠️ Atraso identificado' : '✅ Sem atrasos'}

💼 *COMERCIAL*
▸ Prospecções: ${pro.prospeccoes}/30
▸ Orçamentos: ${pro.orcamentos}
▸ Fechado hoje: R$ ${pro.valor_fechado.toLocaleString('pt-BR')}

_Enviado automaticamente — Sistema Montenegro_`;

  enviarTodos(msg);
}

// ── Dispara ao receber envio de formulário ────────────────────
function onFormSubmitHandler(e) {
  const dados = buildJSON();

  // Salva timestamp do último envio para que o serviço local detecte mudança
  PropertiesService.getScriptProperties().setProperty(
    'last_form_submit',
    new Date().toISOString()
  );

  // Identifica qual formulário foi enviado pelo nome da planilha
  let setor = 'Formulário';
  try {
    const sheetName = e.source.getName();
    if (sheetName.toLowerCase().includes('producao') || sheetName.toLowerCase().includes('produção')) setor = '📦 Produção';
    else if (sheetName.toLowerCase().includes('expedicao') || sheetName.toLowerCase().includes('expedição')) setor = '📤 Expedição';
    else if (sheetName.toLowerCase().includes('reuniao') || sheetName.toLowerCase().includes('reunião')) setor = '🕒 Reunião 15h';
    else if (sheetName.toLowerCase().includes('devolucao') || sheetName.toLowerCase().includes('devolução')) setor = '↩️ Devoluções';
    else if (sheetName.toLowerCase().includes('prospeccao') || sheetName.toLowerCase().includes('prospecção')) setor = '💼 Prospecção';
  } catch(_) {}

  // Notificação WhatsApp de atualização (silenciosa — só 1 linha)
  const now = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'HH:mm');
  enviarTodos(`✅ *${setor}* atualizado às ${now} — dashboard disponível`);
}

// ── Endpoint para checar se houve novo form submit ────────────
// O serviço local chama /lastSubmit para saber se deve recarregar
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'lastSubmit') {
    const ts = PropertiesService.getScriptProperties()
      .getProperty('last_form_submit') || '';
    return ContentService
      .createTextOutput(JSON.stringify({ last_submit: ts }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Padrão: retorna dados completos
  return ContentService
    .createTextOutput(JSON.stringify(buildJSON()))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Alerta ROAS Shopee abaixo do mínimo ───────────────────────
function alertaRoasShopee(roas, campanha) {
  if (roas >= METAS.roas_shopee_min) return;
  const msg =
`🚨 *ALERTA — ROAS Shopee baixo*
Campanha: *${campanha}*
ROAS atual: *${roas.toFixed(2)}x* (mínimo: ${METAS.roas_shopee_min}x)
Ação: Revisar criativos e segmentação urgente.`;
  enviarTodos(msg);
}

// ── Alerta saldo Shopee ADS ───────────────────────────────────
function alertaSaldoShopee(saldo) {
  if (saldo > METAS.shopee_saldo_alerta) return;
  const msg =
`⚠️ *ALERTA — Saldo Shopee ADS crítico*
Saldo atual: *R$ ${saldo}*
Recarregue antes que as campanhas sejam pausadas.`;
  enviarTodos(msg);
}

// ── Envia mensagem para todos os destinatários ────────────────
function enviarTodos(mensagem) {
  DESTINATARIOS.forEach(numero => enviarWA(numero, mensagem));
}

// ── Green API — envia mensagem WhatsApp ───────────────────────
function enviarWA(numero, mensagem) {
  try {
    const url  = `${WA.url}/waInstance${WA.instance}/sendMessage/${WA.token}`;
    const body = JSON.stringify({ chatId: numero + '@c.us', message: mensagem });
    UrlFetchApp.fetch(url, {
      method: 'POST',
      contentType: 'application/json',
      payload: body,
      muteHttpExceptions: true
    });
    Logger.log('✅ WhatsApp enviado para ' + numero);
  } catch(e) {
    Logger.log('❌ Erro WhatsApp: ' + e.message);
  }
}

// ── Teste — rode para verificar se o WhatsApp está funcionando
function testarWhatsApp() {
  enviarWA(DESTINATARIOS[0],
    '✅ *Teste Montenegro Dashboard*\nWhatsApp integrado com sucesso via Green API!');
}

// ── Helpers ──────────────────────────────────────────────────
function ultimaLinha(sheetId, gid) {
  const ss    = SpreadsheetApp.openById(sheetId);
  const sheet = gid != null
    ? (ss.getSheets().find(s => s.getSheetId() === gid) || ss.getSheets()[0])
    : ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();
  return data.length > 1 ? data[data.length - 1] : Array(20).fill('');
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
